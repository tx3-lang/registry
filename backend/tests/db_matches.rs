use sqlx::PgPool;
use tx3_registry_backend::db::{fetch_match, fetch_matches};

async fn insert_match(pool: &PgPool, scope: &str, name: &str, version: &str, tx_hash: &[u8]) {
    let source_name = format!("{scope}/{name}:{version}");
    sqlx::query(
        "INSERT INTO matches \
           (tx_hash, block_slot, block_hash, source_name, \
            repo_scope, repo_name, repo_version, \
            protocol_name, tx_name, profile_name, lifted) \
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)",
    )
    .bind(tx_hash)
    .bind(0_i64)
    .bind(vec![0u8; 32])
    .bind(&source_name)
    .bind(scope)
    .bind(name)
    .bind(version)
    .bind("Test")
    .bind("test")
    .bind("tx")
    .bind("{}")
    .execute(pool)
    .await
    .expect("insert_match failed");
}

#[sqlx::test(migrations = "../tracker/migrations")]
async fn fetch_matches_filters_by_scope_and_name(pool: PgPool) {
    insert_match(&pool, "txpipe", "orcfax-burn", "1.0.0", &[1u8; 32]).await;
    insert_match(&pool, "txpipe", "orcfax-burn", "1.0.0", &[2u8; 32]).await;
    insert_match(&pool, "txpipe", "other", "1.0.0", &[3u8; 32]).await;
    insert_match(&pool, "other-scope", "orcfax-burn", "1.0.0", &[4u8; 32]).await;

    let (rows, has_next) = fetch_matches(&pool, "txpipe", "orcfax-burn", None, 10, None)
        .await
        .expect("fetch_matches failed");

    assert_eq!(rows.len(), 2);
    assert!(!has_next);
}

#[sqlx::test(migrations = "../tracker/migrations")]
async fn fetch_matches_orders_newest_first(pool: PgPool) {
    insert_match(&pool, "txpipe", "orcfax-burn", "1.0.0", &[1u8; 32]).await;
    insert_match(&pool, "txpipe", "orcfax-burn", "1.0.0", &[2u8; 32]).await;
    insert_match(&pool, "txpipe", "orcfax-burn", "1.0.0", &[3u8; 32]).await;

    let (rows, _) = fetch_matches(&pool, "txpipe", "orcfax-burn", None, 10, None)
        .await
        .expect("fetch_matches failed");

    assert_eq!(rows.len(), 3);
    // ids should be in descending order
    for window in rows.windows(2) {
        assert!(window[0].id > window[1].id, "rows should be ordered by id DESC");
    }
}

#[sqlx::test(migrations = "../tracker/migrations")]
async fn fetch_matches_filters_by_version(pool: PgPool) {
    insert_match(&pool, "txpipe", "orcfax-burn", "1.0.0", &[1u8; 32]).await;
    insert_match(&pool, "txpipe", "orcfax-burn", "2.0.0", &[2u8; 32]).await;
    insert_match(&pool, "txpipe", "orcfax-burn", "2.0.0", &[3u8; 32]).await;

    let (rows, has_next) =
        fetch_matches(&pool, "txpipe", "orcfax-burn", Some("2.0.0"), 10, None)
            .await
            .expect("fetch_matches failed");

    assert_eq!(rows.len(), 2);
    assert!(!has_next);
    for row in &rows {
        assert_eq!(row.repo_version, "2.0.0");
    }
}

#[sqlx::test(migrations = "../tracker/migrations")]
async fn fetch_matches_paginates_with_after_id(pool: PgPool) {
    for i in 1u8..=5 {
        insert_match(&pool, "txpipe", "orcfax-burn", "1.0.0", &[i; 32]).await;
    }

    let (page1, _) = fetch_matches(&pool, "txpipe", "orcfax-burn", None, 2, None)
        .await
        .expect("page1 fetch failed");
    assert_eq!(page1.len(), 2);

    // after_id = id of the oldest row in page1 (last element since DESC order)
    let oldest_in_page1 = page1.last().unwrap().id;

    let (page2, _) =
        fetch_matches(&pool, "txpipe", "orcfax-burn", None, 2, Some(oldest_in_page1))
            .await
            .expect("page2 fetch failed");
    assert_eq!(page2.len(), 2);

    // no overlapping ids
    let ids_p1: std::collections::HashSet<i64> = page1.iter().map(|r| r.id).collect();
    let ids_p2: std::collections::HashSet<i64> = page2.iter().map(|r| r.id).collect();
    assert!(
        ids_p1.is_disjoint(&ids_p2),
        "pages should have no overlapping ids"
    );

    // all 4 ids are distinct
    let all_ids: std::collections::HashSet<i64> = ids_p1.union(&ids_p2).copied().collect();
    assert_eq!(all_ids.len(), 4);

    // natural order: every id in page1 > every id in page2 (newest first across pages)
    let min_p1 = ids_p1.iter().copied().min().unwrap();
    let max_p2 = ids_p2.iter().copied().max().unwrap();
    assert!(min_p1 > max_p2, "page1 ids should all be newer than page2 ids");
}

#[sqlx::test(migrations = "../tracker/migrations")]
async fn fetch_matches_has_next_when_more_remain(pool: PgPool) {
    for i in 1u8..=3 {
        insert_match(&pool, "txpipe", "orcfax-burn", "1.0.0", &[i; 32]).await;
    }

    let (rows, has_next) = fetch_matches(&pool, "txpipe", "orcfax-burn", None, 2, None)
        .await
        .expect("fetch_matches failed");

    assert_eq!(rows.len(), 2);
    assert!(has_next);
}

#[sqlx::test(migrations = "../tracker/migrations")]
async fn fetch_matches_has_next_false_when_exhausted(pool: PgPool) {
    for i in 1u8..=2 {
        insert_match(&pool, "txpipe", "orcfax-burn", "1.0.0", &[i; 32]).await;
    }

    let (rows, has_next) = fetch_matches(&pool, "txpipe", "orcfax-burn", None, 5, None)
        .await
        .expect("fetch_matches failed");

    assert_eq!(rows.len(), 2);
    assert!(!has_next);
}

#[sqlx::test(migrations = "../tracker/migrations")]
async fn fetch_match_returns_row_by_hash(pool: PgPool) {
    let tx_hash = [42u8; 32];
    insert_match(&pool, "txpipe", "orcfax-burn", "1.0.0", &tx_hash).await;

    let result = fetch_match(&pool, "txpipe", "orcfax-burn", &tx_hash)
        .await
        .expect("fetch_match failed");

    assert!(result.is_some());
    let row = result.unwrap();
    assert_eq!(row.tx_hash, tx_hash.to_vec());
}

#[sqlx::test(migrations = "../tracker/migrations")]
async fn fetch_match_returns_none_when_missing(pool: PgPool) {
    let missing_hash = [99u8; 32];

    let result = fetch_match(&pool, "txpipe", "orcfax-burn", &missing_hash)
        .await
        .expect("fetch_match failed");

    assert!(result.is_none());
}

#[sqlx::test(migrations = "../tracker/migrations")]
async fn fetch_match_scope_isolation(pool: PgPool) {
    let tx_hash = [77u8; 32];
    insert_match(&pool, "txpipe", "orcfax-burn", "1.0.0", &tx_hash).await;

    let result = fetch_match(&pool, "other-scope", "orcfax-burn", &tx_hash)
        .await
        .expect("fetch_match failed");

    assert!(result.is_none());
}
