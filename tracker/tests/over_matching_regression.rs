// `tii` / `txs` fields of SpecializedTii are constructed but never read here.
#![allow(dead_code)]

use std::collections::BTreeSet;
use std::path::PathBuf;

use serde_bytes::ByteBuf;
use tx3_lift::payload::PayloadSummary;
use tx3_lift::specialize::decode_bech32_address;
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

/// Build a `PayloadSummary` shaped like mainnet tx `5cfda5da…f440` (slot
/// 187665793) — the tx that triggered the over-matching incident.  The key
/// property is that **none** of the addresses or input refs belong to any of
/// the five configured protocols.
///
/// Prefixes from the issue doc (truncated there with `…`; padded to full
/// length below with filler bytes — the padding provably matches no anchor):
///   input[0]  0x31 c727443d77df6cff 95dca383994f4c30 24d03ff56b02ecc2 2b0f3f65 … (script-like)
///   input[1]  0x01 5090306a888fde7e 4500aefd4ccd9605 5043de31e56ef28d c27dd4d8 … (payment)
///   output[*] 0x01 5090306a888fde7e 4500aefd4ccd9605 5043de31e56ef28d c27dd4d8 … (payment)
///
/// The txids used in `input_refs` are synthetic — just random-looking 32-byte
/// values that are NOT present in any protocol's profile.
fn incident_summary() -> PayloadSummary {
    // Script-like input address (header byte 0x31 + payload from issue doc)
    let script_addr = ByteBuf::from(
        hex::decode("31c727443d77df6cff95dca383994f4c3024d03ff56b02ecc22b0f3f65aabbcc")
            .expect("hex decode script addr"),
    );
    // Payment input/output address (header byte 0x01 + payload from issue doc)
    let payment_addr = ByteBuf::from(
        hex::decode("015090306a888fde7e4500aefd4ccd96055043de31e56ef28dc27dd4d8112233")
            .expect("hex decode payment addr"),
    );

    // Synthetic input refs — 32-byte txids NOT in any protocol profile
    let txid1 = ByteBuf::from(
        hex::decode("deadbeef00000000000000000000000000000000000000000000000000000001")
            .expect("hex decode txid1"),
    );
    let txid2 = ByteBuf::from(
        hex::decode("deadbeef00000000000000000000000000000000000000000000000000000002")
            .expect("hex decode txid2"),
    );

    PayloadSummary {
        input_addresses: BTreeSet::from([script_addr, payment_addr.clone()]),
        output_addresses: BTreeSet::from([payment_addr]),
        input_refs: BTreeSet::from([(txid1, 0u32), (txid2, 1u32)]),
        input_count: 2,
        output_count: 3,
        ..PayloadSummary::default()
    }
}

// ── negative control: incident tx hits zero anchors for all active sources ───

/// Regression test for the over-matching incident.
///
/// Five mainnet sources are loaded; vyfi is dropped (zero anchors); four
/// survive. For the incident summary each survivor must have `total == 0` and
/// `gates() == false` — it intersects no anchor at all, so the gate would have
/// blocked every false-positive match.
#[test]
fn incident_tx_hits_no_anchors_for_any_active_source() {
    let sources = vec![
        source("indigo"),
        source("vyfi"),
        source("bodega_market"),
        source("fluid-aquarium"),
        source("strike-staking"),
    ];

    let active = specialize_all(&sources).expect("specialize_all must succeed");

    // Honest accounting: the test covers exactly the four survivors.
    assert_eq!(
        active.len(),
        4,
        "expected 4 active sources after vyfi is dropped; got {}",
        active.len()
    );

    let summary = incident_summary();

    for spec in &active {
        let hits = spec.anchors.hits(&summary);
        assert_eq!(
            hits.total, 0,
            "source {:?}: expected 0 total anchor hits for the incident tx, got {}",
            spec.name, hits.total
        );
        assert!(
            !hits.gates(),
            "source {:?}: incident tx must not gate, got gating={}",
            spec.name,
            hits.gating
        );
    }
}

// ── positive control: a gating indigo anchor IS detected ─────────────────────

