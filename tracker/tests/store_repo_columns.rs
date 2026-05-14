use sqlx::postgres::PgPool;
use sqlx::Row;
use tx3_registry_tracker::store::{ChainPoint, OwnedMatchRow, Store};

fn sample_cursor() -> ChainPoint {
    ChainPoint {
        slot: 5_000,
        hash: [0xDDu8; 32],
    }
}

#[sqlx::test(migrations = "./migrations")]
async fn apply_block_persists_repo_columns(pool: PgPool) {
    let store = Store::from_pool(pool.clone());
    let cursor = sample_cursor();

    let row = OwnedMatchRow {
        tx_hash: vec![0x10u8; 32],
        block_slot: 5_000,
        block_hash: vec![0xDDu8; 32],
        source_name: "txpipe/orcfax-burn:2.0.1".to_string(),
        repo_scope: "txpipe".to_string(),
        repo_name: "orcfax-burn".to_string(),
        repo_version: "2.0.1".to_string(),
        protocol_name: "orcfax-burn".to_string(),
        tx_name: "burn".to_string(),
        profile_name: "mainnet".to_string(),
        lifted_json: r#"{"tx_id":"10","protocol_name":"orcfax-burn"}"#.to_string(),
    };

    store
        .apply_block(cursor, vec![row])
        .await
        .expect("apply_block failed");

    let db_row = sqlx::query(
        "SELECT repo_scope, repo_name, repo_version FROM matches WHERE source_name = $1",
    )
    .bind("txpipe/orcfax-burn:2.0.1")
    .fetch_one(&pool)
    .await
    .expect("select failed");

    let repo_scope: String = db_row.get(0);
    let repo_name: String = db_row.get(1);
    let repo_version: String = db_row.get(2);

    assert_eq!(repo_scope, "txpipe");
    assert_eq!(repo_name, "orcfax-burn");
    assert_eq!(repo_version, "2.0.1");
}

#[sqlx::test(migrations = "./migrations")]
async fn apply_block_handles_multiple_versions_distinctly(pool: PgPool) {
    let store = Store::from_pool(pool.clone());

    let cursor_a = ChainPoint {
        slot: 6_000,
        hash: [0xEEu8; 32],
    };
    let cursor_b = ChainPoint {
        slot: 7_000,
        hash: [0xFFu8; 32],
    };

    let row_a = OwnedMatchRow {
        tx_hash: vec![0x20u8; 32],
        block_slot: 6_000,
        block_hash: vec![0xEEu8; 32],
        source_name: "txpipe/orcfax-burn:1.0.0".to_string(),
        repo_scope: "txpipe".to_string(),
        repo_name: "orcfax-burn".to_string(),
        repo_version: "1.0.0".to_string(),
        protocol_name: "orcfax-burn".to_string(),
        tx_name: "burn".to_string(),
        profile_name: "mainnet".to_string(),
        lifted_json: r#"{"tx_id":"20","protocol_name":"orcfax-burn"}"#.to_string(),
    };

    let row_b = OwnedMatchRow {
        tx_hash: vec![0x21u8; 32],
        block_slot: 7_000,
        block_hash: vec![0xFFu8; 32],
        source_name: "txpipe/orcfax-burn:2.0.0".to_string(),
        repo_scope: "txpipe".to_string(),
        repo_name: "orcfax-burn".to_string(),
        repo_version: "2.0.0".to_string(),
        protocol_name: "orcfax-burn".to_string(),
        tx_name: "burn".to_string(),
        profile_name: "mainnet".to_string(),
        lifted_json: r#"{"tx_id":"21","protocol_name":"orcfax-burn"}"#.to_string(),
    };

    store
        .apply_block(cursor_a, vec![row_a])
        .await
        .expect("apply_block row_a failed");
    store
        .apply_block(cursor_b, vec![row_b])
        .await
        .expect("apply_block row_b failed");

    let count_row = sqlx::query(
        "SELECT COUNT(*) FROM matches WHERE repo_scope = 'txpipe' AND repo_name = 'orcfax-burn'",
    )
    .fetch_one(&pool)
    .await
    .expect("count query failed");

    let count: i64 = count_row.get(0);
    assert_eq!(count, 2, "expected two distinct rows for different versions");
}
