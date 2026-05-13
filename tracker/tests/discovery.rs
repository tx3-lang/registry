//! Integration tests for `fetch_catalog` (no Zot, no Postgres required).
//!
//! # Fixture note
//!
//! No committed `.tii` file was found inside `tracker/examples/orcfax-burn/`
//! (the example relies on `trix build` at runtime). A minimal synthetic TII is
//! therefore used from `tests/fixtures/orcfax_burn.tii`. It declares one
//! profile (`"mainnet"`) and one transaction (`"burn"`), and is the smallest
//! JSON that `tx3_sdk::tii::spec::TiiFile` accepts without error.
//!
//! # OCI-client auth flow
//!
//! `oci-client` issues a `GET /v2/` request for every new registry (during
//! `apply_auth`). If the response has no `WWW-Authenticate` header the client
//! treats the registry as anonymous and proceeds without a token. We therefore
//! stub `/v2/` with a bare 200 to avoid an auth-challenge error.
//!
//! `_pull_manifest_and_config` also fetches the manifest *config* blob in
//! addition to the layer blobs. We stub `/v2/<repo>/blobs/<config-digest>`
//! with an empty JSON object (`{}`) as a dummy config. This satisfies the
//! content-length / digest consistency check because we compute the digest
//! from the actual bytes we serve.

use sha2::{Digest as _, Sha256};
use wiremock::{
    matchers::{method, path},
    Mock, MockServer, ResponseTemplate,
};

use tx3_registry_tracker::{
    config::{OciConfig, ProfileOverride},
    discovery::fetch_catalog,
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// Name of the profile declared in the fixture TII.
const DEFAULT_PROFILE: &str = "mainnet";

/// Raw fixture bytes — embedded at compile time.
const FIXTURE_TII: &[u8] = include_bytes!("fixtures/orcfax_burn.tii");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Compute `sha256:<hex>` of a byte slice.
fn sha256_hex(data: &[u8]) -> String {
    format!("sha256:{:x}", Sha256::digest(data))
}

/// Minimal dummy OCI config blob (`{}`).  Used to satisfy
/// `_pull_manifest_and_config`'s config-blob pull without carrying real data.
fn dummy_config_bytes() -> Vec<u8> {
    b"{}".to_vec()
}

/// Build an OCI image manifest JSON string for a single `application/tii+json`
/// layer.  The manifest `mediaType` is the OCI v1 image type, which is in the
/// allowed set that `validate_image_manifest` accepts.
fn manifest_json(tii_bytes: &[u8]) -> Vec<u8> {
    let tii_digest = sha256_hex(tii_bytes);
    let tii_size = tii_bytes.len();

    let config_bytes = dummy_config_bytes();
    let config_digest = sha256_hex(&config_bytes);
    let config_size = config_bytes.len();

    let json = format!(
        r#"{{
  "schemaVersion": 2,
  "mediaType": "application/vnd.oci.image.manifest.v1+json",
  "config": {{
    "mediaType": "application/vnd.oci.image.config.v1+json",
    "digest": "{config_digest}",
    "size": {config_size}
  }},
  "layers": [
    {{
      "mediaType": "application/tii+json",
      "digest": "{tii_digest}",
      "size": {tii_size}
    }}
  ]
}}"#
    );
    json.into_bytes()
}

/// OCI manifest JSON for Step 7: only has non-TII layers so `pull` rejects it.
fn manifest_json_no_tii_layer() -> Vec<u8> {
    let dummy = dummy_config_bytes();
    let config_digest = sha256_hex(&dummy);
    let config_size = dummy.len();

    // Produce a plausible layer with a wrong media type.
    let layer_bytes = b"fake tx3 blob";
    let layer_digest = sha256_hex(layer_bytes);
    let layer_size = layer_bytes.len();

    let json = format!(
        r#"{{
  "schemaVersion": 2,
  "mediaType": "application/vnd.oci.image.manifest.v1+json",
  "config": {{
    "mediaType": "application/vnd.oci.image.config.v1+json",
    "digest": "{config_digest}",
    "size": {config_size}
  }},
  "layers": [
    {{
      "mediaType": "application/tx3",
      "digest": "{layer_digest}",
      "size": {layer_size}
    }}
  ]
}}"#
    );
    json.into_bytes()
}

