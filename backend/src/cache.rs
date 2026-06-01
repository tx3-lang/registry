//! A small disk-backed cache shared by the logo and OG-card routes.
//!
//! Both routes produce assets that are **immutable per published version**: the
//! OCI tag fully determines the logo bytes and the rendered card. Keying entries
//! on the resolved tag means a new publish invalidates exactly, with no staleness
//! window, while a hit skips the heavy OCI pull (and, for the card, the SVG→PNG
//! rasterization).
//!
//! Entries are stored as plain files under sanitized, human-debuggable paths
//! (`og/v1/<scope>/<name>/<tag>`), written atomically via a temp file + rename so
//! concurrent requests and process restarts never observe a torn file. The cache
//! is intentionally simple — no external cache crate — and degrades to a no-op
//! when `CACHE_DIR` is empty.

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{Duration, SystemTime};

/// A cached lookup result. `Bytes` is a stored payload; `Negative` is a
/// remembered "definitely not found" (a zero-length sentinel) so repeated
/// requests for a missing asset don't keep hitting the registry.
pub enum Cached {
    Bytes(Vec<u8>),
    Negative,
}

/// Disk cache handle. Cheap to clone (an `Option<Arc<_>>`); `None` means the
/// cache is disabled and every operation is a no-op.
#[derive(Clone)]
pub struct DiskCache {
    inner: Option<Arc<Inner>>,
}

struct Inner {
    root: PathBuf,
    ttl: Duration,
    neg_ttl: Duration,
    max_bytes: u64,
    /// Running estimate of bytes on disk; gates the (relatively expensive)
    /// eviction sweep so it doesn't run on every write.
    approx_bytes: AtomicU64,
}

const NEG_SUFFIX: &str = ".neg";
const TMP_SUFFIX: &str = ".tmp";

impl DiskCache {
    /// Build a cache from the environment, mirroring the `unwrap_or_default`
    /// convention used elsewhere. `CACHE_DIR` empty → disabled. Creates the root
    /// directory eagerly; returns an error so the caller can `expect` at launch.
    pub fn from_env() -> std::io::Result<Self> {
        let dir = std::env::var("CACHE_DIR").unwrap_or_else(|_| {
            std::env::temp_dir()
                .join("tx3-registry-cache")
                .to_string_lossy()
                .into_owned()
        });

        if dir.trim().is_empty() {
            return Ok(Self { inner: None });
        }

        let ttl = env_secs("CACHE_TTL_SECS", 86_400);
        let neg_ttl = env_secs("CACHE_NEG_TTL_SECS", 60);
        let max_bytes = std::env::var("CACHE_MAX_BYTES")
            .ok()
            .and_then(|v| v.parse::<u64>().ok())
            .unwrap_or(512 * 1024 * 1024);

        let root = PathBuf::from(dir);
        std::fs::create_dir_all(&root)?;

        Ok(Self {
            inner: Some(Arc::new(Inner {
                root,
                ttl,
                neg_ttl,
                max_bytes,
                approx_bytes: AtomicU64::new(0),
            })),
        })
    }

    /// Look up `key`. Returns `None` on a miss (or when disabled). A failed
    /// blocking task is treated as a miss — the caller simply recomputes.
    pub async fn get(&self, key: &str) -> Option<Cached> {
        let inner = self.inner.clone()?;
        let key = key.to_string();
        rocket::tokio::task::spawn_blocking(move || inner.get_sync(&key))
            .await
            .ok()
            .flatten()
    }

    /// Store `bytes` under `key`. No-op when disabled; errors are swallowed (the
    /// cache is best-effort and must never fail a request).
    pub async fn put(&self, key: &str, bytes: Vec<u8>) {
        let Some(inner) = self.inner.clone() else { return };
        let key = key.to_string();
        let _ = rocket::tokio::task::spawn_blocking(move || inner.put_sync(&key, &bytes)).await;
    }

    /// Remember that `key` is not found, with the short negative TTL.
    pub async fn put_negative(&self, key: &str) {
        let Some(inner) = self.inner.clone() else { return };
        let key = key.to_string();
        let _ = rocket::tokio::task::spawn_blocking(move || inner.put_negative_sync(&key)).await;
    }
}

