use sqlx::postgres::PgPool;
use tx3_registry_tracker::store::{ChainPoint, OwnedMatchRow, Store};

fn sample_match_row() -> OwnedMatchRow {
    OwnedMatchRow {
        tx_hash: vec![0xAAu8; 32],
        block_slot: 1_000,
        block_hash: vec![0xBBu8; 32],
        source_name: "test-source".to_string(),
        protocol_name: "test-protocol".to_string(),
        tx_name: "test-tx".to_string(),
        profile_name: "test-profile".to_string(),
        lifted_json: r#"{"tx_id":"aa","protocol_name":"test-protocol"}"#.to_string(),
    }
}

fn sample_cursor() -> ChainPoint {
    ChainPoint {
        slot: 1_000,
        hash: [0xBBu8; 32],
    }
}

#[sqlx::test(migrations = "./migrations")]
async fn reinserting_same_match_is_noop(pool: PgPool) {
    let store = Store::from_pool(pool);
    let row = sample_match_row();
    let cursor = sample_cursor();

    let n1 = store
        .apply_block(cursor, vec![row.clone()])
        .await
        .expect("first apply_block failed");
    let n2 = store
        .apply_block(cursor, vec![row.clone()])
        .await
        .expect("second apply_block failed");

    assert_eq!(n1, 1, "first apply_block should insert exactly one row");
    assert_eq!(n2, 0, "second apply_block must be a no-op: UNIQUE(tx_hash, source_name) + ON CONFLICT DO NOTHING");
}