/// Returns a bare `OciConfig` pointing at `registry_url` with no filters.
fn oci_config(registry_url: &str) -> OciConfig {
    OciConfig {
        registry_url: registry_url.to_string(),
        include_scopes: vec![],
        include_names: vec![],
        exclude_scopes: vec![],
        exclude_names: vec![],
        profile_override: vec![],
    }
}

/// Two-page Zot GraphQL response: first page has two repos and `ItemCount ==
/// 100` (forces another round-trip); second page has zero repos and
/// `ItemCount == 0`.
fn zot_page1_json() -> serde_json::Value {
    serde_json::json!({
        "data": {
            "RepoListWithNewestImage": {
                "Page": { "TotalCount": 2, "ItemCount": 100 },
                "Results": [
                    {
                        "Name": "txpipe/orcfax-burn",
                        "NewestImage": { "Tag": "1.0.0", "Vendor": null }
                    },
                    {
                        "Name": "txpipe/transfer",
                        "NewestImage": { "Tag": "1.0.0", "Vendor": null }
                    }
                ]
            }
        }
    })
}

fn zot_page2_json() -> serde_json::Value {
    serde_json::json!({
        "data": {
            "RepoListWithNewestImage": {
                "Page": { "TotalCount": 2, "ItemCount": 0 },
                "Results": []
            }
        }
    })
}

/// Mount all the stubs needed for a two-repo two-page catalog against `server`.
///
/// This is shared across the happy-path tests (returns, include-filter, and
/// profile-override).  Each call is self-contained: the pagination mocks are
/// `up_to_n_times(1)` so they are consumed in insertion order.
async fn mount_two_repo_catalog(server: &MockServer) {
    let tii_bytes = FIXTURE_TII;
    let tii_digest = sha256_hex(tii_bytes);
    let manifest = manifest_json(tii_bytes);
    let manifest_digest = sha256_hex(&manifest);

    let config_bytes = dummy_config_bytes();
    let config_digest = sha256_hex(&config_bytes);

    // ----- Auth ping (/v2/) -----
    Mock::given(method("GET"))
        .and(path("/v2/"))
        .respond_with(ResponseTemplate::new(200))
        .mount(server)
        .await;

    // ----- GraphQL catalog: page 1 (consumed once) -----
    // priority 1 = highest in wiremock; this mock is consumed first.
    Mock::given(method("GET"))
        .and(path("/v2/_zot/ext/search"))
        .respond_with(ResponseTemplate::new(200).set_body_json(zot_page1_json()))
        .up_to_n_times(1)
        .with_priority(1)
        .mount(server)
        .await;

    // ----- GraphQL catalog: page 2 (consumed once) -----
    // priority 2 = lower than 1; this mock is matched on the second request.
    Mock::given(method("GET"))
        .and(path("/v2/_zot/ext/search"))
        .respond_with(ResponseTemplate::new(200).set_body_json(zot_page2_json()))
        .up_to_n_times(1)
        .with_priority(2)
        .mount(server)
        .await;

    // ----- OCI manifests -----
    for repo in ["txpipe/orcfax-burn", "txpipe/transfer"] {
        let manifest_path = format!("/v2/{repo}/manifests/1.0.0");
        Mock::given(method("GET"))
            .and(path(manifest_path))
            .respond_with(
                ResponseTemplate::new(200)
                    .insert_header("Content-Type", "application/vnd.oci.image.manifest.v1+json")
                    .insert_header("Docker-Content-Digest", manifest_digest.as_str())
                    .set_body_bytes(manifest.clone()),
            )
            .mount(server)
            .await;
    }

    // ----- OCI config blobs -----
    for repo in ["txpipe/orcfax-burn", "txpipe/transfer"] {
        let blob_path = format!("/v2/{repo}/blobs/{config_digest}");
        Mock::given(method("GET"))
            .and(path(blob_path))
            .respond_with(
                ResponseTemplate::new(200)
                    .insert_header("Docker-Content-Digest", config_digest.as_str())
                    .set_body_bytes(config_bytes.clone()),
            )
            .mount(server)
            .await;
    }

    // ----- OCI TII blobs -----
    for repo in ["txpipe/orcfax-burn", "txpipe/transfer"] {
        let blob_path = format!("/v2/{repo}/blobs/{tii_digest}");
        Mock::given(method("GET"))
            .and(path(blob_path))
            .respond_with(
                ResponseTemplate::new(200)
                    .insert_header("Docker-Content-Digest", tii_digest.as_str())
                    .set_body_bytes(tii_bytes),
            )
            .mount(server)
            .await;
    }
}

