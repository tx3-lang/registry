//! Connect to the configured upstream utxorpc endpoint and yield a ready
//! `WatchService` client. TLS is gated on `https://` so plaintext
//! `http://localhost:…` connects without extra config.
//!
//! [`predicate`] turns the `[upstream.filter]` block into the server-side
//! `WatchTx` predicate that narrows what gets forwarded to us.

pub mod predicate;
pub mod retry;

use std::time::Duration;

use prost::bytes::Bytes;
use tonic::codegen::InterceptedService;
use tonic::metadata::MetadataValue;
use tonic::service::Interceptor;
use tonic::transport::{Channel, ClientTlsConfig};
use utxorpc_spec::utxorpc::v1beta::watch::watch_service_client::WatchServiceClient;
use utxorpc_spec::utxorpc::v1beta::watch::BlockRef;

use crate::config::{Intersect, IntersectTag, UpstreamConfig};
use crate::error::{Error, Result};

pub type Channeled = InterceptedService<Channel, ApiKeyInterceptor>;

#[derive(Clone)]
pub struct ApiKeyInterceptor {
    api_key: Option<MetadataValue<tonic::metadata::Ascii>>,
}

impl Interceptor for ApiKeyInterceptor {
    fn call(
        &mut self,
        mut req: tonic::Request<()>,
    ) -> std::result::Result<tonic::Request<()>, tonic::Status> {
        if let Some(value) = &self.api_key {
            req.metadata_mut().insert("dmtr-api-key", value.clone());
        }
        Ok(req)
    }
}

pub async fn connect(cfg: &UpstreamConfig) -> Result<WatchServiceClient<Channeled>> {
    let mut endpoint = Channel::from_shared(cfg.endpoint.clone())
        .map_err(|e| Error::Config(format!("invalid endpoint {:?}: {e}", cfg.endpoint)))?
        // Keep the long-lived stream's HTTP/2 connection warm. Without these,
        // an idle intermediary (NAT/LB/proxy) silently drops the connection
        // during inter-block gaps, surfacing later as an h2 body-read error.
        // The keepalive PINGs also let us detect a dead connection promptly
        // instead of blocking forever on a half-open socket.
        .http2_keep_alive_interval(Duration::from_secs(20))
        .keep_alive_timeout(Duration::from_secs(20))
        .keep_alive_while_idle(true)
        .tcp_keepalive(Some(Duration::from_secs(60)));
    if cfg.endpoint.starts_with("https://") {
        endpoint = endpoint.tls_config(ClientTlsConfig::new().with_native_roots())?;
    }
    let channel = endpoint.connect().await?;

    let api_key = match &cfg.api_key {
        Some(k) => Some(
            MetadataValue::try_from(k.as_str())
                .map_err(|e| Error::Config(format!("invalid api_key: {e}")))?,
        ),
        None => None,
    };
    let interceptor = ApiKeyInterceptor { api_key };

    Ok(WatchServiceClient::with_interceptor(channel, interceptor))
}

pub fn intersect_block_refs(intersect: &Intersect) -> Result<Vec<BlockRef>> {
    Ok(match intersect {
        Intersect::Tag(IntersectTag::Tip) => Vec::new(),
        Intersect::Point { slot, hash } => vec![BlockRef {
            slot: *slot,
            hash: Bytes::from(hex::decode(hash)?),
            height: 0,
        }],
    })
}
