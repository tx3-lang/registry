use tx3_registry_tracker::discovery::DiscoveredSource;
use tx3_registry_tracker::specialization::{specialize_all, SpecializedTii};
use tx3_sdk::tii::spec::TiiFile;

fn anchored_source() -> DiscoveredSource {
    let tii: TiiFile = serde_json::from_str(include_str!(
        "fixtures/orcfax_burn_anchored.tii"
    ))
    .expect("failed to parse orcfax_burn_anchored.tii");

    DiscoveredSource {
        source_name: "txpipe/orcfax-burn-anchored:1.0.0".to_string(),
        scope: "txpipe".to_string(),
        name: "orcfax-burn-anchored".to_string(),
        version: "1.0.0".to_string(),
        tii,
        profile_name: "mainnet".to_string(),
    }
}

fn anchorless_source() -> DiscoveredSource {
    let tii: TiiFile =
        serde_json::from_str(include_str!("fixtures/orcfax_burn_anchorless.tii"))
            .expect("failed to parse orcfax_burn_anchorless.tii");

    DiscoveredSource {
        source_name: "txpipe/orcfax-burn:1.0.0".to_string(),
        scope: "txpipe".to_string(),
        name: "orcfax-burn".to_string(),
        version: "1.0.0".to_string(),
        tii,
        profile_name: "mainnet".to_string(),
    }
}

/// specialize_all with one anchored + one anchorless source must return exactly
/// one SpecializedTii (the anchored one); the anchorless source is excluded.
#[test]
fn anchorless_source_is_excluded_and_anchored_is_retained() {
    let sources = vec![anchored_source(), anchorless_source()];

    let active: Vec<SpecializedTii> =
        specialize_all(&sources).expect("specialize_all must succeed");

    assert_eq!(
        active.len(),
        1,
        "expected exactly 1 active source (anchorless excluded); got {}",
        active.len()
    );

    let retained = &active[0];

    // The retained source is the anchored one.
    assert_eq!(
        retained.name, "txpipe/orcfax-burn-anchored:1.0.0",
        "retained source must be the anchored one"
    );

    // Its anchors must be non-empty.
    assert!(
        !retained.anchors.is_empty(),
        "retained source must have non-empty anchors"
    );
}

/// The anchorless source (orcfax_burn mainnet: no parties, empty environment)
/// must be absent from specialize_all's output when passed alone.
#[test]
fn anchorless_source_alone_yields_empty_result() {
    let sources = vec![anchorless_source()];

    let active: Vec<SpecializedTii> =
        specialize_all(&sources).expect("specialize_all on anchorless source must succeed");

    assert!(
        active.is_empty(),
        "anchorless-only input must yield an empty result"
    );
}

/// The anchored source must survive specialize_all when passed alone.
#[test]
fn anchored_source_alone_is_retained() {
    let sources = vec![anchored_source()];

    let active: Vec<SpecializedTii> =
        specialize_all(&sources).expect("specialize_all on anchored source must succeed");

    assert_eq!(active.len(), 1, "anchored source must survive the filter");
    assert!(
        !active[0].anchors.is_empty(),
        "anchors must be non-empty"
    );
}
