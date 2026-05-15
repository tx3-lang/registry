use std::{fs::File, io::Write};

use async_graphql::{EmptyMutation, EmptySubscription, MergedObject, Schema};
use sqlx::PgPool;

mod protocol;
pub mod pagination;
mod match_query;

pub use match_query::{Match, MatchConnection, MatchCursor};

// MARK: Query Struct
#[derive(MergedObject, Default)]
pub struct Query(protocol::ProtocolQuery, match_query::MatchQuery);

// MARK: End Query Struct
pub type Tx3Schema = Schema<Query, EmptyMutation, EmptySubscription>;

pub fn build_schema(pool: PgPool) -> Tx3Schema {
    let schema = Schema::build(Query::default(), EmptyMutation, EmptySubscription)
        // .limit_depth(4)
        .data(pool)
        .finish();

    let sdl = schema.sdl();
    let mut file = File::create("schema.graphql").expect("Failed to create schema file");
    file.write_all(sdl.as_bytes()).expect("Failed to write schema");

    return schema
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn regenerate_sdl() {
        let schema = Schema::build(Query::default(), EmptyMutation, EmptySubscription).finish();
        let sdl = schema.sdl();
        assert!(sdl.contains("protocolMatches"), "SDL must contain protocolMatches");
        let mut file = File::create("schema.graphql").expect("Failed to create schema file");
        file.write_all(sdl.as_bytes()).expect("Failed to write schema");
    }
}
