use std::collections::BTreeMap;

use pallas::ledger::traverse::{Era, MultiEraBlock};
use serde_bytes::ByteBuf;
use tracing::{debug, info, warn};
use tx3_lift::lift::Lifter;
use tx3_lift::match_::{MatchAssignment, Matcher};
use tx3_lift::payload::UtxoRef;
use tx3_lift_cardano::{CardanoLifter, CardanoPayload, ResolvedOutput};
use tx3_tir::model::v1beta0::Tx;
use utxorpc_spec::utxorpc::v1beta::cardano as u5c_cardano;
use utxorpc_spec::utxorpc::v1beta::watch::AnyChainTx;

use crate::config::MatchMode;
use crate::error::{Error, Result};
use crate::specialization::SpecializedTii;
use crate::store::{ChainPoint, OwnedMatchRow, Store};

/// Handle a streamed Apply event: parse the containing block, locate the tx,
/// resolve its inputs from `as_output.original_cbor` carried in the WatchTx
/// envelope, run match+lift across every specialized TII, and persist.
pub async fn apply_tx(
    any_tx: AnyChainTx,
    specialized: &[SpecializedTii],
    lifter: &CardanoLifter,
    store: &Store,
    mode: MatchMode,
) -> Result<()> {
    let Some(cardano_tx) = any_tx.chain.and_then(|c| match c {
        utxorpc_spec::utxorpc::v1beta::watch::any_chain_tx::Chain::Cardano(t) => Some(t),
    }) else {
        warn!("apply event missing cardano tx");
        return Ok(());
    };

    let Some(block) = any_tx.block else {
        warn!("apply event missing block context; cannot extract tx CBOR");
        return Ok(());
    };

    if block.native_bytes.is_empty() {
        warn!("apply event has empty block.native_bytes; server must include native bytes for tracker");
        return Ok(());
    }

    let multi_era_block = MultiEraBlock::decode(&block.native_bytes)
        .map_err(|e| Error::PallasDecode(e.to_string()))?;

    let target_hash: [u8; 32] = cardano_tx
        .hash
        .as_ref()
        .try_into()
        .map_err(|_| Error::Internal("tx hash != 32 bytes"))?;

    let containing_era = multi_era_block.era();
    let block_hash = multi_era_block.hash();
    let block_slot = multi_era_block.slot();

    let txs = multi_era_block.txs();
    let target_tx = txs
        .iter()
        .find(|t| t.hash().as_slice() == target_hash.as_slice())
        .ok_or_else(|| Error::TxNotInBlock(hex::encode(target_hash)))?;

    let resolved = collect_resolved_inputs(&cardano_tx, containing_era);
    debug!(
        tx = %hex::encode(target_hash),
        slot = block_slot,
        tx_inputs = target_tx.inputs().len(),
        ref_inputs = target_tx.reference_inputs().len(),
        resolved_inputs = resolved.len(),
        "collected resolved inputs from WatchTx envelope"
    );
    let payload = CardanoPayload::from_cbor(target_tx.encode())?.with_resolved_inputs(resolved);

    let block_hash_bytes: [u8; 32] = *block_hash;
    let cursor = ChainPoint {
        slot: block_slot,
        hash: block_hash_bytes,
    };

    let rows = run_specializations(
        specialized,
        lifter,
        &cardano_tx,
        &payload,
        block_slot,
        &block_hash_bytes,
        mode,
    )?;
    if !rows.is_empty() {
        info!(
            tx = %hex::encode(target_hash),
            slot = block_slot,
            matches = rows.len(),
            "matched"
        );
    } else {
        debug!(tx = %hex::encode(target_hash), slot = block_slot, "no match");
    }

    store.apply_block(cursor, rows).await?;
    Ok(())
}

pub async fn undo_tx(any_tx: AnyChainTx, store: &Store) -> Result<()> {
    let cardano_tx = match any_tx.chain {
        Some(utxorpc_spec::utxorpc::v1beta::watch::any_chain_tx::Chain::Cardano(t)) => t,
        None => return Ok(()),
    };

    let parent = any_tx
        .block
        .as_ref()
        .filter(|b| !b.native_bytes.is_empty())
        .and_then(|b| MultiEraBlock::decode(&b.native_bytes).ok())
        .and_then(|b| {
            let header = b.header();
            header.previous_hash().map(|h| ChainPoint {
                slot: header.slot().saturating_sub(1),
                hash: *h,
            })
        });

    let tx_hash = cardano_tx.hash.to_vec();
    info!(tx = %hex::encode(&tx_hash), "undo");
    store.undo_tx(tx_hash, parent).await?;
    Ok(())
}

