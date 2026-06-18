//! Pre-specialize each discovered TII against its profile.
//!
//! The tracker's matcher walks every streamed tx against every discovered
//! TII; specializing on the hot path would mean re-applying the profile
//! args to the TIR for every block. We do it once at startup instead and
//! cache the result here as a `SpecializedTii` per discovered source.
//!
//! The cached representation pairs each transaction's specialized TIR with
//! its fingerprint, so the matcher's cheap pre-filter (`Fingerprint::matches`)
//! can run before the more expensive structural match.

use std::collections::BTreeMap;

use tracing::warn;
use tx3_lift::fingerprint::{extract, Fingerprint};
use tx3_lift::specialize::{args_from_profile, decode_tir, lookup_profile, lookup_tx};
use tx3_lift::ProtocolAnchors;
use tx3_sdk::tii::spec::TiiFile;
use tx3_tir::model::v1beta0::Tx;
use tx3_tir::reduce::{apply_args, ArgMap};

use crate::discovery::DiscoveredSource;
use crate::error::{Error, Result};

/// A TII whose transactions have all been pre-specialized against one
/// configured profile, with a fingerprint cached alongside each TIR.
#[derive(Debug)]
pub struct SpecializedTii {
    pub name: String,
    pub repo_scope: String,
    pub repo_name: String,
    pub repo_version: String,
    pub tii: TiiFile,
    pub profile_name: String,
    /// Protocol-level anchors derived from the profile (addresses, UTxO refs,
    /// policy ids). Always non-empty: sources with zero anchors are excluded
    /// from the active list by [`specialize_all`].
    pub anchors: ProtocolAnchors,
    /// Per-tx-name pre-specialized TIR + fingerprint.
    pub txs: BTreeMap<String, (Tx, Fingerprint)>,
}

/// Specialize every discovered TII source. Returns one `SpecializedTii` per
/// source in the same order as `sources`, **excluding** sources whose profile
/// yields zero anchors (no known party addresses, script-reference UTxOs, or
/// policy ids). A warning is emitted for each excluded source so the omission
/// is visible in logs.
pub fn specialize_all(sources: &[DiscoveredSource]) -> Result<Vec<SpecializedTii>> {
    let mut out = Vec::with_capacity(sources.len());
    for src in sources {
        let specialized = specialize_one(src)?;
        if specialized.anchors.is_empty() {
            warn!(
                source = %src.source_name,
                profile = %src.profile_name,
                "profile has no parties or recognizable environment anchors; \
                 matching disabled for this source"
            );
            continue;
        }
        out.push(specialized);
    }
    Ok(out)
}

fn specialize_one(src: &DiscoveredSource) -> Result<SpecializedTii> {
    let tii = src.tii.clone();

    let profile = lookup_profile(&tii, &src.profile_name)?;
    let anchors = ProtocolAnchors::from_profile(profile)?;
    let args: ArgMap = args_from_profile(profile, &ArgMap::new())?;

    let mut txs = BTreeMap::new();
    for tx_name in tii.transactions.keys() {
        let tx_meta = lookup_tx(&tii, tx_name)?;
        let raw_tir = decode_tir(tx_meta)?;
        let specialized = apply_args(raw_tir, &args).map_err(tx3_lift::Error::from)?;
        let fp = extract(&tii, tx_name, &src.profile_name, &specialized, &args)?;
        txs.insert(tx_name.clone(), (specialized, fp));
    }

    if txs.is_empty() {
        return Err(Error::Config(format!(
            "protocol {} has no transactions for profile {}",
            src.source_name, src.profile_name
        )));
    }

    Ok(SpecializedTii {
        name: src.source_name.clone(),
        repo_scope: src.scope.clone(),
        repo_name: src.name.clone(),
        repo_version: src.version.clone(),
        tii,
        profile_name: src.profile_name.clone(),
        anchors,
        txs,
    })
}
