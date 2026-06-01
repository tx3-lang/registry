use async_graphql::http::GraphiQLSource;
use async_graphql_rocket::{GraphQLRequest, GraphQLResponse};
use dotenvy::dotenv;
use rocket::{
    http::{ContentType, Header, Method, Status},
    response::content::RawHtml,
    State,
};
use rocket_cors::{AllowedHeaders, AllowedOrigins};

use tx3_registry_backend::{cache::{Cached, DiskCache}, db, oci, og_card, schema};

#[macro_use]
extern crate rocket;

#[get("/")]
fn index<'a>() -> &'a str {
    "Hello, world!"
}

#[post("/graphql", data = "<req>", format = "application/json")]
async fn graphql_request(schema: &State<schema::Tx3Schema>, req: GraphQLRequest) -> GraphQLResponse {
    req.execute(schema.inner()).await
}

#[get("/graphql")]
async fn graphql() -> RawHtml<String> {
    rocket::response::content::RawHtml(GraphiQLSource::build().endpoint("/graphql").finish())
}

/// Stream a protocol's logo from the OCI artifact at its newest tag.
/// Returns 404 when the protocol does not exist or carries no `image/png`
/// layer. Per-version immutability lets us cache aggressively.
#[get("/protocols/<scope>/<name>/logo")]
async fn protocol_logo(
    scope: &str,
    name: &str,
    cache: &State<DiskCache>,
) -> Result<(ContentType, Vec<u8>), Status> {
    // OCI repository names are canonically lowercase, but the scope reaching this
    // handler comes from the client (ultimately the image's `Vendor` annotation,
    // which preserves the publisher's display casing, e.g. `SundaeSwap-finance`).
    // Lowercase both path components so the lookup matches the stored repo.
    let repo = format!("{}/{}", scope.to_lowercase(), name.to_lowercase());

    // Remember not-found repos briefly so crawler hits on missing paths don't
    // keep round-tripping to the registry.
    let nf_key = format!("nf/{repo}");
    if let Some(Cached::Negative) = cache.get(&nf_key).await {
        return Err(Status::NotFound);
    }

    let tag = match oci::newest_tag(&repo).await {
        Ok(Some(tag)) => tag,
        Ok(None) => {
            cache.put_negative(&nf_key).await;
            return Err(Status::NotFound);
        }
        Err(_) => return Err(Status::BadGateway),
    };

    // The logo bytes are immutable per published version, so key on the tag and
    // serve from disk on a hit, skipping the heavy OCI pull.
    let key = format!("logo/{repo}/{tag}");
    match cache.get(&key).await {
        Some(Cached::Bytes(bytes)) => return Ok((ContentType::PNG, bytes)),
        Some(Cached::Negative) => return Err(Status::NotFound),
        None => {}
    }

    let image = oci::get_oci_image(&repo, &tag)
        .await
        .map_err(|_| Status::BadGateway)?;

    match oci::get_logo_png(&image) {
        Some(bytes) => {
            cache.put(&key, bytes.clone()).await;
            Ok((ContentType::PNG, bytes))
        }
        None => {
            cache.put_negative(&key).await;
            Err(Status::NotFound)
        }
    }
}

/// A PNG response carrying cache headers. The card is immutable per published
/// version, so we cache aggressively and key the ETag on version + layout.
#[derive(Responder)]
struct CardResponse {
    body: (ContentType, Vec<u8>),
    cache_control: Header<'static>,
    etag: Header<'static>,
}

/// Render a protocol's social/Open Graph card as a 1200×630 PNG.
/// Returns 404 when the protocol does not exist. The logo is read from the same
/// OCI image used to build the protocol, so there is no extra registry fetch.
#[get("/protocols/<scope>/<name>/og.png")]
async fn protocol_og_card(
    scope: &str,
    name: &str,
    cache: &State<DiskCache>,
) -> Result<CardResponse, Status> {
    let repo = format!("{}/{}", scope.to_lowercase(), name.to_lowercase());

    let nf_key = format!("nf/{repo}");
    if let Some(Cached::Negative) = cache.get(&nf_key).await {
        return Err(Status::NotFound);
    }

    // Resolve the newest tag first (cheap search) so we can key the cache and,
    // on a hit, skip both the OCI pull and the SVG→PNG rasterization.
    let resolved = match schema::protocol::resolve_protocol(scope, name).await {
        Ok(Some(resolved)) => resolved,
        Ok(None) => {
            cache.put_negative(&nf_key).await;
            return Err(Status::NotFound);
        }
        Err(_) => return Err(Status::BadGateway),
    };

    let tag = resolved.tag();
    let key = format!("og/v{}/{}/{}", og_card::LAYOUT_VERSION, repo, tag);
    let etag = format!("\"og-v{}-{}\"", og_card::LAYOUT_VERSION, tag);

    let make_response = |png: Vec<u8>| CardResponse {
        body: (ContentType::PNG, png),
        cache_control: Header::new("Cache-Control", "public, max-age=3600, s-maxage=86400"),
        etag: Header::new("ETag", etag.clone()),
    };

    if let Some(Cached::Bytes(png)) = cache.get(&key).await {
        return Ok(make_response(png));
    }

    let (protocol, image) = schema::protocol::build_protocol(resolved)
        .await
        .map_err(|_| Status::BadGateway)?;

    let card = protocol.to_card_data(oci::get_logo_png(&image));
    let png = og_card::render_card(&card).map_err(|e| {
        eprintln!("og card render failed for {scope}/{name}: {e}");
        Status::InternalServerError
    })?;

    cache.put(&key, png.clone()).await;
    Ok(make_response(png))
}

#[launch]
async fn rocket() -> _ {
    let _ = dotenv();

    let database_url = std::env::var("DATABASE_URL")
        .unwrap_or_default();
    if database_url.is_empty() {
        panic!("DATABASE_URL is required but was not set or is empty");
    }

    let pool = db::open_pool(&database_url)
        .await
        .expect("failed to open Postgres pool");

    let cors = rocket_cors::CorsOptions {
        allowed_origins: AllowedOrigins::All,
        allowed_methods: vec![Method::Get, Method::Post, Method::Options].into_iter().map(From::from).collect(),
        allowed_headers: AllowedHeaders::some(&["Authorization", "Accept"]),
        allow_credentials: true,
        ..Default::default()
    }
    .to_cors().unwrap();

    let schema = schema::build_schema(pool.clone());

    let cache = DiskCache::from_env().expect("failed to initialize disk cache");

    rocket::build()
        .manage(pool)
        .manage(schema)
        .manage(cache)
        .mount("/", routes![index, graphql, graphql_request, protocol_logo, protocol_og_card])
        .attach(cors)
}