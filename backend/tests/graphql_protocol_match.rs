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
async fn protocol_match_returns_row_by_hash(pool: PgPool) {
    let tx_hash = [0u8; 32];
    insert_match(&pool, "txpipe", "orcfax-burn", "1.0.0", &tx_hash).await;

    let hex = hex::encode(tx_hash);
    let query = format!(
        r#"{{ protocolMatch(scope: "txpipe", name: "orcfax-burn", txHash: "{hex}") {{
            id txHash source {{ scope name version }}
        }} }}"#
    );

    let schema = build_test_schema(pool);
    let res = schema.execute(query).await;

    assert!(res.errors.is_empty(), "unexpected errors: {:?}", res.errors);

    let data = res.data.into_json().unwrap();
    let m = &data["protocolMatch"];
    assert!(!m.is_null(), "expected protocolMatch to be non-null");
    assert_eq!(
        m["txHash"].as_str().unwrap(),
        hex,
        "txHash should match hex input"
    );
    assert_eq!(m["source"]["scope"].as_str().unwrap(), "txpipe");
    assert_eq!(m["source"]["name"].as_str().unwrap(), "orcfax-burn");
}

#[sqlx::test(migrations = "../tracker/migrations")]
async fn protocol_match_returns_null_when_missing(pool: PgPool) {
    let tx_hash = [0xffu8; 32];
    let hex = hex::encode(tx_hash);
    let query = format!(
        r#"{{ protocolMatch(scope: "txpipe", name: "orcfax-burn", txHash: "{hex}") {{
            id txHash
        }} }}"#
    );

    let schema = build_test_schema(pool);
    let res = schema.execute(query).await;

    assert!(res.errors.is_empty(), "unexpected errors: {:?}", res.errors);

    let data = res.data.into_json().unwrap();
    assert!(
        data["protocolMatch"].is_null(),
        "expected protocolMatch to be null for missing hash"
    );
}

#[sqlx::test(migrations = "../tracker/migrations")]
async fn protocol_match_invalid_hex_errors(pool: PgPool) {
    let schema = build_test_schema(pool);

    let res = schema
        .execute(
            r#"{ protocolMatch(scope: "txpipe", name: "orcfax-burn", txHash: "ZZZZ") {
                id
            } }"#,
        )
        .await;

    assert!(
        !res.errors.is_empty(),
        "expected errors for invalid hex but got none"
    );
    let error_msg = res.errors[0].message.as_str();
    assert!(
        error_msg.contains("invalid txHash"),
        "unexpected error message: {error_msg}"
    );
}

#[sqlx::test(migrations = "../tracker/migrations")]
async fn protocol_match_odd_length_errors(pool: PgPool) {
    let schema = build_test_schema(pool);

    let res = schema
        .execute(
            r#"{ protocolMatch(scope: "txpipe", name: "orcfax-burn", txHash: "abc") {
                id
            } }"#,
        )
        .await;

    assert!(
        !res.errors.is_empty(),
        "expected errors for odd-length hex but got none"
    );
    let error_msg = res.errors[0].message.as_str();
    assert!(
        error_msg.contains("invalid txHash"),
        "unexpected error message: {error_msg}"
    );
}

#[sqlx::test(migrations = "../tracker/migrations")]
async fn protocol_match_scope_isolation(pool: PgPool) {
    let tx_hash = [0x42u8; 32];
    insert_match(&pool, "txpipe", "orcfax-burn", "1.0.0", &tx_hash).await;

    let hex = hex::encode(tx_hash);
    let query = format!(
        r#"{{ protocolMatch(scope: "other-scope", name: "orcfax-burn", txHash: "{hex}") {{
            id txHash
        }} }}"#
    );

    let schema = build_test_schema(pool);
    let res = schema.execute(query).await;

    assert!(res.errors.is_empty(), "unexpected errors: {:?}", res.errors);

    let data = res.data.into_json().unwrap();
    assert!(
        data["protocolMatch"].is_null(),
        "expected null for different scope"
    );
}
