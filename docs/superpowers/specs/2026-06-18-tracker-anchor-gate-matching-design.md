# Tracker — anchor-gate matching, scoring & resilience port — design

Status: approved (2026-06-18)
Scope: bring the `tx3-lift` "anchor gate matching and improvements" change
(`7e8bc32`) into the registry's Postgres tracker, plus the bundled upstream
resilience (reconnect/backoff) and the `utxorpc-spec 0.19.2` bump. Library
improvements arrive via a git `rev` bump; the tracker-level logic is ported
by hand because the registry tracker is a Postgres fork of `tx3-lift/bin/tracker`.
Out of scope: tx3-lift's Docker/CI changes (`#15`/`#17`) and its SQLite tracker.
The registry's OCI `discovery.rs` is untouched.

## Motivation

The registry tracker currently matches "loosely": for every specialized TII it
runs `lifter.match_tx` (fingerprint-based) and persists every hit. A single
on-chain transaction therefore lands under multiple protocols — the
**over-matching** problem we observed in production.

Upstream `tx3-lift` fixed this in commit `7e8bc32` ("anchor gate matching and
improvements") by deriving discriminating on-chain **anchors** from each TII
profile and using them to (a) **gate** a source out unless the transaction
actually forces one of its scripts to run, and (b) **score/rank** the surviving
candidates so a transaction resolves to its strongest match. The same commit
bundles upstream-stream **resilience** (HTTP/2 keepalives + reconnect with
capped backoff) and is followed by `842df42`, which adapts the tracker to
`utxorpc-spec 0.19.2`'s `Option<Bytes>` pattern fields.

Because the registry tracker is a **Postgres fork** of the upstream SQLite
tracker (it adds `discovery.rs`, `lib.rs`, repo columns, and uses `sqlx` instead
of `rusqlite`), a `rev` bump alone only pulls in the **library** crates
(`tx3-lift`, `tx3-lift-cardano`). The matching logic, config, schema, store, and
the resilience loop must be ported into the registry tracker by hand.

## What arrives for free (library `rev` bump)

Bumping the `tx3-lift` / `tx3-lift-cardano` git `rev` pulls in everything in
`crates/` at `7e8bc32` — confirmed to be the **only** library-touching commit in
the range `e8c91bf..origin/main`:

- `tx3_lift::anchors` → `ProtocolAnchors`, `AnchorHits` (re-exported from the
  crate root: `tx3_lift::{ProtocolAnchors, AnchorHits}`).
- `tx3_lift::fingerprint::Fingerprint::information_score()` — used by the score.
- `tx3-lift-cardano` lifting / datum-summarize improvements.

The library does **not** construct utxorpc `*Pattern` types, so it compiles
unchanged against `utxorpc-spec 0.19.2`. (Acceptance criterion below verifies.)

## Dependency changes — `tracker/Cargo.toml`

| Dependency | From | To |
|---|---|---|
| `tx3-lift` (git `rev`) | `e8c91bf652fe8558eae761c2d9509d518b952b89` | `827b499d6f790b19b235b4ed370d9343a226fedd` |
| `tx3-lift-cardano` (git `rev`) | `e8c91bf652fe8558eae761c2d9509d518b952b89` | `827b499d6f790b19b235b4ed370d9343a226fedd` |
| `utxorpc-spec` | `"0.19"` | `"0.19.2"` |

`827b499` is the current HEAD of `tx3-lift` `main`; it is a strict superset of
`842df42` with byte-identical library crates. `Cargo.lock` is updated to resolve
`utxorpc-spec 0.19.2`. Both rev commits are already pushed to
`origin/main` of `github.com/tx3-lang/tx3-lift`, so the pinned `rev` is
reachable in CI.

## Coupled change — `src/upstream/predicate.rs`

`utxorpc-spec 0.19.2` makes the pattern byte fields `Option<Bytes>`. The
registry `predicate.rs` is byte-identical to the upstream pre-fix version, so
the `842df42` change applies verbatim: wrap three field assignments in `Some(…)`:

- `AddressPattern.exact_address`: `Bytes::from(bytes)` → `Some(Bytes::from(bytes))`
- `AssetPattern.policy_id` (moves): same
- `AssetPattern.policy_id` (mints): same

Without this the 0.19.2 bump does not compile. This is the only code coupled to
the version bump.

## 1 — Matching port

### `specialization.rs`

- Add `anchors: ProtocolAnchors` to `SpecializedTii`.
- Compute it in `specialize_one` via `ProtocolAnchors::from_profile(profile)?`
  (the `profile` is already in scope from `lookup_profile`).
- In `specialize_all`, **exclude** any source whose `anchors.is_empty()` is true,
  emitting a `warn!` per skipped source (no parties / recognizable environment
  anchors → matching disabled for that source). The registry variant keeps its
  existing `DiscoveredSource` input and `repo_scope` / `repo_name` /
  `repo_version` fields.

### `process.rs` — rewrite `run_specializations`

Behaviour to reproduce from the upstream reference, adapted to the registry's
async Postgres `Store` and its `OwnedMatchRow` shape:

1. `let summary = lifter.matcher.summarize(payload)?;` once per tx.
2. **Gate + collect (defer lifting).** For each source:
   - `let hits = spec.anchors.hits(&summary);` then `if !hits.gates() { continue; }`.
     Gating presence = spend-from-script, mint/burn under an anchor policy,
     script-ref in use, or a datum-bearing output at an anchor address. Soft
     hits (bare payment to a script address, anchor asset merely circulating)
     raise `total` but never gate.
   - For each `(tx_name, (tir, fp))` whose `fp.matches(&summary)` and whose
     `lifter.match_tx(tir, payload)?` yields an assignment: compute
     `score = u32::try_from(hits.total + fp.information_score()).unwrap_or(u32::MAX)`
     and push a candidate carrying the borrow needed to lift later.
3. **Pure selection** — port `select_matches(candidates, mode)` verbatim:
   - within-source dedup: keep the best-scoring `tx_name` per source; tie-break
     ascending `tx_name`;
   - cross-source dense ranking by score descending (equal scores share a rank:
     5,5,3 → 1,1,2);
   - mode filter: `Best` keeps only rank-1 rows (all of them when tied); `All`
     keeps everything.
4. **Lift only survivors**, persisting each as an `OwnedMatchRow` extended with
   `score` and `match_rank`.

`select_matches`, `Candidate`, and `Ranked` are pure and chain-agnostic; they
port unchanged.

### `config.rs`

Add a `[matching]` block:

```toml
[matching]
mode = "all"   # or "best"; default "all"
```

- `MatchingConfig { mode: MatchMode }` with `#[serde(default)]`.
- `enum MatchMode { All, Best }`, `#[serde(rename_all = "lowercase")]`, default
  `All`. Unknown values must fail to parse.

### `store.rs` + migration

- `OwnedMatchRow` gains `score: u32` and `match_rank: u32`.
- The `INSERT INTO matches …` statement adds the two columns; the bound
  parameter list extends to `$12, $13` (bound as `i64`).
- New migration `migrations/20260618HHMMSS_add_score_rank.sql`:

  ```sql
  ALTER TABLE matches ADD COLUMN score      INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE matches ADD COLUMN match_rank INTEGER NOT NULL DEFAULT 1;
  ```

  `sqlx` owns migration bookkeeping, so the SQLite-specific
  unchecked-transaction wrapper from the upstream `002_score_rank` is not
  needed. `#[sqlx::test(migrations = "./migrations")]` picks the new migration
  up automatically.

## 2 — Resilience port

### `upstream/retry.rs` (new, ported verbatim)

- `pub fn is_transient(code: tonic::Code) -> bool` — `Unknown | Unavailable |
  Aborted | Cancelled | DeadlineExceeded | Internal | ResourceExhausted` are
  transient (reconnect); config/auth/bad-request codes stay fatal.
- `pub struct Backoff` — capped exponential delay with `next_delay()` and
  `reset()`.
- Ships its 4 unit tests.

### `upstream/mod.rs` — `connect()`

Add HTTP/2 keepalives to the channel builder so an idle intermediary does not
silently drop the long-lived stream:
`http2_keep_alive_interval(20s)`, `keep_alive_timeout(20s)`,
`keep_alive_while_idle(true)`, `tcp_keepalive(Some(60s))`.

### `lib.rs` — `run()`

Restructure the single streaming loop into a reconnect loop (port of the
upstream `main.rs` change, applied to the registry's `run()` which lives in
`lib.rs`):

- Extract `stream_session(...) -> Result<SessionOutcome>` where
  `enum SessionOutcome { Shutdown, Reconnect }`.
- `Backoff::new(1s, 30s)`; on `Reconnect`, `warn!` and sleep `backoff.next_delay()`
  (interruptible by shutdown), then loop.
- Resume `intersect` from the **persisted cursor** on every (re)connect; fall
  back to the configured intersect only when no cursor is stored.
- `backoff.reset()` on the first healthy message.
- Classification: a `connect()` transport error → `Reconnect`; an
  `Error::Config` from `connect()` → fatal; a `watch_tx` / mid-stream status →
  `Reconnect` iff `is_transient`, else fatal; any processing error → fatal.
- Pass `cfg.matching.mode` into `process::apply_tx(...)`.

The registry-specific startup (load Postgres `Store`, OCI `fetch_catalog`,
`specialize_all`) is unchanged; only the stream loop is restructured.

## 3 — Test plan

All DB-backed tests use the registry's existing `#[sqlx::test(migrations =
"./migrations")]` harness (ephemeral per-test Postgres; needs `DATABASE_URL`).

**Pure / no-DB:**
- `select_matches` — the 8 ported unit tests in `process.rs` (within-source
  higher-score wins, tie-break alphabetical, exactly-one-per-source, dense
  cross-source ranks, single-candidate, `Best` keeps all rank-1, `All` keeps
  all, empty input).
- `config.rs` — `[matching]` parsing: default `All` when block/mode omitted,
  `"best"`/`"all"` parsed, unknown value errors.
- `retry.rs` — the 4 ported tests (transient codes reconnect, fatal codes fatal,
  backoff doubles+caps, reset returns to initial).

**Ported integration tests (adapted to Postgres):**
- `tests/source_anchors.rs` — `ProtocolAnchors::from_profile` extraction over
  real profiles (addresses, UTxO refs, policy ids; empty-anchor exclusion).
- `tests/over_matching_regression.rs` — using real CBOR fixtures
  (`dex_swap_iusd`, `indigo_create_staking`, `sp_deposit`, reusable from
  tx3-lift), assert that a transaction which previously matched multiple
  protocols now gates/ranks to the intended single (or correctly tied) result;
  assert persisted `score` / `match_rank`.
- `tests/gating_real_txs.rs` — anchor-strength gating: a soft-only presence does
  not gate; a script-exec / stateful-output presence does.
- `tests/store_idempotency.rs` — extend to cover `score` / `match_rank`
  round-trip and idempotent re-insert.

Fixtures: copy the `.cbor.hex` fixtures referenced by the upstream tests into
`tracker/tests/fixtures/`.

## Acceptance criteria

1. `cargo build` and `cargo test` (with `DATABASE_URL`) pass in `tracker/`.
2. `cargo tree -p utxorpc-spec` resolves `0.19.2`; the library crates compile
   against it without the predicate fix (the fix is tracker-only).
3. A transaction exercising a known protocol's script produces exactly the
   intended match(es); the prior over-matching fixture no longer yields spurious
   cross-protocol rows under `mode = "best"`.
4. With `mode = "all"`, every gated candidate is persisted with a dense
   `match_rank`; with `mode = "best"`, only rank-1 rows persist.
5. A simulated transient upstream interruption reconnects and resumes from the
   persisted cursor; a fatal (auth/config) error exits non-zero.
6. Sources whose profile yields zero anchors are skipped with a logged warning.

## Notes / risks to verify during implementation

- Confirm the library crates compile against `utxorpc-spec 0.19.2` (expected:
  yes — pattern construction is tracker-only).
- Confirm `tx3_sdk::tii::spec::Profile` is reachable where the registry
  `specialization.rs` builds `SpecializedTii` (it already calls
  `lookup_profile`, so yes).
- The over-matching regression test needs the resolved-input CBOR carried in the
  WatchTx envelope; reuse the upstream fixtures' envelope shape.

## Landing order

1. Dependency + `utxorpc-spec` bump + `predicate.rs` fix (compiles, existing
   tests green).
2. `config.rs` `[matching]` + tests.
3. `specialization.rs` anchors + exclusion.
4. `store.rs` + migration (`score` / `match_rank`).
5. `process.rs` gate + score + `select_matches` + its unit tests.
6. Resilience: `retry.rs`, `connect()` keepalives, `lib.rs` reconnect loop.
7. Ported integration tests + fixtures.
