use std::collections::BTreeMap;

use pallas::ledger::traverse::{Era, MultiEraBlock};
use serde_bytes::ByteBuf;
use tracing::{debug, info, warn};
use tx3_lift::lift::Lifter;
use tx3_lift::match_::Matcher;
use tx3_lift::payload::UtxoRef;
use tx3_lift_cardano::{CardanoLifter, CardanoPayload, ResolvedOutput};
use utxorpc_spec::utxorpc::v1beta::cardano as u5c_cardano;
use utxorpc_spec::utxorpc::v1beta::watch::AnyChainTx;

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

    let rows = run_specializations(specialized, lifter, &cardano_tx, &payload, block_slot, &block_hash_bytes)?;
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

fn run_specializations(
    specialized: &[SpecializedTii],
    lifter: &CardanoLifter,
    _cardano_tx: &u5c_cardano::Tx,
    payload: &CardanoPayload,
    block_slot: u64,
    block_hash: &[u8],
) -> Result<Vec<OwnedMatchRow>> {
    let summary = lifter.matcher.summarize(payload)?;
    let mut out = Vec::new();
    for spec in specialized {
        for (tx_name, (tir, fp)) in &spec.txs {
            if !fp.matches(&summary) {
                continue;
            }
            let assignment = match lifter.match_tx(tir, payload)? {
                Some(a) => a,
                None => continue,
            };
            let lifted = lifter.lift(
                &spec.tii,
                tx_name,
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
                protocol_name: lifted.protocol_name.clone(),
                tx_name: lifted.tx_name.clone(),
                profile_name: lifted.profile_name.clone(),
                lifted_json,
            });
        }
    }
    Ok(out)
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
