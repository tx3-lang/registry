use async_graphql::http::GraphiQLSource;
use async_graphql_rocket::{GraphQLRequest, GraphQLResponse};
use dotenvy::dotenv;
use rocket::{
    http::{ContentType, Header, Method, Status},
    response::content::RawHtml,
    State,
};
use rocket_cors::{AllowedHeaders, AllowedOrigins};

use tx3_registry_backend::{db, oci, og_card, schema};

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
) -> Result<(ContentType, Vec<u8>), Status> {
    // OCI repository names are canonically lowercase, but the scope reaching this
    // handler comes from the client (ultimately the image's `Vendor` annotation,
    // which preserves the publisher's display casing, e.g. `SundaeSwap-finance`).
    // Lowercase both path components so the lookup matches the stored repo.
    let repo = format!("{}/{}", scope.to_lowercase(), name.to_lowercase());
    let tag = match oci::newest_tag(&repo).await {
        Ok(Some(tag)) => tag,
        Ok(None) => return Err(Status::NotFound),
        Err(_) => return Err(Status::BadGateway),
    };
    let image = oci::get_oci_image(&repo, &tag)
        .await
        .map_err(|_| Status::BadGateway)?;
    let bytes = oci::get_logo_png(&image).ok_or(Status::NotFound)?;
    Ok((ContentType::PNG, bytes))
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
async fn protocol_og_card(scope: &str, name: &str) -> Result<CardResponse, Status> {
    let (protocol, image) = match schema::protocol::load_protocol(scope, name).await {
        Ok(Some(pair)) => pair,
        Ok(None) => return Err(Status::NotFound),
        Err(_) => return Err(Status::BadGateway),
    };

    let logo = oci::get_logo_png(&image);
    let card = protocol.to_card_data(logo);
    let etag = format!("\"og-v{}-{}\"", og_card::LAYOUT_VERSION, card.version);

    let png = og_card::render_card(&card).map_err(|e| {
        eprintln!("og card render failed for {scope}/{name}: {e}");
        Status::InternalServerError
    })?;

    Ok(CardResponse {
        body: (ContentType::PNG, png),
        cache_control: Header::new("Cache-Control", "public, max-age=3600, s-maxage=86400"),
        etag: Header::new("ETag", etag),
    })
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

    rocket::build()
        .manage(pool)
        .manage(schema)
        .mount("/", routes![index, graphql, graphql_request, protocol_logo, protocol_og_card])
        .attach(cors)
}