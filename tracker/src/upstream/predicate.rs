use prost::bytes::Bytes;
use tx3_lift::specialize::decode_bech32_address;
use utxorpc_spec::utxorpc::v1beta::cardano::{AddressPattern, AssetPattern, TxPattern};
use utxorpc_spec::utxorpc::v1beta::watch::{any_chain_tx_pattern, AnyChainTxPattern, TxPredicate};

use crate::config::UpstreamFilter;
use crate::error::{Error, Result};

/// Translate the `[upstream.filter]` config block into a server-side TxPredicate.
///
/// Returns `None` if no filters are configured (server streams every tx).
/// Multiple filters are combined into a disjunctive predicate (`any_of`).
pub fn compile(cfg: &UpstreamFilter) -> Result<Option<TxPredicate>> {
    if cfg.is_empty() {
        return Ok(None);
    }

    let mut alternatives: Vec<TxPredicate> = Vec::new();

    for addr in &cfg.addresses {
        let bytes = decode_bech32_address(addr).map_err(Error::Lift)?;
        alternatives.push(predicate_from_pattern(TxPattern {
            has_address: Some(AddressPattern {
                exact_address: Bytes::from(bytes),
                ..Default::default()
            }),
            ..Default::default()
        }));
    }

    if let Some(policy_hex) = &cfg.moves_policy_id {
        let bytes = hex::decode(policy_hex)?;
        alternatives.push(predicate_from_pattern(TxPattern {
            moves_asset: Some(AssetPattern {
                policy_id: Bytes::from(bytes),
                ..Default::default()
            }),
            ..Default::default()
        }));
    }

    if let Some(policy_hex) = &cfg.mints_policy_id {
        let bytes = hex::decode(policy_hex)?;
        alternatives.push(predicate_from_pattern(TxPattern {
            mints_asset: Some(AssetPattern {
                policy_id: Bytes::from(bytes),
                ..Default::default()
            }),
            ..Default::default()
        }));
    }

    if alternatives.len() == 1 {
        return Ok(Some(alternatives.pop().unwrap()));
    }

    Ok(Some(TxPredicate {
        any_of: alternatives,
        ..Default::default()
    }))
}

fn predicate_from_pattern(pattern: TxPattern) -> TxPredicate {
    TxPredicate {
        r#match: Some(AnyChainTxPattern {
            chain: Some(any_chain_tx_pattern::Chain::Cardano(pattern)),
        }),
        ..Default::default()
    }
}
