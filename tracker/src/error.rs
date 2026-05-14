#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("config error: {0}")]
    Config(String),

    #[error("io: {0}")]
    Io(#[from] std::io::Error),

    #[error("toml decode: {0}")]
    TomlDe(#[from] toml::de::Error),

    #[error("json: {0}")]
    Json(#[from] serde_json::Error),

    #[error("hex decode: {0}")]
    Hex(#[from] hex::FromHexError),

    #[error("lift core: {0}")]
    Lift(#[from] tx3_lift::Error),

    #[error("lift cardano: {0}")]
    LiftCardano(#[from] tx3_lift_cardano::CardanoLiftError),

    #[error("tonic transport: {0}")]
    TonicTransport(#[from] tonic::transport::Error),

    #[error("rpc: {0}")]
    Rpc(#[from] tonic::Status),

    #[error("sqlx: {0}")]
    Sqlx(#[from] sqlx::Error),

    #[error("sqlx migrate: {0}")]
    SqlxMigrate(#[from] sqlx::migrate::MigrateError),

    #[error("tokio task join: {0}")]
    Join(#[from] tokio::task::JoinError),

    #[error("pallas decode: {0}")]
    PallasDecode(String),

    #[error("tx not found in containing block: {0}")]
    TxNotInBlock(String),

    #[error("oci registry: {0}")]
    OciRegistry(#[from] oci_client::errors::OciDistributionError),

    #[error("zot http: {0}")]
    ZotHttp(#[from] reqwest::Error),

    #[error("internal: {0}")]
    Internal(&'static str),
}

pub type Result<T> = std::result::Result<T, Error>;
