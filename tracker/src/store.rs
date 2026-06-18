// Runtime-checked queries (`sqlx::query` / `sqlx::query_as`) are used
// intentionally throughout this module so that `cargo build` does not require
// a live Postgres or a committed `.sqlx/` cache. If compile-time verification
// is wanted in the future, run `sqlx prepare` and commit the generated
// `.sqlx/` directory, then switch to `sqlx::query!` / `sqlx::query_as!`.
use sqlx::postgres::{PgPool, PgPoolOptions};
use sqlx::Row; // for row.get(idx)

use crate::error::Result;

/// A single Cardano chain position.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ChainPoint {
    pub slot: u64,
    pub hash: [u8; 32],
}

/// An owned copy of one matched-transaction row, ready to persist.
#[derive(Debug, Clone)]
pub struct OwnedMatchRow {
    pub tx_hash: Vec<u8>,
    pub block_slot: u64,
    pub block_hash: Vec<u8>,
    pub source_name: String,
    pub repo_scope: String,
    pub repo_name: String,
    pub repo_version: String,
    pub protocol_name: String,
    pub tx_name: String,
    pub profile_name: String,
    pub lifted_json: String,
    pub score: u32,
    pub match_rank: u32,
}

/// Postgres-backed persistence for the tracker daemon.
#[derive(Clone, Debug)]
pub struct Store {
    pool: PgPool,
}

impl Store {
    /// Open a connection pool to `database_url`, run pending migrations, and
    /// return a ready `Store`.
    pub async fn open(database_url: &str) -> Result<Self> {
        let pool = PgPoolOptions::new()
            .max_connections(8)
            .connect(database_url)
            .await?;

        sqlx::migrate!("./migrations").run(&pool).await?;

        Ok(Self { pool })
    }

    /// Construct a `Store` from an already-connected pool.
    ///
    /// **Test-only.** Use with `#[sqlx::test(migrations = "./migrations")]`
    /// which creates and migrates a fresh database before injecting the pool.
    /// Production code must go through [`Store::open`] so that migrations run.
    pub fn from_pool(pool: PgPool) -> Self {
        Self { pool }
    }

    /// Return the last persisted chain cursor, or `None` if none has been
    /// written yet.
    pub async fn cursor(&self) -> Result<Option<ChainPoint>> {
        let row = sqlx::query("SELECT slot, block_hash FROM cursor WHERE id = 1")
            .fetch_optional(&self.pool)
            .await?;

        Ok(row.and_then(|r| {
            let slot: i64 = r.get(0);
            // A negative slot indicates a corrupt or hostile row; treat it as
            // absent so the daemon starts from genesis rather than wrapping to
            // a phantom u64 intersect.
            if slot < 0 {
                return None;
            }
            let hash_bytes: Vec<u8> = r.get(1);
            let hash: [u8; 32] = hash_bytes.try_into().ok()?;
            Some(ChainPoint {
                slot: slot as u64,
                hash,
            })
        }))
    }

    /// Persist a batch of match rows and advance the cursor — all in one
    /// database transaction.  Re-inserting the same `(tx_hash, source_name)`
    /// pair is silently ignored (`ON CONFLICT DO NOTHING`).  Returns the
    /// number of rows actually inserted.
    pub async fn apply_block(
        &self,
        cursor: ChainPoint,
        rows: Vec<OwnedMatchRow>,
    ) -> Result<usize> {
        let mut tx = self.pool.begin().await?;
        let mut inserted = 0usize;

        for row in &rows {
            let n = sqlx::query(
                "INSERT INTO matches \
                   (tx_hash, block_slot, block_hash, source_name, \
                    repo_scope, repo_name, repo_version, \
                    protocol_name, tx_name, profile_name, lifted, \
                    score, match_rank) \
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, $13) \
                 ON CONFLICT (tx_hash, source_name) DO NOTHING",
            )
            .bind(&row.tx_hash)
            .bind(row.block_slot as i64)
            .bind(&row.block_hash)
            .bind(&row.source_name)
            .bind(&row.repo_scope)
            .bind(&row.repo_name)
            .bind(&row.repo_version)
            .bind(&row.protocol_name)
            .bind(&row.tx_name)
            .bind(&row.profile_name)
            .bind(&row.lifted_json) // bound as String; cast ::jsonb in SQL
            .bind(row.score as i32)
            .bind(row.match_rank as i32)
            .execute(&mut *tx)
            .await?
            .rows_affected();

            inserted += n as usize;
        }

        sqlx::query(
            "INSERT INTO cursor (id, slot, block_hash) VALUES (1, $1, $2) \
             ON CONFLICT (id) DO UPDATE SET slot = EXCLUDED.slot, block_hash = EXCLUDED.block_hash",
        )
        .bind(cursor.slot as i64)
        .bind(cursor.hash.as_slice())
        .execute(&mut *tx)
        .await?;

        tx.commit().await?;

        Ok(inserted)
    }

    /// Delete all matches for `tx_hash` and rewind the cursor to `parent` —
    /// all in one database transaction.  Returns the number of rows deleted.
    /// If `parent` is `None` the cursor row is removed entirely (rollback to
    /// genesis).
    pub async fn undo_tx(&self, tx_hash: Vec<u8>, parent: Option<ChainPoint>) -> Result<usize> {
        let mut tx = self.pool.begin().await?;

        let deleted = sqlx::query("DELETE FROM matches WHERE tx_hash = $1")
            .bind(&tx_hash)
            .execute(&mut *tx)
            .await?
            .rows_affected() as usize;

        match parent {
            Some(p) => {
                sqlx::query(
                    "INSERT INTO cursor (id, slot, block_hash) VALUES (1, $1, $2) \
                     ON CONFLICT (id) DO UPDATE SET slot = EXCLUDED.slot, block_hash = EXCLUDED.block_hash",
                )
                .bind(p.slot as i64)
                .bind(p.hash.as_slice())
                .execute(&mut *tx)
                .await?;
            }
            None => {
                sqlx::query("DELETE FROM cursor WHERE id = 1")
                    .execute(&mut *tx)
                    .await?;
            }
        }

        tx.commit().await?;

        Ok(deleted)
    }
}
