pub mod config;
pub mod discovery;
pub mod error;
pub mod process;
pub mod specialization;
pub mod store;
pub mod upstream;

use std::path::PathBuf;
use std::time::Duration;

use tracing::{info, warn};
use tx3_lift_cardano::CardanoLifter;
use utxorpc_spec::utxorpc::v1beta::watch::{watch_tx_response, BlockRef, WatchTxRequest};

use crate::error::{Error, Result};
use crate::upstream::retry::Backoff;

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

    let predicate = upstream::predicate::compile(&cfg.upstream.filter)?;
    let lifter = CardanoLifter::new();

    let mut shutdown = signal_listener();
    let mut backoff = Backoff::new(Duration::from_secs(1), Duration::from_secs(30));

    // A long-lived gRPC stream against a managed endpoint will be interrupted
    // periodically (idle drop, GOAWAY/connection recycling, brief provider
    // restarts). Each interruption is recoverable: reconnect and resume from
    // the persisted cursor. Only fatal errors (config/auth/bad-request, or a
    // processing failure) break out and propagate.
    loop {
        // Resume from the latest persisted cursor on every (re)connect; fall
        // back to the configured intersect only when nothing has been stored.
        let intersect = match store.cursor().await? {
            Some(point) => {
                info!(slot = point.slot, "resuming from stored cursor");
                vec![BlockRef {
                    slot: point.slot,
                    hash: prost::bytes::Bytes::copy_from_slice(&point.hash),
                    height: 0,
                }]
            }
            None => upstream::intersect_block_refs(&cfg.upstream.intersect)?,
        };

        let request = WatchTxRequest {
            predicate: predicate.clone(),
            field_mask: None,
            intersect,
        };

        match stream_session(
            &cfg,
            request,
            &specialized,
            &lifter,
            &store,
            &mut shutdown,
            &mut backoff,
        )
        .await?
        {
            SessionOutcome::Shutdown => break,
            SessionOutcome::Reconnect => {
                let delay = backoff.next_delay();
                warn!(?delay, "stream interrupted; reconnecting after backoff");
                tokio::select! {
                    biased;
                    _ = &mut shutdown => break,
                    _ = tokio::time::sleep(delay) => {}
                }
            }
        }
    }
    Ok(())
}

/// Why a streaming session ended.
enum SessionOutcome {
    /// The shutdown signal fired; the tracker should exit cleanly.
    Shutdown,
    /// The connection or stream failed transiently; the caller should back off
    /// and reconnect, resuming from the persisted cursor.
    Reconnect,
}

/// Connect, subscribe to `WatchTx`, and consume the stream until it ends.
///
/// Transport-level failures (connect, subscribe, or mid-stream) resolve to
/// [`SessionOutcome::Reconnect`] so the caller can retry. Config/auth/bad-request
/// failures and any processing error propagate as fatal `Err`.
#[allow(clippy::too_many_arguments)]
async fn stream_session(
    cfg: &config::Config,
    request: WatchTxRequest,
    specialized: &[specialization::SpecializedTii],
    lifter: &CardanoLifter,
    store: &store::Store,
    shutdown: &mut tokio::task::JoinHandle<()>,
    backoff: &mut Backoff,
) -> Result<SessionOutcome> {
    let mut watch = match upstream::connect(&cfg.upstream).await {
        Ok(w) => w,
        // A bad URI/api_key surfaces as Error::Config from connect() and is
        // fatal; an unreachable server surfaces as a transport error and is
        // worth retrying.
        Err(Error::TonicTransport(e)) => {
            warn!(error = %e, "connect failed; will reconnect");
            return Ok(SessionOutcome::Reconnect);
        }
        Err(e) => return Err(e),
    };

    info!(endpoint = %cfg.upstream.endpoint, "subscribing to WatchTx");
    let mut stream = match watch.watch_tx(request).await {
        Ok(r) => r.into_inner(),
        Err(status) if upstream::retry::is_transient(status.code()) => {
            warn!(code = ?status.code(), error = %status, "subscribe failed; will reconnect");
            return Ok(SessionOutcome::Reconnect);
        }
        Err(status) => return Err(status.into()),
    };

    loop {
        tokio::select! {
            biased;
            _ = &mut *shutdown => {
                info!("shutdown signal received");
                return Ok(SessionOutcome::Shutdown);
            }
            msg = stream.message() => {
                let response = match msg {
                    Ok(Some(r)) => {
                        // The connection proved healthy; clear any backoff so
                        // the next interruption retries promptly.
                        backoff.reset();
                        r
                    }
                    Ok(None) => {
                        info!("stream closed by server; will reconnect");
                        return Ok(SessionOutcome::Reconnect);
                    }
                    Err(status) if upstream::retry::is_transient(status.code()) => {
                        warn!(code = ?status.code(), error = %status, "stream error; will reconnect");
                        return Ok(SessionOutcome::Reconnect);
                    }
                    Err(status) => return Err(status.into()),
                };
                match response.action {
                    Some(watch_tx_response::Action::Apply(any_tx)) => {
                        process::apply_tx(any_tx, specialized, lifter, store, cfg.matching.mode)
                            .await?;
                    }
                    Some(watch_tx_response::Action::Undo(any_tx)) => {
                        process::undo_tx(any_tx, store).await?;
                    }
                    Some(watch_tx_response::Action::Idle(b)) => {
                        tracing::debug!(slot = b.slot, "idle");
                    }
                    None => {}
                }
            }
        }
    }
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
