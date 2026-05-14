use async_graphql::{EmptyMutation, EmptySubscription, Schema};
use sqlx::PgPool;
use tx3_registry_backend::schema::Query;

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

fn build_test_schema(pool: PgPool) -> Schema<Query, EmptyMutation, EmptySubscription> {
    Schema::build(Query::default(), EmptyMutation, EmptySubscription)
        .data(pool)
        .finish()
}

#[sqlx::test(migrations = "../tracker/migrations")]
async fn protocol_matches_returns_first_page(pool: PgPool) {
    insert_match(&pool, "txpipe", "orcfax-burn", "1.0.0", &[1u8; 32]).await;
    insert_match(&pool, "txpipe", "orcfax-burn", "1.0.0", &[2u8; 32]).await;
    insert_match(&pool, "txpipe", "orcfax-burn", "1.0.0", &[3u8; 32]).await;

    let schema = build_test_schema(pool);

    let res = schema
        .execute(
            r#"{ protocolMatches(scope: "txpipe", name: "orcfax-burn", first: 2) {
                nodes { id txHash }
                pageInfo { hasNextPage endCursor }
            } }"#,
        )
        .await;

    assert!(res.errors.is_empty(), "unexpected errors: {:?}", res.errors);

    let data = res.data.into_json().unwrap();
    let nodes = &data["protocolMatches"]["nodes"];
    assert_eq!(nodes.as_array().unwrap().len(), 2, "expected 2 nodes");

    let has_next = data["protocolMatches"]["pageInfo"]["hasNextPage"]
        .as_bool()
        .unwrap();
    assert!(has_next, "expected hasNextPage=true");

    let end_cursor = &data["protocolMatches"]["pageInfo"]["endCursor"];
    assert!(!end_cursor.is_null(), "expected endCursor to be non-null");
}

#[sqlx::test(migrations = "../tracker/migrations")]
async fn protocol_matches_pagination_chain(pool: PgPool) {
    insert_match(&pool, "txpipe", "orcfax-burn", "1.0.0", &[1u8; 32]).await;
    insert_match(&pool, "txpipe", "orcfax-burn", "1.0.0", &[2u8; 32]).await;
    insert_match(&pool, "txpipe", "orcfax-burn", "1.0.0", &[3u8; 32]).await;
    insert_match(&pool, "txpipe", "orcfax-burn", "1.0.0", &[4u8; 32]).await;

    let schema = build_test_schema(pool);

    let res1 = schema
        .execute(
            r#"{ protocolMatches(scope: "txpipe", name: "orcfax-burn", first: 2) {
                nodes { id }
                pageInfo { hasNextPage endCursor }
            } }"#,
        )
        .await;
    assert!(res1.errors.is_empty(), "page1 errors: {:?}", res1.errors);

    let data1 = res1.data.into_json().unwrap();
    let nodes1 = data1["protocolMatches"]["nodes"].as_array().unwrap().clone();
    assert_eq!(nodes1.len(), 2, "page1 should have 2 nodes");

    let end_cursor = data1["protocolMatches"]["pageInfo"]["endCursor"]
        .as_str()
        .unwrap()
        .to_string();

    let query2 = format!(
        r#"{{ protocolMatches(scope: "txpipe", name: "orcfax-burn", first: 2, after: "{}") {{
            nodes {{ id }}
            pageInfo {{ hasNextPage endCursor }}
        }} }}"#,
        end_cursor
    );

    let res2 = schema.execute(query2).await;
    assert!(res2.errors.is_empty(), "page2 errors: {:?}", res2.errors);

    let data2 = res2.data.into_json().unwrap();
    let nodes2 = data2["protocolMatches"]["nodes"].as_array().unwrap().clone();
    assert_eq!(nodes2.len(), 2, "page2 should have 2 nodes");

    let has_next_page2 = data2["protocolMatches"]["pageInfo"]["hasNextPage"]
        .as_bool()
        .unwrap();
    assert!(!has_next_page2, "page2 hasNextPage should be false");

    let ids1: std::collections::HashSet<String> = nodes1
        .iter()
        .map(|n| n["id"].as_str().unwrap().to_string())
        .collect();
    let ids2: std::collections::HashSet<String> = nodes2
        .iter()
        .map(|n| n["id"].as_str().unwrap().to_string())
        .collect();

    assert!(ids1.is_disjoint(&ids2), "pages should have no overlapping ids");

    let all_ids: std::collections::HashSet<_> = ids1.union(&ids2).collect();
    assert_eq!(all_ids.len(), 4, "combined pages should cover all 4 rows");
}