impl Inner {
    fn get_sync(&self, key: &str) -> Option<Cached> {
        let base = self.path_for(key);

        // Positive entry.
        if fresh(&base, self.ttl) {
            match std::fs::read(&base) {
                Ok(bytes) => return Some(Cached::Bytes(bytes)),
                Err(_) => {
                    let _ = std::fs::remove_file(&base);
                }
            }
        } else {
            let _ = std::fs::remove_file(&base);
        }

        // Negative sentinel.
        let neg = with_suffix(&base, NEG_SUFFIX);
        if fresh(&neg, self.neg_ttl) {
            return Some(Cached::Negative);
        }
        let _ = std::fs::remove_file(&neg);

        None
    }

    fn put_sync(&self, key: &str, bytes: &[u8]) -> std::io::Result<()> {
        let path = self.path_for(key);
        self.write_atomic(&path, bytes)?;
        self.note_write(bytes.len() as u64);
        Ok(())
    }

    fn put_negative_sync(&self, key: &str) -> std::io::Result<()> {
        let neg = with_suffix(&self.path_for(key), NEG_SUFFIX);
        self.write_atomic(&neg, &[])
    }

    /// Write `bytes` to `path` via a uniquely-named temp file in the *same*
    /// directory followed by an atomic rename (so no `EXDEV`, no torn reads).
    fn write_atomic(&self, path: &Path, bytes: &[u8]) -> std::io::Result<()> {
        let parent = path.parent().unwrap_or(&self.root);
        std::fs::create_dir_all(parent)?;
        let tmp = parent.join(format!("{}{}", uuid::Uuid::new_v4(), TMP_SUFFIX));
        std::fs::write(&tmp, bytes)?;
        match std::fs::rename(&tmp, path) {
            Ok(()) => Ok(()),
            Err(e) => {
                let _ = std::fs::remove_file(&tmp);
                Err(e)
            }
        }
    }

    /// Account for a write and trigger an eviction sweep when the running
    /// estimate crosses the budget.
    fn note_write(&self, n: u64) {
        let total = self.approx_bytes.fetch_add(n, Ordering::Relaxed) + n;
        if total > self.max_bytes {
            self.evict();
        }
    }

    /// Walk the cache, reap stale temp files, and delete oldest-first until the
    /// total is under a low-water mark (~90% of the budget). Resets the running
    /// byte estimate from the post-sweep total.
    fn evict(&self) {
        let mut files: Vec<(PathBuf, SystemTime, u64)> = Vec::new();
        collect_files(&self.root, &mut files);

        let mut total: u64 = files.iter().map(|(_, _, len)| *len).sum();

        // Oldest first.
        files.sort_by_key(|(_, mtime, _)| *mtime);

        let low_water = self.max_bytes / 10 * 9;
        for (path, _, len) in &files {
            if total <= low_water {
                break;
            }
            if std::fs::remove_file(path).is_ok() {
                total = total.saturating_sub(*len);
            }
        }

        self.approx_bytes.store(total, Ordering::Relaxed);
    }

    /// Map a logical key to a filesystem path. Each `/`-separated segment is
    /// sanitized to `[A-Za-z0-9_-]` (everything else percent-encoded), so keys
    /// stay readable while `.`/`..` and other unsafe components can't escape the
    /// root.
    fn path_for(&self, key: &str) -> PathBuf {
        let mut path = self.root.clone();
        for segment in key.split('/').filter(|s| !s.is_empty()) {
            path.push(sanitize_segment(segment));
        }
        path
    }
}

/// True when `path` exists and was modified within `ttl`. Any error (missing
/// file, clock skew) is treated as not-fresh.
fn fresh(path: &Path, ttl: Duration) -> bool {
    let Ok(meta) = std::fs::metadata(path) else { return false };
    let Ok(modified) = meta.modified() else { return false };
    SystemTime::now()
        .duration_since(modified)
        .map(|age| age < ttl)
        .unwrap_or(false)
}

fn with_suffix(path: &Path, suffix: &str) -> PathBuf {
    let mut s = path.as_os_str().to_os_string();
    s.push(suffix);
    PathBuf::from(s)
}

fn collect_files(dir: &Path, out: &mut Vec<(PathBuf, SystemTime, u64)>) {
    let Ok(entries) = std::fs::read_dir(dir) else { return };
    for entry in entries.flatten() {
        let path = entry.path();
        let Ok(meta) = entry.metadata() else { continue };
        if meta.is_dir() {
            collect_files(&path, out);
        } else {
            let mtime = meta.modified().unwrap_or(SystemTime::UNIX_EPOCH);
            out.push((path, mtime, meta.len()));
        }
    }
}