/// Positive control so the test can't pass vacuously.
///
/// When the summary spends from the indigo `cdpscript` address (the address in
/// `input_addresses` — a script execution), the indigo source's anchors must
/// gate.
#[test]
fn incident_tx_with_indigo_gating_anchor_gates_indigo() {
    let sources = vec![source("indigo")];
    let active = specialize_all(&sources).expect("specialize_all on indigo/mainnet must succeed");
    assert_eq!(active.len(), 1, "indigo/mainnet must survive the filter");

    let indigo_spec = &active[0];

    // cdpscript bech32 from the indigo mainnet profile
    let cdpscript_bytes =
        decode_bech32_address("addr1wyyqtkz5rken7jzptp076np606r79lmsrqjrqw8sdn4kvrqewrkdg")
            .expect("cdpscript bech32 decode must succeed");
    let cdpscript_buf = ByteBuf::from(cdpscript_bytes);

    // Build a summary that otherwise looks like the incident tx, but spending
    // FROM the cdpscript address (gating: the validator executed).
    let mut summary = incident_summary();
    summary.input_addresses.insert(cdpscript_buf);

    let hits = indigo_spec.anchors.hits(&summary);
    assert!(
        hits.gates(),
        "spending from the indigo cdpscript address must gate; got gating={}",
        hits.gating
    );
    assert_eq!(
        hits.gating, 1,
        "exactly the cdpscript address gates; got gating={}",
        hits.gating
    );
}

// ── soft-hit companion: bare output / value-policy does NOT gate ─────────────

/// Pins the live-run false-positive class: a tx that merely pays bare ADA to
/// the indigo `cdpscript` address (no datum) and/or holds the iAsset policy in
/// value must register `total >= 1` but **not** gate. This is exactly the shape
/// of the 14 `score == 1` value-policy rows the gate is meant to drop.
#[test]
fn indigo_soft_hits_do_not_gate() {
    let sources = vec![source("indigo")];
    let active = specialize_all(&sources).expect("specialize_all on indigo/mainnet must succeed");
    assert_eq!(active.len(), 1, "indigo/mainnet must survive the filter");

    let indigo_spec = &active[0];

    // cdpscript bech32 from the indigo mainnet profile — placed as a BARE output
    // (no datum), the soft tier.
    let cdpscript_buf = ByteBuf::from(
        decode_bech32_address("addr1wyyqtkz5rken7jzptp076np606r79lmsrqjrqw8sdn4kvrqewrkdg")
            .expect("cdpscript bech32 decode must succeed"),
    );

    // iasset_policy_id from the indigo mainnet profile — merely present in value.
    let iasset_policy = ByteBuf::from(
        hex::decode("f66d78b4a3cb3d37afa0ec36461e51ecbde00f26c8f0a68f94b69880")
            .expect("iasset policy hex decode"),
    );

    let mut summary = incident_summary();
    summary.output_addresses.insert(cdpscript_buf);
    summary.value_policies.insert(iasset_policy);

    let hits = indigo_spec.anchors.hits(&summary);
    assert_eq!(
        hits.total, 2,
        "both soft hits (bare cdpscript output + iAsset value-policy) must register in total; got total={}",
        hits.total
    );
    assert!(
        !hits.gates(),
        "bare output + value-policy must NOT gate (this is the live false-positive class); got gating={}",
        hits.gating
    );
}

// ── datum-output gating: a stateful output at a script address DOES gate ──────

/// Companion to the spend-from-script control: an output to the indigo
/// `cdpscript` address that carries a datum (a stateful position output — the
/// "open a CDP" flow) gates via the datum-corroboration tier, exercising the
/// `output_addresses_with_datum` path end to end through the anchor logic.
#[test]
fn indigo_datum_output_gates() {
    let sources = vec![source("indigo")];
    let active = specialize_all(&sources).expect("specialize_all on indigo/mainnet must succeed");
    assert_eq!(active.len(), 1, "indigo/mainnet must survive the filter");

    let indigo_spec = &active[0];

    let cdpscript_buf = ByteBuf::from(
        decode_bech32_address("addr1wyyqtkz5rken7jzptp076np606r79lmsrqjrqw8sdn4kvrqewrkdg")
            .expect("cdpscript bech32 decode must succeed"),
    );

    // A datum-bearing output at the script address: present in output_addresses
    // AND in the datum subset (the gating tier).
    let mut summary = incident_summary();
    summary.output_addresses.insert(cdpscript_buf.clone());
    summary.output_addresses_with_datum.insert(cdpscript_buf);

    let hits = indigo_spec.anchors.hits(&summary);
    assert!(
        hits.gates(),
        "a datum-bearing output at the cdpscript address must gate; got gating={}",
        hits.gating
    );
    assert_eq!(
        hits.gating, 1,
        "exactly the cdpscript datum-output gates; got gating={}",
        hits.gating
    );
}
