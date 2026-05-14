use async_graphql::{connection::{CursorType, Edge}, Context, Error, Object};

use crate::db;

use super::{Match, MatchConnection, MatchCursor};

#[derive(Default)]
pub struct MatchQuery;

#[Object]
impl MatchQuery {
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
