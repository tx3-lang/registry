use async_graphql::http::GraphiQLSource;
use async_graphql_rocket::{GraphQLRequest, GraphQLResponse};
use dotenvy::dotenv;
use rocket::{http::Method, response::content::RawHtml, State};
use rocket_cors::{AllowedHeaders, AllowedOrigins};

mod schema;
mod oci;
mod ast_to_svg;

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

#[launch]
fn rocket() -> _ {
    let _ = dotenv();

    let cors = rocket_cors::CorsOptions {
        allowed_origins: AllowedOrigins::All,
        allowed_methods: vec![Method::Get, Method::Post, Method::Options].into_iter().map(From::from).collect(),
        allowed_headers: AllowedHeaders::some(&["Authorization", "Accept"]),
        allow_credentials: true,
        ..Default::default()
    }
    .to_cors().unwrap();
    
    let schema = schema::build_schema();

    rocket::build()
        .manage(schema)
        .mount("/", routes![index, graphql, graphql_request])
        .attach(cors)
}