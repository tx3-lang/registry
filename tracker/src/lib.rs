pub mod config;
pub mod discovery;
pub mod error;
pub mod process;
pub mod specialization;
pub mod store;
pub mod upstream;

use std::path::PathBuf;

use tracing::info;
use tx3_lift_cardano::CardanoLifter;
use utxorpc_spec::utxorpc::v1beta::watch::{watch_tx_response, WatchTxRequest};

use crate::error::Result;

pub async fn run(config_path: PathBuf) -> Result<()> {
    info!(config = %config_path.display(), "starting tracker");
    let cfg = config::load(&config_path)?;

    let store = store::Store::open(&cfg.storage.database_url).await?;
    let discovered = discovery::fetch_catalog(&cfg.oci, &cfg.upstream.profile).await?;
    let specialized = specialization::specialize_all(&discovered)?;
    info!(
        sources = specialized.len(),
        txs = specialized.iter().map(|s| s.txs.len()).sum::<usize>(),
        "specialized discovered sources"
    );

    let intersect = match store.cursor().await? {
        Some(point) => {
            info!(slot = point.slot, "resuming from stored cursor");
            vec![utxorpc_spec::utxorpc::v1beta::watch::BlockRef {
                slot: point.slot,
                hash: prost::bytes::Bytes::copy_from_slice(&point.hash),
                height: 0,
            }]
        }
        None => upstream::intersect_block_refs(&cfg.upstream.intersect)?,
    };

    let predicate = upstream::predicate::compile(&cfg.upstream.filter)?;
    let mut watch = upstream::connect(&cfg.upstream).await?;
    let lifter = CardanoLifter::new();

    let request = WatchTxRequest {
        predicate,
        field_mask: None,
        intersect,
    };

    info!(endpoint = %cfg.upstream.endpoint, "subscribing to WatchTx");
    let mut stream = watch.watch_tx(request).await?.into_inner();

    let mut shutdown = signal_listener();

    loop {
        tokio::select! {
            biased;
            _ = &mut shutdown => {
                info!("shutdown signal received");
                break;
            }
            msg = stream.message() => {
                let response = match msg? {
                    Some(r) => r,
                    None => {
                        info!("stream closed by server");
                        break;
                    }
                };
                match response.action {
                    Some(watch_tx_response::Action::Apply(any_tx)) => {
                        process::apply_tx(any_tx, &specialized, &lifter, &store).await?;
                    }
                    Some(watch_tx_response::Action::Undo(any_tx)) => {
                        process::undo_tx(any_tx, &store).await?;
                    }
                    Some(watch_tx_response::Action::Idle(b)) => {
                        tracing::debug!(slot = b.slot, "idle");
                        continue;
                    }
                    None => continue,
                }
            }
        }
    }
    Ok(())
}

fn signal_listener() -> tokio::task::JoinHandle<()> {
    tokio::spawn(async {
        let ctrl_c = tokio::signal::ctrl_c();
        #[cfg(unix)]
        {
            use tokio::signal::unix::{signal, SignalKind};
            let mut term = match signal(SignalKind::terminate()) {
                Ok(s) => s,
                Err(_) => return,
            };
            tokio::select! {
                _ = ctrl_c => {}
                _ = term.recv() => {}
            }
        }
        #[cfg(not(unix))]
        {
            let _ = ctrl_c.await;
        }
    })
}