fn sanitize_segment(segment: &str) -> String {
    let mut out = String::with_capacity(segment.len());
    for &b in segment.as_bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'_' | b'-' => out.push(b as char),
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

fn env_secs(var: &str, default: u64) -> Duration {
    let secs = std::env::var(var)
        .ok()
        .and_then(|v| v.parse::<u64>().ok())
        .unwrap_or(default);
    Duration::from_secs(secs)
}

#[cfg(test)]
mod tests {
    use super::*;

    // Tests exercise the synchronous `Inner` core directly — that's where all the
    // logic lives; the async `DiskCache` methods just delegate via `spawn_blocking`.
    fn inner_in(dir: &Path, ttl: Duration, neg_ttl: Duration, max_bytes: u64) -> Inner {
        Inner {
            root: dir.to_path_buf(),
            ttl,
            neg_ttl,
            max_bytes,
            approx_bytes: AtomicU64::new(0),
        }
    }

    fn tmp_dir(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("tx3-cache-test-{}-{}", tag, uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn put_get_round_trip() {
        let dir = tmp_dir("roundtrip");
        let inner = inner_in(&dir, Duration::from_secs(60), Duration::from_secs(60), 1 << 30);

        inner.put_sync("og/v1/acme/widget/1.0.0", b"PNGDATA").unwrap();
        match inner.get_sync("og/v1/acme/widget/1.0.0") {
            Some(Cached::Bytes(b)) => assert_eq!(b, b"PNGDATA"),
            _ => panic!("expected positive hit"),
        }
        assert!(inner.get_sync("og/v1/acme/widget/2.0.0").is_none());

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn positive_expires_past_ttl() {
        let dir = tmp_dir("ttl");
        let inner = inner_in(&dir, Duration::from_millis(1), Duration::from_secs(60), 1 << 30);

        inner.put_sync("logo/acme/widget/1.0.0", b"x").unwrap();
        std::thread::sleep(Duration::from_millis(10));
        assert!(inner.get_sync("logo/acme/widget/1.0.0").is_none());

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn negative_sentinel_is_cached() {
        let dir = tmp_dir("neg");
        let inner = inner_in(&dir, Duration::from_secs(60), Duration::from_secs(60), 1 << 30);

        inner.put_negative_sync("nf/acme/ghost").unwrap();
        assert!(matches!(inner.get_sync("nf/acme/ghost"), Some(Cached::Negative)));

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn negative_expires_on_short_ttl() {
        let dir = tmp_dir("neg-ttl");
        let inner = inner_in(&dir, Duration::from_secs(60), Duration::from_millis(1), 1 << 30);

        inner.put_negative_sync("nf/acme/ghost").unwrap();
        std::thread::sleep(Duration::from_millis(10));
        assert!(inner.get_sync("nf/acme/ghost").is_none());

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn eviction_drops_oldest_and_leaves_no_tmp() {
        let dir = tmp_dir("evict");
        // Budget of 30 bytes: writing several 10-byte entries forces eviction.
        let inner = inner_in(&dir, Duration::from_secs(60), Duration::from_secs(60), 30);

        for i in 0..10 {
            inner.put_sync(&format!("og/v1/acme/p{i}"), &[b'a'; 10]).unwrap();
            std::thread::sleep(Duration::from_millis(5)); // distinct mtimes
        }

        let mut files = Vec::new();
        collect_files(&dir, &mut files);
        let total: u64 = files.iter().map(|(_, _, len)| *len).sum();
        assert!(total <= 30, "cache exceeded budget: {total}");
        assert!(
            files.iter().all(|(p, _, _)| !p.to_string_lossy().ends_with(TMP_SUFFIX)),
            "left a stray temp file"
        );

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn disabled_cache_is_noop() {
        let cache = DiskCache { inner: None };
        rocket::async_test(async {
            cache.put("og/v1/acme/widget/1.0.0", b"x".to_vec()).await;
            assert!(cache.get("og/v1/acme/widget/1.0.0").await.is_none());
        });
    }

    #[test]
    fn sanitize_blocks_traversal() {
        assert_eq!(sanitize_segment(".."), "%2E%2E");
        assert_eq!(sanitize_segment("SundaeSwap-finance"), "SundaeSwap-finance");
        assert_eq!(sanitize_segment("a/b"), "a%2Fb"); // '/' never reaches here, but encoded if it did
    }
}
