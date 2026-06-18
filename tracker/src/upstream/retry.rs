//! Transient-error classification and reconnect backoff for the WatchTx stream.
//!
//! A long-lived gRPC stream against a managed endpoint is interrupted
//! periodically: idle drop, GOAWAY/connection recycling, brief provider
//! restarts. Those interruptions are recoverable — reconnect and resume from
//! the persisted cursor. Auth/argument failures are not (retrying just loops on
//! the same rejection), so they stay fatal.

use std::time::Duration;

/// Whether a stream/subscribe failure with this gRPC code is worth a reconnect.
/// Transport-level interruptions are transient; configuration, auth, and
/// bad-request failures are permanent and must surface as fatal.
pub fn is_transient(code: tonic::Code) -> bool {
    use tonic::Code::*;
    matches!(
        code,
        Unknown
            | Unavailable
            | Aborted
            | Cancelled
            | DeadlineExceeded
            | Internal
            | ResourceExhausted
    )
}

/// Capped exponential backoff between reconnect attempts. Reset after a
/// connection proves healthy (yields at least one message) so an occasional
/// blip doesn't permanently inflate the delay.
#[derive(Debug, Clone)]
pub struct Backoff {
    current: Duration,
    initial: Duration,
    max: Duration,
}

impl Backoff {
    pub fn new(initial: Duration, max: Duration) -> Self {
        Self {
            current: initial,
            initial,
            max,
        }
    }

    /// Return the delay to wait before the next attempt, then advance the
    /// schedule (double, capped at `max`).
    pub fn next_delay(&mut self) -> Duration {
        let delay = self.current;
        self.current = self
            .current
            .checked_mul(2)
            .unwrap_or(self.max)
            .min(self.max);
        delay
    }

    /// Return to the initial delay after a healthy connection.
    pub fn reset(&mut self) {
        self.current = self.initial;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn transport_codes_reconnect() {
        // The h2 "error reading a body from connection" surfaces as Unknown; a
        // recycled or unreachable upstream as Unavailable. All of these must
        // reconnect rather than kill the process.
        for code in [
            tonic::Code::Unknown,
            tonic::Code::Unavailable,
            tonic::Code::Aborted,
            tonic::Code::Cancelled,
            tonic::Code::DeadlineExceeded,
            tonic::Code::Internal,
            tonic::Code::ResourceExhausted,
        ] {
            assert!(is_transient(code), "{code:?} should reconnect");
        }
    }

    #[test]
    fn config_and_auth_codes_are_fatal() {
        // Retrying these would loop forever on the same rejection.
        for code in [
            tonic::Code::InvalidArgument,
            tonic::Code::Unauthenticated,
            tonic::Code::PermissionDenied,
            tonic::Code::NotFound,
            tonic::Code::Unimplemented,
            tonic::Code::FailedPrecondition,
        ] {
            assert!(!is_transient(code), "{code:?} should be fatal");
        }
    }

    #[test]
    fn backoff_doubles_and_caps() {
        let mut b = Backoff::new(Duration::from_secs(1), Duration::from_secs(8));
        assert_eq!(b.next_delay(), Duration::from_secs(1));
        assert_eq!(b.next_delay(), Duration::from_secs(2));
        assert_eq!(b.next_delay(), Duration::from_secs(4));
        assert_eq!(b.next_delay(), Duration::from_secs(8));
        assert_eq!(b.next_delay(), Duration::from_secs(8), "must cap at max");
    }

    #[test]
    fn backoff_reset_returns_to_initial() {
        let mut b = Backoff::new(Duration::from_secs(1), Duration::from_secs(8));
        b.next_delay();
        b.next_delay();
        b.reset();
        assert_eq!(b.next_delay(), Duration::from_secs(1));
    }
}
