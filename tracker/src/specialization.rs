//! Pre-specialize each configured TII against its profile.
//!
//! The tracker's matcher walks every streamed tx against every configured
//! TII; specializing on the hot path would mean re-applying the profile
//! args to the TIR for every block. We do it once at startup instead and
//! cache the result here as a `SpecializedTii` per `[[sources]]` entry.
//!
//! The cached representation pairs each transaction's specialized TIR with
//! its fingerprint, so the matcher's cheap pre-filter (`Fingerprint::matches`)
//! can run before the more expensive structural match.

use std::collections::BTreeMap;

use tx3_lift::fingerprint::{extract, Fingerprint};
use tx3_lift::specialize::{args_from_profile, decode_tir, lookup_profile, lookup_tx};
use tx3_sdk::tii::spec::TiiFile;
use tx3_tir::model::v1beta0::Tx;
use tx3_tir::reduce::{apply_args, ArgMap};

use crate::config::SourceConfig;
use crate::error::{Error, Result};

/// A TII whose transactions have all been pre-specialized against one
/// configured profile, with a fingerprint cached alongside each TIR.
#[derive(Debug)]
pub struct SpecializedTii {
    pub name: String,
    pub tii: TiiFile,
    pub profile_name: String,
    /// Per-tx-name pre-specialized TIR + fingerprint.
    pub txs: BTreeMap<String, (Tx, Fingerprint)>,
}

/// Specialize every configured `[[sources]]` entry. Returns one
/// `SpecializedTii` per source, in the same order.
pub fn specialize_all(sources: &[SourceConfig]) -> Result<Vec<SpecializedTii>> {
    sources.iter().map(specialize_one).collect()
}

fn specialize_one(src: &SourceConfig) -> Result<SpecializedTii> {
    let raw = std::fs::read_to_string(&src.tii_path)?;
    let tii: TiiFile = serde_json::from_str(&raw)?;

    let profile = lookup_profile(&tii, &src.profile)?;
    let args: ArgMap = args_from_profile(profile, &ArgMap::new())?;

    let mut txs = BTreeMap::new();
    for tx_name in tii.transactions.keys() {
        let tx_meta = lookup_tx(&tii, tx_name)?;
        let raw_tir = decode_tir(tx_meta)?;
        let specialized = apply_args(raw_tir, &args).map_err(tx3_lift::Error::from)?;
        let fp = extract(&tii, tx_name, &src.profile, &specialized, &args)?;
        txs.insert(tx_name.clone(), (specialized, fp));
    }

    if txs.is_empty() {
        return Err(Error::Config(format!(
            "source {:?} has no transactions in its TII",
            src.name
        )));
    }

    Ok(SpecializedTii {
        name: src.name.clone(),
        tii,
        profile_name: src.profile.clone(),
        txs,
    })
}
