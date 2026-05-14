use std::path::PathBuf;

use tracing::error;
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() {
    init_tracing();
    let path = std::env::args()
        .nth(1)
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("tracker.toml"));
    if let Err(e) = tx3_registry_tracker::run(path).await {
        error!(error = %e, "tracker exited with error");
        std::process::exit(1);
    }
}

fn init_tracing() {
    let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("tracker=info,tx3_registry_tracker=info"));
    tracing_subscriber::fmt().with_env_filter(filter).init();
}
