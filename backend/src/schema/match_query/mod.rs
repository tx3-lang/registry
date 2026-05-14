mod cursor;

#[allow(unused_imports)]
pub use cursor::{decode_cursor, encode_cursor, CursorError};

use async_graphql::{SimpleObject, ID};

use crate::db;
use super::pagination::PageInfo;

#[derive(SimpleObject, Clone)]
pub struct MatchSource {
    pub scope: String,
    pub name: String,
    pub version: String,
}

#[derive(SimpleObject, Clone)]
pub struct Match {
    pub id: ID,
    pub tx_hash: String,
    pub tx_name: String,
    pub source: MatchSource,
    pub profile_name: String,
    pub protocol_name: String,
    /// Stored as decimal string to preserve full u64 range.
    pub block_slot: String,
    pub block_hash: String,
    /// ISO 8601 UTC timestamp with literal Z suffix, no fractional seconds.
    pub matched_at: String,
    pub lifted: String,
}

#[derive(SimpleObject, Clone)]
pub struct MatchEdge {
    pub node: Match,
    pub cursor: String,
}

#[derive(SimpleObject, Clone)]
pub struct MatchConnection {
    pub page_info: PageInfo,
    pub edges: Vec<MatchEdge>,
    pub nodes: Vec<Match>,
}

impl From<db::MatchRow> for Match {
    fn from(row: db::MatchRow) -> Self {
        Match {
            id: ID::from(row.id.to_string()),
            tx_hash: hex::encode(&row.tx_hash),
            tx_name: row.tx_name,
            source: MatchSource {
                scope: row.repo_scope,
                name: row.repo_name,
                version: row.repo_version,
            },
            profile_name: row.profile_name,
            protocol_name: row.protocol_name,
            block_slot: row.block_slot.to_string(),
            block_hash: hex::encode(&row.block_hash),
            matched_at: row.matched_at.format("%Y-%m-%dT%H:%M:%SZ").to_string(),
            lifted: row.lifted,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    fn make_row() -> db::MatchRow {
        db::MatchRow {
            id: 1,
            tx_hash: vec![0xab, 0xcd],
            block_slot: 12345,
            block_hash: vec![0x12, 0x34],
            source_name: "test-source".to_string(),
            protocol_name: "test-protocol".to_string(),
            profile_name: "test-profile".to_string(),
            tx_name: "test-tx".to_string(),
            repo_scope: "txpipe".to_string(),
            repo_name: "orcfax-burn".to_string(),
            repo_version: "1.0.0".to_string(),
            lifted: "{}".to_string(),
            matched_at: chrono::Utc.with_ymd_and_hms(2026, 5, 14, 10, 23, 45).unwrap(),
        }
    }

    #[test]
    fn match_from_db_row_renders_hex() {
        let mut row = make_row();
        row.tx_hash = vec![0xab, 0xcd];
        row.block_hash = vec![0x12, 0x34];
        let m = Match::from(row);
        assert_eq!(m.tx_hash, "abcd");
        assert_eq!(m.block_hash, "1234");
    }

    #[test]
    fn match_from_db_row_formats_matched_at() {
        let row = make_row();
        let m = Match::from(row);
        assert_eq!(m.matched_at, "2026-05-14T10:23:45Z");
    }

    #[test]
    fn match_from_db_row_builds_source() {
        let row = make_row();
        let m = Match::from(row);
        assert_eq!(m.source.scope, "txpipe");
        assert_eq!(m.source.name, "orcfax-burn");
        assert_eq!(m.source.version, "1.0.0");
    }
}
