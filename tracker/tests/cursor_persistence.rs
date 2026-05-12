use sqlx::postgres::PgPool;
use tx3_registry_tracker::store::{ChainPoint, Store};

fn sample_cursor() -> ChainPoint {
    ChainPoint {
        slot: 42_000,
        hash: [0xCCu8; 32],
    }
}

#[sqlx::test(migrations = "./migrations")]
async fn cursor_survives_reopen(pool: PgPool) {
    let store = Store::from_pool(pool.clone());
    let cursor = sample_cursor();

    store
        .apply_block(cursor, vec![])
        .await
        .expect("apply_block failed");

    let reopened = Store::from_pool(pool);
    let got = reopened.cursor().await.expect("cursor() failed");

    assert_eq!(
        got.map(|c| (c.slot, c.hash)),
        Some((cursor.slot, cursor.hash)),
        "cursor read after reopen should equal cursor written",
    );
}
