use sqlx::postgres::PgPool;
use sqlx::Row;

#[sqlx::test(migrations = "./migrations")]
async fn add_repo_columns_backfill_parses_source_name(pool: PgPool) {
    sqlx::query(
        "INSERT INTO matches \
           (tx_hash, block_slot, block_hash, source_name, \
            protocol_name, tx_name, profile_name, lifted, \
            repo_scope, repo_name, repo_version) \
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11)",
    )
    .bind(vec![0x01u8; 32])
    .bind(1_000i64)
    .bind(vec![0x02u8; 32])
    .bind("txpipe/orcfax-burn:1.0.0")
    .bind("test-protocol")
    .bind("test-tx")
    .bind("test-profile")
    .bind(r#"{"tx_id":"aa"}"#)
    .bind("") // repo_scope: empty to simulate pre-migration state
    .bind("") // repo_name
    .bind("") // repo_version
    .execute(&pool)
    .await
    .expect("insert failed");

    // Intentional replica of the migration's backfill SQL — sqlx::test pre-runs migrations so
    // we must re-apply it here to simulate a pre-existing row being backfilled.
    sqlx::query(
        "UPDATE matches \
         SET \
           repo_scope   = split_part(split_part(source_name, ':', 1), '/', 1), \
           repo_name    = split_part(split_part(source_name, ':', 1), '/', 2), \
           repo_version = split_part(source_name, ':', 2) \
         WHERE repo_scope = ''",
    )
    .execute(&pool)
    .await
    .expect("backfill update failed");

    let row = sqlx::query(
        "SELECT repo_scope, repo_name, repo_version FROM matches WHERE source_name = $1",
    )
    .bind("txpipe/orcfax-burn:1.0.0")
    .fetch_one(&pool)
    .await
    .expect("select failed");

    let repo_scope: String = row.get(0);
    let repo_name: String = row.get(1);
    let repo_version: String = row.get(2);

    assert_eq!(repo_scope, "txpipe");
    assert_eq!(repo_name, "orcfax-burn");
    assert_eq!(repo_version, "1.0.0");
}

#[sqlx::test(migrations = "./migrations")]
async fn idx_matches_repo_exists(pool: PgPool) {
    let row = sqlx::query(
        "SELECT indexname FROM pg_indexes \
         WHERE tablename = 'matches' AND indexname = 'idx_matches_repo'",
    )
    .fetch_optional(&pool)
    .await
    .expect("pg_indexes query failed");

    assert!(row.is_some(), "index idx_matches_repo not found in pg_indexes");
}
