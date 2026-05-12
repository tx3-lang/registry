use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::error::{Error, Result};

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Config {
    pub upstream: UpstreamConfig,
    pub storage: StorageConfig,
    #[serde(default)]
    pub sources: Vec<SourceConfig>,
}

/// Where the tracker pulls chain data from.
///
/// Holds the gRPC endpoint, optional auth, the resume point, and an optional
/// `filter` block that narrows what the upstream forwards to us (server-side
/// pre-filter via `WatchTx`'s `TxPredicate`).
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct UpstreamConfig {
    pub endpoint: String,
    #[serde(default)]
    pub api_key: Option<String>,
    #[serde(default)]
    pub intersect: Intersect,
    #[serde(default)]
    pub filter: UpstreamFilter,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(untagged)]
pub enum Intersect {
    Tag(IntersectTag),
    Point { slot: u64, hash: String },
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum IntersectTag {
    Tip,
}

impl Default for Intersect {
    fn default() -> Self {
        Self::Tag(IntersectTag::Tip)
    }
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct StorageConfig {
    pub database_url: String,
}

/// Server-side pre-filter applied to the WatchTx stream. Empty = forward
/// every tx; populated = forward only txs that match at least one alternative.
#[derive(Debug, Clone, Default, Deserialize, Serialize)]
pub struct UpstreamFilter {
    /// Match txs that consume or produce a UTxO at any of these bech32 addresses.
    #[serde(default)]
    pub addresses: Vec<String>,
    /// Match txs that move (mint, burn, or transfer) any asset under this policy id (hex).
    #[serde(default)]
    pub moves_policy_id: Option<String>,
    /// Match txs that mint or burn any asset under this policy id (hex).
    #[serde(default)]
    pub mints_policy_id: Option<String>,
}

impl UpstreamFilter {
    pub fn is_empty(&self) -> bool {
        self.addresses.is_empty()
            && self.moves_policy_id.is_none()
            && self.mints_policy_id.is_none()
    }
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct SourceConfig {
    pub name: String,
    pub tii_path: PathBuf,
    pub profile: String,
}

pub fn load(path: impl AsRef<Path>) -> Result<Config> {
    let contents = std::fs::read_to_string(path.as_ref())?;
    let mut cfg: Config = toml::from_str(&contents)?;
    if let Ok(url) = std::env::var("DATABASE_URL") {
        cfg.storage.database_url = url;
    }
    if cfg.sources.is_empty() {
        return Err(Error::Config(
            "at least one [[sources]] entry is required".to_string(),
        ));
    }
    Ok(cfg)
}
