//! OCI registry discovery for the tracker.
//!
//! This module owns all interaction with the Zot OCI registry. At startup it
//! queries the registry's GraphQL extension (`/_zot/ext/search`) to obtain the
//! full list of published protocols, applies the allow/deny filters defined in
//! `OciConfig`, pulls the `application/tii+json` layer for each surviving
//! protocol, and resolves the TII profile name (default or per-protocol
//! override). The result is a `Vec<DiscoveredSource>` handed to
//! `specialization::specialize_all`.
//!
//! The two pure helpers (`apply_filters` and `resolve_profile`) contain no I/O
//! and are unit-tested in-file. The network path (`fetch_catalog` and its
//! private sub-functions) are also in this module.

use oci_client::{client::ClientConfig, secrets::RegistryAuth, Client as OciClient, Reference};
use serde::Deserialize;
use tracing::{info, warn};
use tx3_sdk::tii::spec::TiiFile;

use crate::config::OciConfig;
use crate::error::{Error, Result};

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/// One discovered protocol, ready to be specialized.
#[derive(Debug, Clone)]
pub struct DiscoveredSource {
    /// Full OCI reference: `scope/name:version`. Stored as `source_name` in
    /// the `matches` table.
    pub source_name: String,
    /// OCI repository scope (e.g. `"txpipe"`).
    pub scope: String,
    /// Protocol name without scope (e.g. `"orcfax-burn"`).
    pub name: String,
    /// OCI tag / protocol version (e.g. `"1.0.0"`).
    pub version: String,
    pub tii: TiiFile,
    pub profile_name: String,
}

// ---------------------------------------------------------------------------
// Internal helper types
// ---------------------------------------------------------------------------

/// Lightweight summary of one OCI repository as returned (or assembled) from
/// the Zot GraphQL catalog. Used purely for the filter pass; intentionally
/// does not mirror the wire shape so the filter logic stays pure-testable
/// without any HTTP or GraphQL machinery.
#[derive(Debug, Clone, PartialEq)]
struct RepoSummary {
    /// Full `scope/name` string (e.g. `"txpipe/orcfax-burn"`).
    name: String,
    /// Scope portion derived from the first path component of `name`
    /// (e.g. `"txpipe"`). This is the authoritative value used for filtering
    /// and `DiscoveredSource` construction.
    scope: String,
    /// Most-recent OCI tag (e.g. `"1.0.0"`).
    tag: String,
    /// Raw `Vendor` annotation from the manifest, if present. Carried purely
    /// to emit a warning when it disagrees with the path-derived `scope`.
    vendor: Option<String>,
}

