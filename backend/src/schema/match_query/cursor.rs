use base64::{engine::general_purpose::STANDARD, Engine};
use std::fmt;

#[allow(dead_code)]
#[derive(Debug, PartialEq)]
pub enum CursorError {
    Malformed,
}

impl fmt::Display for CursorError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            CursorError::Malformed => write!(f, "invalid cursor"),
        }
    }
}

#[allow(dead_code)]
pub fn encode_cursor(id: i64) -> String {
    STANDARD.encode(format!("id:{}", id))
}

#[allow(dead_code)]
pub fn decode_cursor(cursor: &str) -> Result<i64, CursorError> {
    let bytes = STANDARD.decode(cursor).map_err(|_| CursorError::Malformed)?;
    let s = std::str::from_utf8(&bytes).map_err(|_| CursorError::Malformed)?;
    let suffix = s.strip_prefix("id:").ok_or(CursorError::Malformed)?;
    let id: i64 = suffix.parse().map_err(|_| CursorError::Malformed)?;
    if id < 0 {
        return Err(CursorError::Malformed);
    }
    Ok(id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use base64::{engine::general_purpose::STANDARD, Engine};

    #[test]
    fn roundtrip_encode_decode() {
        for &value in &[0i64, 1, 123, i64::MAX] {
            let encoded = encode_cursor(value);
            let decoded = decode_cursor(&encoded).expect("roundtrip should succeed");
            assert_eq!(decoded, value);
        }
    }

    #[test]
    fn decode_rejects_malformed_base64() {
        let result = decode_cursor("not!base64$");
        assert_eq!(result, Err(CursorError::Malformed));
    }

    #[test]
    fn decode_rejects_missing_prefix() {
        let cursor = STANDARD.encode("42");
        let result = decode_cursor(&cursor);
        assert_eq!(result, Err(CursorError::Malformed));
    }

    #[test]
    fn decode_rejects_trailing_junk() {
        let cursor = STANDARD.encode("id:42xyz");
        let result = decode_cursor(&cursor);
        assert_eq!(result, Err(CursorError::Malformed));
    }

    #[test]
    fn decode_rejects_negative_id() {
        let cursor = STANDARD.encode("id:-1");
        let result = decode_cursor(&cursor);
        assert_eq!(result, Err(CursorError::Malformed));
    }
}
