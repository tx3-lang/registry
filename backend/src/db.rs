// Runtime-checked queries (`sqlx::query`) are used intentionally so that
// `cargo build` does not require a live Postgres or a committed `.sqlx/` cache.
use sqlx::PgPool;
use sqlx::Row;

pub async fn open_pool(database_url: &str) -> Result<PgPool, sqlx::Error> {
    sqlx::postgres::PgPoolOptions::new()
        .max_connections(8)
        .connect(database_url)
        .await
}

/// A single row from the `matches` table, as read by the backend.
#[derive(Debug, Clone)]
pub struct MatchRow {
    pub id: i64,
    pub tx_hash: Vec<u8>,
    pub block_slot: i64,
    pub block_hash: Vec<u8>,
    pub source_name: String,
    pub protocol_name: String,
    pub profile_name: String,
    pub tx_name: String,
    pub repo_scope: String,
    pub repo_name: String,
    pub repo_version: String,
    /// The `lifted` JSONB column serialized as a JSON text string.
    pub lifted: String,
    pub matched_at: chrono::DateTime<chrono::Utc>,
}

const SELECT_COLS: &str =
    "id, tx_hash, block_slot, block_hash, source_name, protocol_name, \
     profile_name, tx_name, repo_scope, repo_name, repo_version, \
     lifted::text AS lifted, matched_at";

fn map_row(row: &sqlx::postgres::PgRow) -> MatchRow {
    MatchRow {
        id: row.get("id"),
        tx_hash: row.get("tx_hash"),
        block_slot: row.get("block_slot"),
        block_hash: row.get("block_hash"),
        source_name: row.get("source_name"),
        protocol_name: row.get("protocol_name"),
        profile_name: row.get("profile_name"),
        tx_name: row.get("tx_name"),
        repo_scope: row.get("repo_scope"),
        repo_name: row.get("repo_name"),
        repo_version: row.get("repo_version"),
        lifted: row.get("lifted"),
        matched_at: row.get("matched_at"),
    }
}

/// Fetch a page of matches for the given repository, ordered newest-first.
///
/// Pagination uses a `LIMIT N+1` strategy: if `first + 1` rows are returned,
/// `has_next` is `true` and the `Vec` is truncated to `first`. The caller is
/// responsible for clamping `first` to a safe range before calling.
pub async fn fetch_matches(
    pool: &PgPool,
    scope: &str,
    name: &str,
    version: Option<&str>,
    first: i64,
    after_id: Option<i64>,
) -> Result<(Vec<MatchRow>, bool), sqlx::Error> {
    let sql = format!(
        "SELECT {SELECT_COLS} FROM matches \
         WHERE repo_scope = $1 \
           AND repo_name = $2 \
           AND ($3::text IS NULL OR repo_version = $3) \
           AND ($4::bigint IS NULL OR id < $4) \
         ORDER BY id DESC \
         LIMIT $5"
    );

    let raw_rows = sqlx::query(&sql)
        .bind(scope)
        .bind(name)
        .bind(version)
        .bind(after_id)
        .bind(first + 1)
        .fetch_all(pool)
        .await?;

    let has_next = raw_rows.len() as i64 == first + 1;
    let mut rows: Vec<MatchRow> = raw_rows.iter().map(map_row).collect();
    if has_next {
        rows.truncate(first as usize);
    }

    Ok((rows, has_next))
}

/// Fetch a single match row by repository coordinates and transaction hash.
///
/// Returns `None` if no matching row exists.
pub async fn fetch_match(
    pool: &PgPool,
    scope: &str,
    name: &str,
    tx_hash: &[u8],
) -> Result<Option<MatchRow>, sqlx::Error> {
    let sql = format!(
        "SELECT {SELECT_COLS} FROM matches \
         WHERE repo_scope = $1 AND repo_name = $2 AND tx_hash = $3 \
         LIMIT 1"
    );

    let maybe_row = sqlx::query(&sql)
        .bind(scope)
        .bind(name)
        .bind(tx_hash)
        .fetch_optional(pool)
        .await?;

    Ok(maybe_row.as_ref().map(map_row))
}
