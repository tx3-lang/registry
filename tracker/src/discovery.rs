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
//! private sub-functions) lives in Task 4.

use tx3_sdk::tii::spec::TiiFile;

use crate::config::OciConfig;

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
    /// Scope portion only (e.g. `"txpipe"`).
    scope: String,
    /// Most-recent OCI tag (e.g. `"1.0.0"`).
    tag: String,
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