/// What a surviving candidate needs in order to be lifted. Borrows into
/// `specialized` (which nothing mutates), so lifting can be deferred until
/// after selection without cloning any TIRs.
struct LiftInputs<'a> {
    spec: &'a SpecializedTii,
    tir: &'a Tx,
    assignment: MatchAssignment,
}

fn run_specializations(
    specialized: &[SpecializedTii],
    lifter: &CardanoLifter,
    _cardano_tx: &u5c_cardano::Tx,
    payload: &CardanoPayload,
    block_slot: u64,
    block_hash: &[u8],
    mode: MatchMode,
) -> Result<Vec<OwnedMatchRow>> {
    let summary = lifter.matcher.summarize(payload)?;

    // 1. Gate + collect candidates (no lifting yet).
    let mut candidates: Vec<Candidate<'_, LiftInputs<'_>>> = Vec::new();
    for spec in specialized {
        // Anchor gate: skip a source unless the tx forces one of its scripts to
        // run (spend-from-script, mint/burn, script-ref, or a datum-bearing
        // output at its address). Soft hits (bare output / value-policy) do not
        // gate on their own. Computed once per source, before any per-tx-name
        // fingerprint/match work.
        let hits = spec.anchors.hits(&summary);
        if !hits.gates() {
            continue;
        }
        for (tx_name, (tir, fp)) in &spec.txs {
            if !fp.matches(&summary) {
                continue;
            }
            let assignment = match lifter.match_tx(tir, payload)? {
                Some(a) => a,
                None => continue,
            };
            // `total` reproduces the old flat anchor count, so persisted scores
            // are unchanged for genuinely-strong matches.
            let score = u32::try_from(hits.total + fp.information_score()).unwrap_or(u32::MAX);
            candidates.push(Candidate {
                source_name: &spec.name,
                tx_name,
                score,
                payload: LiftInputs {
                    spec,
                    tir,
                    assignment,
                },
            });
        }
    }

    // 2. Pure selection: within-source dedup, cross-source rank, mode filter.
    let survivors = select_matches(candidates, mode);

    // 3. Lift only the survivors.
    let mut out = Vec::with_capacity(survivors.len());
    for Ranked {
        candidate,
        match_rank,
    } in survivors
    {
        let LiftInputs {
            spec,
            tir,
            assignment,
        } = candidate.payload;
        let lifted = lifter.lift(
            &spec.tii,
            candidate.tx_name,
            &spec.profile_name,
            tir,
            payload,
            &assignment,
        )?;
        let lifted_json = serde_json::to_string(&lifted)?;
        out.push(OwnedMatchRow {
            tx_hash: lifted.tx_id.to_vec(),
            block_slot,
            block_hash: block_hash.to_vec(),
            source_name: spec.name.clone(),
            repo_scope: spec.repo_scope.clone(),
            repo_name: spec.repo_name.clone(),
            repo_version: spec.repo_version.clone(),
            protocol_name: lifted.protocol_name.clone(),
            tx_name: lifted.tx_name.clone(),
            profile_name: lifted.profile_name.clone(),
            lifted_json,
            score: candidate.score,
            match_rank,
        });
    }
    Ok(out)
}

/// A match candidate collected before lifting: the keys the selection logic
/// ranks on (`source_name`, `tx_name`, `score`) plus an opaque `payload`
/// carrying whatever the lift step needs (references into `specialized`).
struct Candidate<'a, T> {
    source_name: &'a str,
    tx_name: &'a str,
    score: u32,
    payload: T,
}

/// A surviving candidate with its assigned dense, 1-based `match_rank`.
struct Ranked<'a, T> {
    candidate: Candidate<'a, T>,
    match_rank: u32,
}

