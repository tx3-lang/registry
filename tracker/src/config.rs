use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::error::Result;

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Config {
    pub upstream: UpstreamConfig,
    pub storage: StorageConfig,
    pub oci: OciConfig,
}

/// Where the tracker pulls chain data from.
///
/// Holds the gRPC endpoint, optional auth, the resume point, and an optional
/// `filter` block that narrows what the upstream forwards to us (server-side
/// pre-filter via `WatchTx`'s `TxPredicate`).
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct UpstreamConfig {
    pub endpoint: String,
    /// TII profile name applied to every discovered protocol (with optional
    /// per-protocol overrides under [oci.profile_override]).
    pub profile: String,
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

/// OCI registry configuration for auto-discovering protocols and TIIs.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct OciConfig {
    pub registry_url: String,
    /// Allow only repos whose scope matches at least one entry.
    /// Empty means "allow all" (when `include_names` is also empty).
    #[serde(default)]
    pub include_scopes: Vec<String>,
    /// Allow only repos whose exact "scope/name" matches at least one entry.
    /// Empty means "allow all" (when `include_scopes` is also empty).
    #[serde(default)]
    pub include_names: Vec<String>,
    /// Exclude repos whose scope matches at least one entry (applied after includes).
    #[serde(default)]
    pub exclude_scopes: Vec<String>,
    /// Exclude repos whose exact "scope/name" matches at least one entry (applied after includes).
    #[serde(default)]
    pub exclude_names: Vec<String>,
    /// Optional per-protocol profile overrides. Matched on exact "scope/name". First match wins.
    #[serde(default)]
    pub profile_override: Vec<ProfileOverride>,
}

/// Overrides the default `[upstream].profile` for a specific protocol.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ProfileOverride {
    #[serde(rename = "match")]
    pub match_: String,
    pub profile: String,
}

pub fn load(path: impl AsRef<Path>) -> Result<Config> {
    let contents = std::fs::read_to_string(path.as_ref())?;
    let mut cfg: Config = toml::from_str(&contents)?;
    if let Ok(url) = std::env::var("DATABASE_URL") {
        cfg.storage.database_url = url;
    }
    if let Ok(url) = std::env::var("OCI_REGISTRY_URL") {
        cfg.oci.registry_url = url;
    }
    Ok(cfg)
}