// ---------------------------------------------------------------------------
// Test 1: happy path — two repos, two pages
// ---------------------------------------------------------------------------

#[tokio::test]
async fn fetch_catalog_returns_discovered_sources() {
    let server = MockServer::start().await;
    mount_two_repo_catalog(&server).await;

    let oci = oci_config(&server.uri());
    let result = fetch_catalog(&oci, DEFAULT_PROFILE)
        .await
        .expect("fetch_catalog should succeed");

    assert_eq!(result.len(), 2, "should return exactly two entries");

    let names: Vec<&str> = result.iter().map(|s| s.source_name.as_str()).collect();
    assert!(
        names.contains(&"txpipe/orcfax-burn:1.0.0"),
        "expected txpipe/orcfax-burn:1.0.0 in {names:?}"
    );
    assert!(
        names.contains(&"txpipe/transfer:1.0.0"),
        "expected txpipe/transfer:1.0.0 in {names:?}"
    );
    for src in &result {
        assert_eq!(
            src.profile_name, DEFAULT_PROFILE,
            "profile_name should equal the default"
        );
    }
}

// ---------------------------------------------------------------------------
// Test 2: include_names filter
// ---------------------------------------------------------------------------

#[tokio::test]
async fn fetch_catalog_applies_include_filter() {
    let server = MockServer::start().await;
    mount_two_repo_catalog(&server).await;

    let mut oci = oci_config(&server.uri());
    oci.include_names = vec!["txpipe/orcfax-burn".to_string()];

    let result = fetch_catalog(&oci, DEFAULT_PROFILE)
        .await
        .expect("fetch_catalog should succeed");

    assert_eq!(result.len(), 1, "filter should leave exactly one entry");
    assert_eq!(result[0].source_name, "txpipe/orcfax-burn:1.0.0");
}

// ---------------------------------------------------------------------------
// Test 3: profile override
// ---------------------------------------------------------------------------

#[tokio::test]
async fn fetch_catalog_applies_profile_override() {
    let server = MockServer::start().await;
    mount_two_repo_catalog(&server).await;

    let mut oci = oci_config(&server.uri());
    oci.profile_override = vec![ProfileOverride {
        match_: "txpipe/orcfax-burn".to_string(),
        profile: "preprod".to_string(),
    }];

    let result = fetch_catalog(&oci, DEFAULT_PROFILE)
        .await
        .expect("fetch_catalog should succeed");

    assert_eq!(result.len(), 2);

    let orcfax = result
        .iter()
        .find(|s| s.source_name == "txpipe/orcfax-burn:1.0.0")
        .expect("orcfax-burn entry must be present");
    assert_eq!(orcfax.profile_name, "preprod", "override should apply");

    let transfer = result
        .iter()
        .find(|s| s.source_name == "txpipe/transfer:1.0.0")
        .expect("transfer entry must be present");
    assert_eq!(
        transfer.profile_name, DEFAULT_PROFILE,
        "non-overridden entry keeps default profile"
    );
}

// ---------------------------------------------------------------------------
// Test 4: empty catalog error
// ---------------------------------------------------------------------------