/// Pure selection over collected match candidates.
///
/// 1. Within-source dedup: keep only the best-scoring `tx_name` per source;
///    ties break alphabetically by `tx_name` (ascending).
/// 2. Cross-source rank: sort survivors by score descending and assign dense
///    1-based ranks (equal scores share a rank: 5,5,3 -> 1,1,2).
/// 3. Mode filter: `Best` keeps only rank-1 rows (all of them when tied);
///    `All` keeps everything.
fn select_matches<T>(candidates: Vec<Candidate<'_, T>>, mode: MatchMode) -> Vec<Ranked<'_, T>> {
    // (1) Within-source dedup. Keep the best (source, tx_name) per source.
    // Higher score wins; on a tie, the alphabetically-first tx_name wins.
    let mut best_per_source: BTreeMap<&str, Candidate<'_, T>> = BTreeMap::new();
    for cand in candidates {
        // The new candidate replaces the incumbent when it scores strictly
        // higher, or ties on score with an alphabetically-earlier tx_name.
        // (Kept as an explicit boolean for readability over a
        // `(Reverse(score), tx_name)` tuple compare.)
        let replace = match best_per_source.get(cand.source_name) {
            None => true,
            Some(existing) => {
                cand.score > existing.score
                    || (cand.score == existing.score && cand.tx_name < existing.tx_name)
            }
        };
        if replace {
            best_per_source.insert(cand.source_name, cand);
        }
    }

    // (2) Cross-source rank: sort by score descending; assign dense 1-based
    // ranks, with equal scores sharing a rank.
    let mut survivors: Vec<Candidate<'_, T>> = best_per_source.into_values().collect();
    survivors.sort_by(|a, b| {
        b.score
            .cmp(&a.score)
            .then_with(|| a.source_name.cmp(b.source_name))
    });

    let mut ranked = Vec::with_capacity(survivors.len());
    let mut rank = 0u32;
    let mut prev_score: Option<u32> = None;
    for cand in survivors {
        if prev_score != Some(cand.score) {
            rank += 1;
            prev_score = Some(cand.score);
        }
        ranked.push(Ranked {
            candidate: cand,
            match_rank: rank,
        });
    }

    // (3) Mode filter.
    match mode {
        MatchMode::All => ranked,
        MatchMode::Best => {
            ranked.retain(|r| r.match_rank == 1);
            ranked
        }
    }
}

/// Walk every input + reference_input on the WatchTx-delivered cardano Tx and
/// pull the resolved-output CBOR from `as_output.original_cbor`. This is what
/// the v1beta spec carries for free, removing the need for a follow-up
/// ReadUtxos round-trip (which can't return spent inputs anyway).
fn collect_resolved_inputs(
    tx: &u5c_cardano::Tx,
    era: Era,
) -> BTreeMap<UtxoRef, ResolvedOutput> {
    let mut out = BTreeMap::new();
    let all_inputs = tx.inputs.iter().chain(tx.reference_inputs.iter());
    for input in all_inputs {
        let Some(as_output) = &input.as_output else {
            continue;
        };
        let Some(cbor) = &as_output.original_cbor else {
            warn!(
                "as_output.original_cbor missing for {}#{}; matcher will skip address checks",
                hex::encode(&input.tx_hash),
                input.output_index
            );
            continue;
        };
        let key: UtxoRef = (ByteBuf::from(input.tx_hash.to_vec()), input.output_index);
        out.insert(
            key,
            ResolvedOutput {
                era,
                cbor: cbor.to_vec(),
            },
        );
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Build a candidate whose opaque payload is just its `(source, tx_name)`
    /// pair, so assertions can identify which candidate survived.
    fn cand<'a>(
        source_name: &'a str,
        tx_name: &'a str,
        score: u32,
    ) -> Candidate<'a, (&'a str, &'a str)> {
        Candidate {
            source_name,
            tx_name,
            score,
            payload: (source_name, tx_name),
        }
    }

    /// Collapse the ranked result to `(source, tx_name, rank)` triples for
    /// readable assertions.
    fn triples<'a>(ranked: &[Ranked<'a, (&'a str, &'a str)>]) -> Vec<(&'a str, &'a str, u32)> {
        ranked
            .iter()
            .map(|r| (r.candidate.payload.0, r.candidate.payload.1, r.match_rank))
            .collect()
    }

    #[test]
    fn within_source_keeps_higher_score() {
        let candidates = vec![
            cand("indigo", "unstake", 2),
            cand("indigo", "create_cdp", 5),
        ];
        let ranked = select_matches(candidates, MatchMode::All);
        assert_eq!(
            triples(&ranked),
            vec![("indigo", "create_cdp", 1)],
            "higher-scoring tx_name must win within a source"
        );
    }

    #[test]
    fn within_source_tie_breaks_alphabetically() {
        // Equal scores: "adjust_cdp" must beat "unstake" (ascending tx_name).
        // Feed in non-alphabetical order to prove the tie-break does not rely
        // on input ordering.
        let candidates = vec![
            cand("indigo", "unstake", 4),
            cand("indigo", "adjust_cdp", 4),
        ];
        let ranked = select_matches(candidates, MatchMode::All);
        assert_eq!(
            triples(&ranked),
            vec![("indigo", "adjust_cdp", 1)],
            "on equal score the alphabetically-first tx_name must win"
        );
    }

    #[test]
    fn within_source_keeps_exactly_one_per_source() {
        let candidates = vec![
            cand("a", "x", 1),
            cand("a", "y", 3),
            cand("a", "z", 3),
            cand("b", "p", 2),
            cand("b", "q", 2),
        ];
        let ranked = select_matches(candidates, MatchMode::All);
        // One survivor per source: a/y (score 3, beats a/z on tie-break),
        // b/p (score 2, beats b/q on tie-break).
        let mut got: Vec<&str> = ranked.iter().map(|r| r.candidate.source_name).collect();
        got.sort_unstable();
        assert_eq!(got, vec!["a", "b"], "exactly one survivor per source");
        let triples = triples(&ranked);
        assert!(
            triples.contains(&("a", "y", 1)),
            "a/y (score 3) should survive and rank 1, got {triples:?}"
        );
        assert!(
            triples.contains(&("b", "p", 2)),
            "b/p (score 2) should survive and rank 2, got {triples:?}"
        );
    }

    #[test]
    fn cross_source_assigns_dense_ranks() {
        // Scores 5/5/3 across three sources -> dense ranks 1/1/2.
        let candidates = vec![cand("s1", "t", 5), cand("s2", "t", 5), cand("s3", "t", 3)];
        let ranked = select_matches(candidates, MatchMode::All);
        let mut ranks: Vec<u32> = ranked.iter().map(|r| r.match_rank).collect();
        ranks.sort_unstable();
        assert_eq!(
            ranks,
            vec![1, 1, 2],
            "scores 5/5/3 must produce dense ranks 1/1/2"
        );
    }

    #[test]
    fn single_candidate_ranks_one() {
        let candidates = vec![cand("only", "tx", 7)];
        let ranked = select_matches(candidates, MatchMode::All);
        assert_eq!(triples(&ranked), vec![("only", "tx", 1)]);
    }

    #[test]
    fn mode_best_keeps_all_rank_one_rows() {
        // Ranks 1/1/2: Best keeps both rank-1 rows, drops the rank-2 row.
        let candidates = vec![cand("s1", "t", 5), cand("s2", "t", 5), cand("s3", "t", 3)];
        let ranked = select_matches(candidates, MatchMode::Best);
        assert_eq!(ranked.len(), 2, "Best keeps both tied rank-1 rows");
        assert!(
            ranked.iter().all(|r| r.match_rank == 1),
            "Best keeps only rank-1 rows"
        );
        let mut sources: Vec<&str> = ranked.iter().map(|r| r.candidate.source_name).collect();
        sources.sort_unstable();
        assert_eq!(sources, vec!["s1", "s2"]);
    }

    #[test]
    fn mode_all_keeps_every_row() {
        let candidates = vec![cand("s1", "t", 5), cand("s2", "t", 5), cand("s3", "t", 3)];
        let ranked = select_matches(candidates, MatchMode::All);
        assert_eq!(ranked.len(), 3, "All keeps every ranked row");
    }

    #[test]
    fn empty_candidates_yield_empty_result() {
        let candidates: Vec<Candidate<'_, ()>> = Vec::new();
        let ranked = select_matches(candidates, MatchMode::All);
        assert!(ranked.is_empty());
        let candidates: Vec<Candidate<'_, ()>> = Vec::new();
        let ranked = select_matches(candidates, MatchMode::Best);
        assert!(ranked.is_empty());
    }
}
