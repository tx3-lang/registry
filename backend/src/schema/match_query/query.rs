use async_graphql::{connection::{CursorType, Edge}, Context, Error, Object};

use crate::db;

use super::{Match, MatchConnection, MatchCursor};

#[derive(Default)]
pub struct MatchQuery;

#[Object]
impl MatchQuery {
    async fn protocol_match(
        &self,
        ctx: &Context<'_>,
        scope: String,
        name: String,
        tx_hash: String,
    ) -> Result<Option<Match>, Error> {
        let is_valid_hex = tx_hash.chars().all(|c| c.is_ascii_hexdigit());
        if !is_valid_hex || tx_hash.len() % 2 != 0 {
            return Err(Error::new("invalid txHash"));
        }

        let bytes = hex::decode(&tx_hash).map_err(|_| Error::new("invalid txHash"))?;

        let pool = ctx.data_unchecked::<sqlx::PgPool>();

        let row = db::fetch_match(pool, &scope, &name, &bytes)
            .await
            .map_err(|e| {
                eprintln!("database error in protocol_match: {e}");
                Error::new("database unavailable")
            })?;

        Ok(row.map(Match::from))
    }

    async fn protocol_matches(
        &self,
        ctx: &Context<'_>,
        scope: String,
        name: String,
        version: Option<String>,
        first: Option<i32>,
        after: Option<String>,
    ) -> Result<MatchConnection, Error> {
        let first_i64: i64 = match first {
            None => 50,
            Some(n) if n < 1 => return Err(Error::new("first must be >= 1")),
            Some(n) if n > 200 => 200,
            Some(n) => n as i64,
        };

        let after_id: Option<i64> = match after.as_deref() {
            None => None,
            Some(cursor) => {
                let mc = MatchCursor::decode_cursor(cursor)
                    .map_err(|_| Error::new("invalid cursor"))?;
                Some(mc.0)
            }
        };

        let pool = ctx.data_unchecked::<sqlx::PgPool>();

        let (rows, has_next) = db::fetch_matches(pool, &scope, &name, version.as_deref(), first_i64, after_id)
            .await
            .map_err(|e| {
                eprintln!("database error in protocol_matches: {e}");
                Error::new("database unavailable")
            })?;

        let mut connection = MatchConnection::new(after.is_some(), has_next);
        for row in rows {
            connection.edges.push(Edge::new(MatchCursor(row.id), Match::from(row)));
        }

        Ok(connection)
    }
}