#[sqlx::test(migrations = "../tracker/migrations")]
async fn protocol_matches_clamps_first(pool: PgPool) {
    for i in 1u8..=10 {
        insert_match(&pool, "txpipe", "orcfax-burn", "1.0.0", &[i; 32]).await;
    }

    let schema = build_test_schema(pool);

    // first: 0 should error
    let res_zero = schema
        .execute(
            r#"{ protocolMatches(scope: "txpipe", name: "orcfax-burn", first: 0) {
                nodes { id }
            } }"#,
        )
        .await;
    assert!(
        !res_zero.errors.is_empty(),
        "expected errors for first:0 but got none"
    );
    let error_msg = res_zero.errors[0].message.as_str();
    assert!(
        error_msg.contains("first must be >= 1"),
        "unexpected error message: {error_msg}"
    );

    // first: 999 should be clamped to 200 — no error, returns 10 rows (all that exist)
    let res_big = schema
        .execute(
            r#"{ protocolMatches(scope: "txpipe", name: "orcfax-burn", first: 999) {
                nodes { id }
            } }"#,
        )
        .await;
    assert!(
        res_big.errors.is_empty(),
        "unexpected errors for first:999: {:?}",
        res_big.errors
    );
    let data_big = res_big.data.into_json().unwrap();
    let count = data_big["protocolMatches"]["nodes"]
        .as_array()
        .unwrap()
        .len();
    assert!(count <= 200, "clamped first should not return more than 200 rows");
}

#[sqlx::test(migrations = "../tracker/migrations")]
async fn protocol_matches_filter_by_version(pool: PgPool) {
    insert_match(&pool, "txpipe", "orcfax-burn", "1.0.0", &[1u8; 32]).await;
    insert_match(&pool, "txpipe", "orcfax-burn", "1.0.0", &[2u8; 32]).await;
    insert_match(&pool, "txpipe", "orcfax-burn", "2.0.0", &[3u8; 32]).await;

    let schema = build_test_schema(pool);

    let res = schema
        .execute(
            r#"{ protocolMatches(scope: "txpipe", name: "orcfax-burn", version: "1.0.0") {
                nodes { id source { version } }
            } }"#,
        )
        .await;

    assert!(res.errors.is_empty(), "unexpected errors: {:?}", res.errors);

    let data = res.data.into_json().unwrap();
    let nodes = data["protocolMatches"]["nodes"].as_array().unwrap();
    assert_eq!(nodes.len(), 2, "expected exactly 2 nodes for version 1.0.0");

    for node in nodes {
        assert_eq!(
            node["source"]["version"].as_str().unwrap(),
            "1.0.0",
            "all nodes should have version 1.0.0"
        );
    }
}

#[sqlx::test(migrations = "../tracker/migrations")]
async fn protocol_matches_invalid_cursor_errors(pool: PgPool) {
    let schema = build_test_schema(pool);

    let res = schema
        .execute(
            r#"{ protocolMatches(scope: "txpipe", name: "orcfax-burn", after: "not-base64!") {
                nodes { id }
            } }"#,
        )
        .await;

    assert!(
        !res.errors.is_empty(),
        "expected errors for invalid cursor but got none"
    );
    let error_msg = res.errors[0].message.as_str();
    assert!(
        error_msg.contains("invalid cursor"),
        "unexpected error message: {error_msg}"
    );
}

#[sqlx::test(migrations = "../tracker/migrations")]
async fn protocol_matches_empty_result(pool: PgPool) {
    let schema = build_test_schema(pool);

    let res = schema
        .execute(
            r#"{ protocolMatches(scope: "x", name: "y") {
                nodes { id }
                pageInfo { hasNextPage }
            } }"#,
        )
        .await;

    assert!(res.errors.is_empty(), "unexpected errors: {:?}", res.errors);

    let data = res.data.into_json().unwrap();
    let nodes = data["protocolMatches"]["nodes"].as_array().unwrap();
    assert_eq!(nodes.len(), 0, "expected 0 nodes");

    let has_next = data["protocolMatches"]["pageInfo"]["hasNextPage"]
        .as_bool()
        .unwrap();
    assert!(!has_next, "expected hasNextPage=false for empty result");
}