#[tokio::test]
async fn fetch_catalog_errors_on_empty_catalog() {
    let server = MockServer::start().await;

    // Auth ping
    Mock::given(method("GET"))
        .and(path("/v2/"))
        .respond_with(ResponseTemplate::new(200))
        .mount(&server)
        .await;

    let empty_page = serde_json::json!({
        "data": {
            "RepoListWithNewestImage": {
                "Page": { "TotalCount": 0, "ItemCount": 0 },
                "Results": []
            }
        }
    });
    Mock::given(method("GET"))
        .and(path("/v2/_zot/ext/search"))
        .respond_with(ResponseTemplate::new(200).set_body_json(empty_page))
        .mount(&server)
        .await;

    let oci = oci_config(&server.uri());
    let err = fetch_catalog(&oci, DEFAULT_PROFILE)
        .await
        .expect_err("should fail on empty catalog");

    assert!(
        err.to_string().contains("OCI registry returned no protocols"),
        "error message should mention empty catalog, got: {err}"
    );
}

// ---------------------------------------------------------------------------
// Test 5: missing tii+json layer
// ---------------------------------------------------------------------------

#[tokio::test]
async fn fetch_catalog_errors_on_missing_tii_layer() {
    let server = MockServer::start().await;

    let bad_manifest = manifest_json_no_tii_layer();
    let bad_manifest_digest = sha256_hex(&bad_manifest);

    // Auth ping
    Mock::given(method("GET"))
        .and(path("/v2/"))
        .respond_with(ResponseTemplate::new(200))
        .mount(&server)
        .await;

    // Single-page catalog with one repo
    let single_page = serde_json::json!({
        "data": {
            "RepoListWithNewestImage": {
                "Page": { "TotalCount": 1, "ItemCount": 0 },
                "Results": [
                    {
                        "Name": "txpipe/orcfax-burn",
                        "NewestImage": { "Tag": "1.0.0", "Vendor": null }
                    }
                ]
            }
        }
    });
    Mock::given(method("GET"))
        .and(path("/v2/_zot/ext/search"))
        .respond_with(ResponseTemplate::new(200).set_body_json(single_page))
        .mount(&server)
        .await;

    // Manifest with only an `application/tx3` layer (no tii+json)
    Mock::given(method("GET"))
        .and(path("/v2/txpipe/orcfax-burn/manifests/1.0.0"))
        .respond_with(
            ResponseTemplate::new(200)
                .insert_header(
                    "Content-Type",
                    "application/vnd.oci.image.manifest.v1+json",
                )
                .insert_header("Docker-Content-Digest", bad_manifest_digest.as_str())
                .set_body_bytes(bad_manifest),
        )
        .mount(&server)
        .await;

    // Stub the config blob referenced by the bad manifest
    let config_bytes = dummy_config_bytes();
    let config_digest = sha256_hex(&config_bytes);
    Mock::given(method("GET"))
        .and(path(format!(
            "/v2/txpipe/orcfax-burn/blobs/{config_digest}"
        )))
        .respond_with(
            ResponseTemplate::new(200)
                .insert_header("Docker-Content-Digest", config_digest.as_str())
                .set_body_bytes(config_bytes),
        )
        .mount(&server)
        .await;

    // Stub the tx3 layer blob too (oci-client pulls it before we inspect)
    let layer_bytes: &[u8] = b"fake tx3 blob";
    let layer_digest = sha256_hex(layer_bytes);
    Mock::given(method("GET"))
        .and(path(format!(
            "/v2/txpipe/orcfax-burn/blobs/{layer_digest}"
        )))
        .respond_with(
            ResponseTemplate::new(200)
                .insert_header("Docker-Content-Digest", layer_digest.as_str())
                .set_body_bytes(layer_bytes),
        )
        .mount(&server)
        .await;

    let oci = oci_config(&server.uri());
    let err = fetch_catalog(&oci, DEFAULT_PROFILE)
        .await
        .expect_err("should fail when no tii+json layer");

    // oci-client's validate_layers rejects the manifest before pull_tii even
    // runs, because pull() is called with accepted_media_types=[TII_MEDIA_TYPE]
    // and the manifest only has an `application/tx3` layer. The error surfaces
    // as Error::OciRegistry(IncompatibleLayerMediaTypeError).
    let msg = err.to_string();
    assert!(
        msg.contains("Incompatible layer media type")
            || msg.contains("has no application/tii+json layer"),
        "error message should indicate missing tii+json layer, got: {msg}"
    );
}
