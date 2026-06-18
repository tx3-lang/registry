// `tii` / `txs` fields of SpecializedTii are constructed but never read here.
#![allow(dead_code)]

use std::path::PathBuf;

use tx3_registry_tracker::discovery::DiscoveredSource;
use tx3_registry_tracker::specialization::specialize_all;
use tx3_sdk::tii::spec::TiiFile;

/// Build a `DiscoveredSource` from `tests/fixtures/protocols/<name>.tii`.
fn source(name: &str) -> DiscoveredSource {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("tests/fixtures/protocols")
        .join(format!("{name}.tii"));
    let raw = std::fs::read_to_string(&path)
        .unwrap_or_else(|e| panic!("failed to read {}: {}", path.display(), e));
    let tii: TiiFile = serde_json::from_str(&raw)
        .unwrap_or_else(|e| panic!("failed to parse {}: {}", path.display(), e));

    DiscoveredSource {
        source_name: name.to_string(),
        scope: "test".to_string(),
        name: name.to_string(),
        version: "0.0.0".to_string(),
        tii,
        profile_name: "mainnet".to_string(),
    }
}

// ── negative: DEX swap — only carries iUSD (soft anchor) ────────────────────

/// Real mainnet tx 06a73a03f46b4c79137c76880257e6789316ddcba27705e556f0d8e940f0788f
/// was the live-run false positive that motivated the anchor-strength gating
/// change.  It is a DEX iUSD swap: the tx carries the iAsset policy
/// `f66d78b4a3cb3d37afa0ec36461e51ecbde00f26c8f0a68f94b69880` in its output
/// value, which is an indigo anchor — but only as circulating value (soft).
/// No indigo script was executed and no indigo stateful output was created, so
/// the anchor must NOT gate.  The only intersection is that single value-policy
/// → `total == 1`, `gates() == false`.
#[test]
fn dex_swap_iusd_does_not_gate_indigo() {
    let active = specialize_all(&[source("indigo")])
        .expect("specialize_all on indigo/mainnet must succeed");
    assert_eq!(active.len(), 1, "indigo/mainnet must survive the filter");
    let anchors = &active[0].anchors;

    let bytes =
        hex::decode(include_str!("fixtures/dex_swap_iusd_06a73a03.cbor.hex").trim()).unwrap();
    let payload = tx3_lift_cardano::payload::CardanoPayload::from_cbor(bytes).unwrap();
    let summary = tx3_lift_cardano::summarize::summarize(&payload).unwrap();

    let hits = anchors.hits(&summary);
    assert_eq!(
        hits.total, 1,
        "DEX swap carries iAsset value-policy (one soft anchor); expected total == 1, got {}",
        hits.total
    );
    assert!(
        !hits.gates(),
        "DEX swap must NOT gate indigo (value-policy-only is soft); got gating={}",
        hits.gating
    );
}

// ── positive: indigo create_staking — runs scripts / creates stateful outputs ─

/// Real mainnet tx c54778b4fcb6741eed0d96763328673b4fa9947e0c6e5f29a735197fa94c7279
/// is a genuine indigo `create_staking` interaction.  It creates a
/// datum-bearing output at an indigo staking script address, mints a
/// control-NFT under an indigo anchor policy, and references at least two
/// indigo deployed-script UTxOs — all gating-tier signals.  The tx must gate
/// the indigo/mainnet anchor set: `gates() == true` and `gating >= 1`.
#[test]
fn indigo_create_staking_gates_indigo() {
    let active = specialize_all(&[source("indigo")])
        .expect("specialize_all on indigo/mainnet must succeed");
    assert_eq!(active.len(), 1, "indigo/mainnet must survive the filter");
    let anchors = &active[0].anchors;

    let bytes =
        hex::decode(include_str!("fixtures/indigo_create_staking_c54778b4.cbor.hex").trim())
            .unwrap();
    let payload = tx3_lift_cardano::payload::CardanoPayload::from_cbor(bytes).unwrap();
    let summary = tx3_lift_cardano::summarize::summarize(&payload).unwrap();

    let hits = anchors.hits(&summary);
    assert!(
        hits.gating >= 1,
        "indigo create_staking must have at least one gating anchor hit; got gating={}",
        hits.gating
    );
    assert!(
        hits.gates(),
        "indigo create_staking must gate indigo; got gating={}, total={}",
        hits.gating,
        hits.total
    );
}