// ---------------------------------------------------------------------------
// GraphQL wire types (private — mirrors backend/src/oci.rs for
// RepoListWithNewestImage instead of GlobalSearch/ExpandedRepoInfo)
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
struct ZotResponse {
    data: Option<ZotData>,
    errors: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
struct ZotData {
    #[serde(rename = "RepoListWithNewestImage")]
    repo_list_with_newest_image: Option<RepoListWithNewestImage>,
}

#[derive(Debug, Deserialize)]
struct RepoListWithNewestImage {
    #[serde(rename = "Page")]
    page: PageInfo,
    #[serde(rename = "Results")]
    results: Vec<RepoSummaryWire>,
}

#[derive(Debug, Deserialize)]
struct PageInfo {
    #[serde(rename = "TotalCount")]
    #[allow(dead_code)]
    total_count: i64,
    #[serde(rename = "ItemCount")]
    item_count: i64,
}

#[derive(Debug, Deserialize)]
struct RepoSummaryWire {
    #[serde(rename = "Name")]
    name: String,
    #[serde(rename = "NewestImage")]
    newest_image: NewestImage,
}

#[derive(Debug, Deserialize)]
struct NewestImage {
    #[serde(rename = "Tag")]
    tag: Option<String>,
    #[serde(rename = "Vendor")]
    vendor: Option<String>,
}

// ---------------------------------------------------------------------------
// Network helpers
// ---------------------------------------------------------------------------

const LIMIT: i64 = 100;
const TII_MEDIA_TYPE: &str = "application/tii+json";
// Layer media types `trix publish` may produce alongside the TII. We don't
// consume the protocol source or README, but oci-client's `pull` validates
// every layer against `accepted_media_types` before returning, so they must
// all be listed or the whole pull errors with `IncompatibleLayerMediaType`.
const PROTOCOL_MEDIA_TYPE: &str = "application/tx3";
const MARKDOWN_MEDIA_TYPE: &str = "text/markdown";

/// Derive the `oci_client::client::ClientProtocol` from a registry URL string.
fn oci_protocol(registry_url: &str) -> oci_client::client::ClientProtocol {
    if registry_url.starts_with("http://") {
        oci_client::client::ClientProtocol::Http
    } else {
        oci_client::client::ClientProtocol::Https
    }
}

/// Strip the URL scheme to get the bare `host[:port]` used inside an
/// `oci_client::Reference`. Mirrors `backend/src/oci.rs::get_oci_image`.
fn registry_host(registry_url: &str) -> &str {
    registry_url
        .split_once("://")
        .map(|(_, host)| host)
        .unwrap_or(registry_url)
}

/// Paginated `RepoListWithNewestImage` GraphQL query against Zot.
///
/// Loops in steps of `LIMIT` until `Page.ItemCount < LIMIT`. Returns the
/// assembled list of `RepoSummary` values (tag-less entries are skipped with a
/// warning).
async fn query_repo_list(
    http: &reqwest::Client,
    base_url: &str,
) -> Result<Vec<RepoSummary>> {
    let mut repos: Vec<RepoSummary> = Vec::new();
    let mut offset: i64 = 0;

    loop {
        let query_body = format!(
            r#"{{ RepoListWithNewestImage(requestedPage: {{ limit: {LIMIT}, offset: {offset} }}) {{ Page {{ TotalCount ItemCount }} Results {{ Name NewestImage {{ Tag Vendor }} }} }} }}"#
        );
        let encoded = urlencoding::encode(&query_body);
        let url = format!("{base_url}/v2/_zot/ext/search?query={encoded}");

        let resp: ZotResponse = http
            .get(&url)
            .send()
            .await?
            .error_for_status()?
            .json()
            .await?;

        // Surface GraphQL-level errors as a Config error so operators can read
        // them in the log (schema drift, auth issues, etc.).
        if resp.data.is_none() {
            if let Some(errs) = resp.errors {
                return Err(Error::Config(format!(
                    "zot returned graphql errors: {errs}"
                )));
            }
            // data is null and errors is also null — treat as empty page.
            break;
        }

        let page_data = resp
            .data
            .unwrap()
            .repo_list_with_newest_image
            .ok_or_else(|| {
                Error::Config(
                    "zot response missing RepoListWithNewestImage field".to_string(),
                )
            })?;

        let item_count = page_data.page.item_count;

        for wire in page_data.results {
            let tag = match wire.newest_image.tag {
                Some(t) if !t.is_empty() => t,
                _ => {
                    warn!(repo = %wire.name, "skipping repo: no tag in NewestImage");
                    continue;
                }
            };
            let scope = wire.name
                .split_once('/')
                .map(|(s, _)| s.to_string())
                .unwrap_or_default();
            let vendor = wire.newest_image.vendor;
            repos.push(RepoSummary {
                name: wire.name,
                scope,
                tag,
                vendor,
            });
        }

        if item_count < LIMIT {
            break;
        }
        offset += LIMIT;
    }

    Ok(repos)
}

/// Pull the `application/tii+json` layer from an OCI image and decode it.
async fn pull_tii(
    oci: &OciClient,
    registry_host_str: &str,
    scope: &str,
    name: &str,
    version: &str,
) -> Result<TiiFile> {
    let reference =
        Reference::try_from(format!("{registry_host_str}/{scope}/{name}:{version}"))
            .map_err(|e| Error::Config(format!("invalid OCI reference: {e}")))?;

    let image = oci
        .pull(
            &reference,
            &RegistryAuth::Anonymous,
            vec![TII_MEDIA_TYPE, PROTOCOL_MEDIA_TYPE, MARKDOWN_MEDIA_TYPE],
        )
        .await?;

    let layer = image
        .layers
        .iter()
        .find(|l| l.media_type == TII_MEDIA_TYPE)
        .ok_or_else(|| {
            Error::Config(format!(
                "protocol {scope}/{name}:{version} has no application/tii+json layer"
            ))
        })?;

    let tii = serde_json::from_slice::<TiiFile>(&layer.data).map_err(|e| {
        crate::error::Error::Config(format!(
            "failed to decode tii+json layer for {scope}/{name}:{version}: {e}"
        ))
    })?;
    Ok(tii)
}

// ---------------------------------------------------------------------------
// Public async entry point
// ---------------------------------------------------------------------------

/// Query Zot, apply filters, fetch each protocol's TII layer, and resolve
/// the profile name. Returns the full catalog of protocols the tracker should
/// match against.
///
/// Errors if the registry is unreachable, the catalog is empty, every
/// protocol is filtered out, or any individual protocol fails to pull/decode.
pub async fn fetch_catalog(oci: &OciConfig, default_profile: &str) -> Result<Vec<DiscoveredSource>> {
    let http = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .expect("failed to build HTTP client");
    let oci_client = OciClient::new(ClientConfig {
        protocol: oci_protocol(&oci.registry_url),
        ..Default::default()
    });

    let host = registry_host(&oci.registry_url);

    let repos = query_repo_list(&http, &oci.registry_url).await?;
    info!(total = repos.len(), "fetched repo list from OCI registry");

    let filtered = apply_filters(repos, oci);
    info!(filtered = filtered.len(), "repos after allow/deny filter");

    let mut discovered: Vec<DiscoveredSource> = Vec::new();

    for repo in filtered {
        // Split full `scope/name` path into components.
        let (repo_scope, name_only) = match repo.name.split_once('/') {
            Some((s, n)) => (s.to_string(), n.to_string()),
            None => {
                warn!(repo = %repo.name, "skipping repo: name has no '/' separator");
                continue;
            }
        };

        // The manifest `Vendor` field is operator-set and untrusted. Prefer
        // the path-derived scope; log a warning when they disagree.
        if let Some(v) = &repo.vendor {
            if v != &repo_scope {
                warn!(
                    repo = %repo.name,
                    vendor = %v,
                    path_scope = %repo_scope,
                    "Vendor disagrees with repo path scope; using path scope"
                );
            }
        }

        let tii = pull_tii(&oci_client, host, &repo_scope, &name_only, &repo.tag).await?;
        let profile_name = resolve_profile(&repo_scope, &name_only, oci, default_profile);

        discovered.push(DiscoveredSource {
            source_name: format!("{repo_scope}/{name_only}:{}", repo.tag),
            scope: repo_scope,
            name: name_only,
            version: repo.tag,
            tii,
            profile_name,
        });
    }

    if discovered.is_empty() {
        return Err(Error::Config(
            "OCI registry returned no protocols (catalog empty or all filtered out)".to_string(),
        ));
    }

    Ok(discovered)
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/// Apply the allow/deny filter from `oci` to a list of repositories.
///
/// Semantics (from spec "Config schema"):
/// - If **both** `include_scopes` and `include_names` are empty: all repos
///   pass the include phase (allow-all).
/// - Otherwise: a repo passes the include phase if its scope is in
///   `include_scopes` **or** its `scope/name` is in `include_names`.
/// - Excludes are applied after includes: a repo is dropped if its scope is
///   in `exclude_scopes` **or** its `scope/name` is in `exclude_names`.
/// - Exclude always wins over include.
fn apply_filters(repos: Vec<RepoSummary>, oci: &OciConfig) -> Vec<RepoSummary> {
    let include_all =
        oci.include_scopes.is_empty() && oci.include_names.is_empty();

    repos
        .into_iter()
        .filter(|r| {
            // Include phase
            if !include_all {
                let scope_ok = oci.include_scopes.iter().any(|s| s == &r.scope);
                let name_ok = oci.include_names.iter().any(|n| n == &r.name);
                if !scope_ok && !name_ok {
                    return false;
                }
            }

            // Exclude phase (wins over include)
            let excluded_scope = oci.exclude_scopes.iter().any(|s| s == &r.scope);
            let excluded_name = oci.exclude_names.iter().any(|n| n == &r.name);
            !excluded_scope && !excluded_name
        })
        .collect()
}

/// Resolve the TII profile name for a specific protocol.
///
/// Walks `oci.profile_override`; returns the `profile` field of the first
/// entry whose `match_` equals `"scope/name"`. If no override matches,
/// returns `default`.
fn resolve_profile(scope: &str, name: &str, oci: &OciConfig, default: &str) -> String {
    let target = format!("{scope}/{name}");
    for ov in &oci.profile_override {
        if ov.match_ == target {
            return ov.profile.clone();
        }
    }
    default.to_string()
}

// ---------------------------------------------------------------------------
// Unit tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::{OciConfig, ProfileOverride};

    fn oci_empty() -> OciConfig {
        OciConfig {
            registry_url: "http://localhost:3000".to_string(),
            include_scopes: vec![],
            include_names: vec![],
            exclude_scopes: vec![],
            exclude_names: vec![],
            profile_override: vec![],
        }
    }

    fn repo(scope: &str, short_name: &str, tag: &str) -> RepoSummary {
        RepoSummary {
            name: format!("{scope}/{short_name}"),
            scope: scope.to_string(),
            tag: tag.to_string(),
            vendor: None,
        }
    }

    // ------------------------------------------------------------------
    // apply_filters tests
    // ------------------------------------------------------------------

    #[test]
    fn apply_filters_no_lists_is_identity() {
        let oci = oci_empty();
        let repos = vec![
            repo("txpipe", "transfer", "1.0.0"),
            repo("txpipe", "orcfax-burn", "2.0.0"),
            repo("acme", "widget", "0.1.0"),
        ];
        let expected = repos.clone();
        assert_eq!(apply_filters(repos, &oci), expected);
    }

    #[test]
    fn apply_filters_include_scopes_keeps_only_matching() {
        let mut oci = oci_empty();
        oci.include_scopes = vec!["txpipe".to_string()];

        let repos = vec![
            repo("txpipe", "transfer", "1.0.0"),
            repo("acme", "widget", "0.1.0"),
        ];
        let result = apply_filters(repos, &oci);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].scope, "txpipe");
    }

    #[test]
    fn apply_filters_include_names_keeps_only_matching() {
        let mut oci = oci_empty();
        oci.include_names = vec!["txpipe/transfer".to_string()];

        let repos = vec![
            repo("txpipe", "transfer", "1.0.0"),
            repo("txpipe", "orcfax-burn", "2.0.0"),
        ];
        let result = apply_filters(repos, &oci);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].name, "txpipe/transfer");
    }

    #[test]
    fn apply_filters_includes_are_union() {
        let mut oci = oci_empty();
        oci.include_scopes = vec!["txpipe".to_string()];
        oci.include_names = vec!["acme/widget".to_string()];

        let repos = vec![
            repo("txpipe", "transfer", "1.0.0"),
            repo("acme", "widget", "0.1.0"),
            repo("other", "thing", "3.0.0"),
        ];
        let result = apply_filters(repos, &oci);
        assert_eq!(result.len(), 2);
        let names: Vec<&str> = result.iter().map(|r| r.name.as_str()).collect();
        assert!(names.contains(&"txpipe/transfer"));
        assert!(names.contains(&"acme/widget"));
    }

    #[test]
    fn apply_filters_exclude_scopes_drops_matching() {
        let mut oci = oci_empty();
        oci.exclude_scopes = vec!["acme".to_string()];

        let repos = vec![
            repo("txpipe", "transfer", "1.0.0"),
            repo("acme", "widget", "0.1.0"),
        ];
        let result = apply_filters(repos, &oci);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].scope, "txpipe");
    }

    #[test]
    fn apply_filters_exclude_names_drops_matching() {
        let mut oci = oci_empty();
        oci.exclude_names = vec!["txpipe/transfer".to_string()];

        let repos = vec![
            repo("txpipe", "orcfax-burn", "1.0.0"),
            repo("txpipe", "transfer", "1.0.0"),
        ];
        let result = apply_filters(repos, &oci);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].name, "txpipe/orcfax-burn");
    }

    #[test]
    fn apply_filters_exclude_wins_over_include() {
        let mut oci = oci_empty();
        oci.include_scopes = vec!["txpipe".to_string()];
        oci.exclude_names = vec!["txpipe/transfer".to_string()];

        let repos = vec![
            repo("txpipe", "transfer", "1.0.0"),
            repo("txpipe", "orcfax-burn", "2.0.0"),
        ];
        let result = apply_filters(repos, &oci);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].name, "txpipe/orcfax-burn");
    }

    // ------------------------------------------------------------------
    // registry_host (scheme stripper) tests
    // ------------------------------------------------------------------

    #[test]
    fn registry_host_strips_http_scheme() {
        assert_eq!(registry_host("http://localhost:3000"), "localhost:3000");
    }

    #[test]
    fn registry_host_strips_https_scheme() {
        assert_eq!(registry_host("https://reg.example.com"), "reg.example.com");
    }

    #[test]
    fn registry_host_strips_https_scheme_with_port() {
        assert_eq!(
            registry_host("https://reg.example.com:8443"),
            "reg.example.com:8443"
        );
    }

    // ------------------------------------------------------------------
    // resolve_profile tests
    // ------------------------------------------------------------------

    #[test]
    fn resolve_profile_falls_back_to_default_with_no_overrides() {
        let oci = oci_empty();
        let profile = resolve_profile("txpipe", "transfer", &oci, "preview");
        assert_eq!(profile, "preview");
    }

    #[test]
    fn resolve_profile_first_match_wins() {
        let mut oci = oci_empty();
        oci.profile_override = vec![
            ProfileOverride {
                match_: "txpipe/transfer".to_string(),
                profile: "mainnet".to_string(),
            },
            ProfileOverride {
                match_: "txpipe/transfer".to_string(),
                profile: "should-not-be-returned".to_string(),
            },
        ];
        let profile = resolve_profile("txpipe", "transfer", &oci, "preview");
        assert_eq!(profile, "mainnet");
    }

    #[test]
    fn resolve_profile_returns_default_when_no_override_matches() {
        let mut oci = oci_empty();
        oci.profile_override = vec![ProfileOverride {
            match_: "txpipe/orcfax-burn".to_string(),
            profile: "mainnet".to_string(),
        }];
        let profile = resolve_profile("txpipe", "transfer", &oci, "preview");
        assert_eq!(profile, "preview");
    }
}
