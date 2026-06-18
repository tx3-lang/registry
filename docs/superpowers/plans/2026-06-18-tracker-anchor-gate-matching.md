# Tracker Anchor-Gate Matching + Resilience Port — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port tx3-lift's anchor-gate matching + scoring/ranking (`7e8bc32`), the bundled upstream resilience, and the `utxorpc-spec 0.19.2` bump into the registry's Postgres tracker fork, fixing transaction over-matching.

**Architecture:** The registry tracker is a Postgres fork of `tx3-lift/bin/tracker`. The matching *library* (`tx3-lift`, `tx3-lift-cardano`) arrives via a git `rev` bump; the tracker-level logic (gating, scoring, selection, config, schema, store, reconnect loop) is ported by hand against the registry's async `sqlx` store and OCI discovery startup.

**Tech Stack:** Rust, `sqlx` (Postgres), `tonic`/`prost` (gRPC utxorpc), `tokio`. Tests via `#[sqlx::test]` (ephemeral Postgres) + Cargo unit tests.

## Reference

The canonical source for every port is the `tx3-lift` repository
(`https://github.com/tx3-lang/tx3-lift`) at commit
`7e8bc320a7b9680eb4e1cfbdf8efd5b8ec152938` (`7e8bc32`), with the
`utxorpc-spec 0.19.2` predicate fix at `842df42`. Read the referenced upstream
file for each task (from a local `tx3-lift` checkout) and adapt it to the
registry types noted in the task.

## Global Constraints

- Pin `tx3-lift` and `tx3-lift-cardano` to `rev = "827b499d6f790b19b235b4ed370d9343a226fedd"` (HEAD of tx3-lift `main`; library bytes identical to `7e8bc32`/`842df42`).
- `utxorpc-spec = "0.19.2"` exactly; `Cargo.lock` must resolve `0.19.2`.
- All work happens in the `tracker/` crate. Do not touch `backend/`, `frontend/`, or the registry's `discovery.rs`.
- Library symbols available after Task 1: `tx3_lift::ProtocolAnchors`, `tx3_lift::AnchorHits`, `tx3_lift::fingerprint::Fingerprint::information_score(&self) -> usize`.
- `MatchMode` default is `All` (preserves current persistence behavior; over-matching is suppressed by opting into `"best"`).
- DB-backed tests require `DATABASE_URL` pointing at a reachable Postgres; `#[sqlx::test(migrations = "./migrations")]` provisions an ephemeral DB per test.
- Branch: `feat/tracker-anchor-gate-matching` (already created; the design spec is committed there).
- Per project preference, do **not** run `lint`/`lint:fix`; use `cargo build` / `cargo test` / `cargo clippy` as gates. Use the existing toolchain; this is a Cargo crate (no pnpm here).

## File map

| File | Action | Responsibility |
|---|---|---|
| `tracker/Cargo.toml` | modify | bump revs + `utxorpc-spec` |
| `tracker/Cargo.lock` | modify | resolve `0.19.2` |
| `tracker/src/upstream/predicate.rs` | modify | `Option<Bytes>` pattern fields |
| `tracker/src/config.rs` | modify | `[matching]` block, `MatchMode` |
| `tracker/src/specialization.rs` | modify | `anchors` field + empty-anchor exclusion |
| `tracker/migrations/20260618000001_add_score_rank.sql` | create | `score` / `match_rank` columns |
| `tracker/src/store.rs` | modify | persist `score` / `match_rank` |
| `tracker/src/process.rs` | modify | gate + score + `select_matches` |
| `tracker/src/upstream/retry.rs` | create | `is_transient`, `Backoff` |
| `tracker/src/upstream/mod.rs` | modify | `pub mod retry` + keepalives |
| `tracker/src/lib.rs` | modify | reconnect loop, `SessionOutcome`, pass `mode` |
| `tracker/tests/source_anchors.rs` | create | anchor extraction + exclusion |
| `tracker/tests/over_matching_regression.rs` | create | regression on real CBOR |
| `tracker/tests/gating_real_txs.rs` | create | anchor-strength gating |
| `tracker/tests/store_idempotency.rs` | modify | cover `score` / `match_rank` |
| `tracker/tests/fixtures/*.cbor.hex` | create | copied from tx3-lift |

---

### Task 1: Dependency + utxorpc 0.19.2 bump + predicate fix

**Files:**
- Modify: `tracker/Cargo.toml` (lines 18–19 revs; line 24 `utxorpc-spec`)
- Modify: `tracker/Cargo.lock`
- Modify: `tracker/src/upstream/predicate.rs:24,35,45`

**Interfaces:**
- Produces: library symbols `tx3_lift::{ProtocolAnchors, AnchorHits}` and `Fingerprint::information_score(&self) -> usize` become available to later tasks; build resolves `utxorpc-spec 0.19.2`.

- [ ] **Step 1: Bump dependencies.** In `tracker/Cargo.toml`, set both `tx3-lift` and `tx3-lift-cardano` `rev` to `827b499d6f790b19b235b4ed370d9343a226fedd`, and `utxorpc-spec` from `"0.19"` to `"0.19.2"`.

- [ ] **Step 2: Verify the bump breaks the build (the failing state).**
  Run: `cd tracker && cargo update -p utxorpc-spec --precise 0.19.2 && cargo build`
  Expected: FAIL — `predicate.rs` errors because `exact_address` / `policy_id` are now `Option<Bytes>` (mismatched types: expected `Option<_>`, found `Bytes`).

- [ ] **Step 3: Apply the predicate fix.** In `tracker/src/upstream/predicate.rs`, wrap the three pattern byte fields in `Some(...)`: `exact_address: Some(Bytes::from(bytes))` (line ~24), and both `policy_id: Some(Bytes::from(bytes))` (lines ~35 and ~45). This mirrors `842df42` exactly.

- [ ] **Step 4: Verify build + existing tests pass.**
  Run: `cd tracker && cargo build && cargo test`
  Expected: PASS — build clean; all pre-existing tests green (no behavior change yet). Confirm `cargo tree -p utxorpc-spec` shows `0.19.2`.

- [ ] **Step 5: Commit.**
  `git add tracker/Cargo.toml tracker/Cargo.lock tracker/src/upstream/predicate.rs`
  `git commit -m "chore(tracker): bump tx3-lift rev + utxorpc-spec 0.19.2"`

---

### Task 2: `[matching]` config + `MatchMode`

**Files:**
- Modify: `tracker/src/config.rs` (add `MatchingConfig`, `MatchMode`, `Config.matching` field; add `#[cfg(test)] mod tests`)

**Interfaces:**
- Produces:
  - `pub enum MatchMode { All, Best }` — `#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Deserialize, Serialize)]`, `#[serde(rename_all = "lowercase")]`, `#[default] All`.
  - `pub struct MatchingConfig { pub mode: MatchMode }` — `#[derive(Default, ...)]`, `mode` is `#[serde(default)]`.
  - `Config` gains `#[serde(default)] pub matching: MatchingConfig`.
- Consumed by: Task 5 (`process::apply_tx` takes `MatchMode`) and Task 6 (`lib.rs` reads `cfg.matching.mode`).

- [ ] **Step 1: Write the failing tests.** In `tracker/src/config.rs` add a `#[cfg(test)] mod tests` with four cases (adapt the upstream `config.rs` tests at `7e8bc32` to the registry's minimal config shape — use the registry's required keys, e.g. `[storage] database_url`, `[upstream] endpoint`, and the registry's `[oci]`/profile keys as needed):
  - `matching_defaults_to_all_when_block_omitted` — config without `[matching]` → `cfg.matching.mode == MatchMode::All`.
  - `matching_mode_best_is_parsed` — `[matching]\nmode = "best"` → `MatchMode::Best`.
  - `matching_mode_all_is_parsed` — `mode = "all"` → `MatchMode::All`.
  - `matching_mode_unknown_value_fails` — `mode = "bogus"` → parse `Result` is `Err`.

- [ ] **Step 2: Run tests to verify they fail.**
  Run: `cd tracker && cargo test --lib config::tests`
  Expected: FAIL to compile — `MatchMode` / `matching` not defined.

- [ ] **Step 3: Implement `MatchMode`, `MatchingConfig`, and the `Config.matching` field** as specified in the Interfaces block. Reference: `git show 7e8bc32 -- bin/tracker/src/config.rs`.

- [ ] **Step 4: Run tests to verify they pass.**
  Run: `cd tracker && cargo test --lib config::tests`
  Expected: PASS — all four cases.

- [ ] **Step 5: Commit.**
  `git add tracker/src/config.rs`
  `git commit -m "feat(tracker): add [matching] config with MatchMode"`

---

### Task 3: Specialization anchors + empty-anchor exclusion

**Files:**
- Modify: `tracker/src/specialization.rs`
- Test: `tracker/tests/source_anchors.rs` (create)

**Interfaces:**
- Consumes: `tx3_lift::ProtocolAnchors` (Task 1).
- Produces: `SpecializedTii` gains `pub anchors: ProtocolAnchors`. `specialize_all` returns only sources with non-empty anchors.

- [ ] **Step 1: Write the failing integration test.** In `tracker/tests/source_anchors.rs`, build `DiscoveredSource`s from TII fixtures (reuse the registry's existing discovery test helpers / a TII the registry already tests against) and assert:
  - a source whose profile has party addresses / policy ids / utxo refs yields `specialized.anchors.is_empty() == false` and is **present** in `specialize_all`'s output;
  - a source whose profile yields zero anchors is **absent** from the output (excluded).
  Reference for the anchor extraction expectations: `git show 7e8bc32 -- bin/tracker/tests/source_anchors.rs` and `crates/tx3-lift/src/anchors.rs`.

- [ ] **Step 2: Run test to verify it fails.**
  Run: `cd tracker && cargo test --test source_anchors`
  Expected: FAIL to compile — `SpecializedTii` has no `anchors` field.

- [ ] **Step 3: Implement.** In `specialize_one`, after `lookup_profile`, compute `let anchors = ProtocolAnchors::from_profile(profile)?;` and set it on the returned `SpecializedTii`. In `specialize_all`, skip any source where `specialized.anchors.is_empty()` with a `warn!(source=…, profile=…, "profile has no parties or recognizable environment anchors; matching disabled for this source")` and `continue`. Keep the registry's `DiscoveredSource` input and `repo_scope`/`repo_name`/`repo_version` fields. Reference: `bin/tracker/src/specialization.rs` at `7e8bc32`.

- [ ] **Step 4: Run test to verify it passes.**
  Run: `cd tracker && cargo test --test source_anchors`
  Expected: PASS.

- [ ] **Step 5: Commit.**
  `git add tracker/src/specialization.rs tracker/tests/source_anchors.rs`
  `git commit -m "feat(tracker): derive protocol anchors per source, exclude anchorless sources"`

---

### Task 4: Store `score` / `match_rank` + migration

**Files:**
- Create: `tracker/migrations/20260618000001_add_score_rank.sql`
- Modify: `tracker/src/store.rs` (`OwnedMatchRow` struct + the `INSERT INTO matches` statement and its binds)
- Test: `tracker/tests/store_idempotency.rs` (modify)

**Interfaces:**
- Produces: `OwnedMatchRow` gains `pub score: u32` and `pub match_rank: u32`. `apply_block` persists both (bound as `i64`).
- Consumed by: Task 5 (constructs `OwnedMatchRow` with `score` / `match_rank`).

- [ ] **Step 1: Create the migration.** `tracker/migrations/20260618000001_add_score_rank.sql`:
  ```sql
  ALTER TABLE matches ADD COLUMN score      INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE matches ADD COLUMN match_rank INTEGER NOT NULL DEFAULT 1;
  ```

- [ ] **Step 2: Write/extend the failing test.** In `tracker/tests/store_idempotency.rs`, extend `sample_match_row()` to set `score` and `match_rank`, and add a `#[sqlx::test(migrations = "./migrations")]` test `apply_block_persists_score_and_rank` that inserts a row then `SELECT score, match_rank FROM matches WHERE tx_hash = $1` and asserts the persisted values match. Keep the existing idempotency assertions.

- [ ] **Step 3: Run test to verify it fails.**
  Run: `cd tracker && cargo test --test store_idempotency`
  Expected: FAIL to compile — `OwnedMatchRow` has no `score` / `match_rank` fields.

- [ ] **Step 4: Implement.** Add `score: u32` and `match_rank: u32` to `OwnedMatchRow`; extend the `INSERT INTO matches (… , score, match_rank)` column list and `VALUES (… , $12, $13)`; add `.bind(row.score as i64).bind(row.match_rank as i64)`. Reference: `git show 7e8bc32 -- bin/tracker/src/store.rs` (adapt SQLite→sqlx; the sqlx migration runner needs no transaction wrapper).

- [ ] **Step 5: Run test to verify it passes.**
  Run: `cd tracker && cargo test --test store_idempotency`
  Expected: PASS (requires `DATABASE_URL`).

- [ ] **Step 6: Commit.**
  `git add tracker/migrations/20260618000001_add_score_rank.sql tracker/src/store.rs tracker/tests/store_idempotency.rs`
  `git commit -m "feat(tracker): persist match score and rank"`

---

### Task 5: Gate + score + `select_matches` in `process.rs`

**Files:**
- Modify: `tracker/src/process.rs` (rewrite `run_specializations`; thread `mode` through `apply_tx`; add `#[cfg(test)] mod tests`)

**Interfaces:**
- Consumes: `config::MatchMode` (Task 2), `SpecializedTii.anchors` (Task 3), `OwnedMatchRow { score, match_rank }` (Task 4), `AnchorHits::{gating, total, gates}` + `Fingerprint::information_score` (Task 1).
- Produces:
  - `pub async fn apply_tx(any_tx, specialized, lifter, store, mode: MatchMode) -> Result<()>` (new trailing `mode` param).
  - private `fn select_matches<T>(candidates: Vec<Candidate<'_, T>>, mode: MatchMode) -> Vec<Ranked<'_, T>>` (pure).
  - Persisted `OwnedMatchRow.score = hits.total + fp.information_score()`, `match_rank` = dense 1-based rank.

- [ ] **Step 1: Write the failing pure-selection tests.** Port the 8 `select_matches` unit tests verbatim from `bin/tracker/src/process.rs` at `7e8bc32` into a `#[cfg(test)] mod tests` in `tracker/src/process.rs` (they are chain-agnostic and depend only on `Candidate`/`Ranked`/`MatchMode`): `within_source_keeps_higher_score`, `within_source_tie_breaks_alphabetically`, `within_source_keeps_exactly_one_per_source`, `cross_source_assigns_dense_ranks`, `single_candidate_ranks_one`, `mode_best_keeps_all_rank_one_rows`, `mode_all_keeps_every_row`, `empty_candidates_yield_empty_result`.

- [ ] **Step 2: Run tests to verify they fail.**
  Run: `cd tracker && cargo test --lib process::tests`
  Expected: FAIL to compile — `select_matches`, `Candidate`, `Ranked` not defined.

- [ ] **Step 3: Implement the gate + score + selection.** Rewrite `run_specializations` per the spec §"Matching port": summarize once; per source apply the anchor gate `if !spec.anchors.hits(&summary).gates() { continue; }`; per matching `tx_name` compute `score = u32::try_from(hits.total + fp.information_score()).unwrap_or(u32::MAX)` and collect a `Candidate` (defer lifting); run `select_matches(candidates, mode)`; lift only survivors; build `OwnedMatchRow` with `score` + `match_rank`. Add the `Candidate`/`Ranked`/`LiftInputs` structs and the pure `select_matches`. Thread `mode: MatchMode` through `run_specializations` and `apply_tx`. Reference: `bin/tracker/src/process.rs` at `7e8bc32` (adapt to the registry's async `Store`, `OwnedMatchRow` repo fields, and registry imports).

- [ ] **Step 4: Run tests + full build.**
  Run: `cd tracker && cargo test --lib process::tests && cargo build`
  Expected: PASS — 8 selection tests green; crate builds (note `apply_tx`'s new `mode` arg will make `lib.rs` fail to build until Task 6 — acceptable here only if `lib.rs` is updated in the same step; otherwise build `--lib` excludes the bin... see Step 5).

- [ ] **Step 5: Keep the crate compiling.** Update the single `process::apply_tx(...)` call site in `tracker/src/lib.rs` to pass `cfg.matching.mode` (minimal change; the full reconnect restructure is Task 6).
  Run: `cd tracker && cargo build && cargo test`
  Expected: PASS.

- [ ] **Step 6: Commit.**
  `git add tracker/src/process.rs tracker/src/lib.rs`
  `git commit -m "feat(tracker): anchor-gate matches, score and rank candidates"`

---

### Task 6: Upstream resilience — retry module, keepalives, reconnect loop

**Files:**
- Create: `tracker/src/upstream/retry.rs`
- Modify: `tracker/src/upstream/mod.rs` (`pub mod retry;` + `connect()` keepalives)
- Modify: `tracker/src/lib.rs` (`run()` reconnect loop, `SessionOutcome`, `Backoff`)

**Interfaces:**
- Consumes: `process::apply_tx(..., mode)` (Task 5), `cfg.matching.mode` (Task 2).
- Produces:
  - `pub fn upstream::retry::is_transient(code: tonic::Code) -> bool`.
  - `pub struct upstream::retry::Backoff` with `new(initial: Duration, max: Duration)`, `next_delay(&mut self) -> Duration`, `reset(&mut self)`.
  - private `enum SessionOutcome { Shutdown, Reconnect }` + `async fn stream_session(...) -> Result<SessionOutcome>` in `lib.rs`.

- [ ] **Step 1: Write the failing retry tests.** Create `tracker/src/upstream/retry.rs` test module by porting the 4 tests verbatim from `bin/tracker/src/upstream/retry.rs` at `7e8bc32`: `transport_codes_reconnect`, `config_and_auth_codes_are_fatal`, `backoff_doubles_and_caps`, `backoff_reset_returns_to_initial`.

- [ ] **Step 2: Run tests to verify they fail.**
  Run: `cd tracker && cargo test --lib upstream::retry`
  Expected: FAIL to compile — `is_transient` / `Backoff` not defined.

- [ ] **Step 3: Implement `retry.rs`** (`is_transient` + `Backoff`) verbatim from the reference, and add `pub mod retry;` to `tracker/src/upstream/mod.rs`.
  Run: `cd tracker && cargo test --lib upstream::retry`
  Expected: PASS.

- [ ] **Step 4: Add channel keepalives.** In `tracker/src/upstream/mod.rs` `connect()`, chain `.http2_keep_alive_interval(Duration::from_secs(20)).keep_alive_timeout(Duration::from_secs(20)).keep_alive_while_idle(true).tcp_keepalive(Some(Duration::from_secs(60)))` onto the `Channel::from_shared(...)` builder (before the TLS branch). Reference: `git show 7e8bc32 -- bin/tracker/src/upstream/mod.rs`.

- [ ] **Step 5: Restructure `run()` into a reconnect loop.** In `tracker/src/lib.rs`: extract `stream_session(...) -> Result<SessionOutcome>`; add `enum SessionOutcome { Shutdown, Reconnect }`; in `run()` create `Backoff::new(Duration::from_secs(1), Duration::from_secs(30))`, loop: recompute `intersect` from the persisted cursor each iteration (fallback to configured intersect), call `stream_session`, on `Reconnect` `warn!` + interruptible `sleep(backoff.next_delay())`, on `Shutdown` break. In `stream_session`: a `connect()` `Error::TonicTransport` → `Reconnect`, other `connect()` errors fatal; `watch_tx`/stream status → `Reconnect` iff `is_transient`, else fatal; `backoff.reset()` on first healthy message; pass `cfg.matching.mode` to `apply_tx`. Reference: `git show 7e8bc32 -- bin/tracker/src/main.rs` (the registry's loop lives in `lib.rs::run`; keep the registry startup — Postgres `Store`, `fetch_catalog`, `specialize_all` — intact).
  Note: confirm the registry `Error` enum has a transport variant matching tonic transport errors (the upstream uses `Error::TonicTransport`); if the registry names it differently, match `connect()`'s actual error type. Adjust the variant name to whatever `connect()` already returns.

- [ ] **Step 6: Build + full test.**
  Run: `cd tracker && cargo build && cargo test`
  Expected: PASS — crate builds; retry unit tests + all prior tests green.

- [ ] **Step 7: Commit.**
  `git add tracker/src/upstream/retry.rs tracker/src/upstream/mod.rs tracker/src/lib.rs`
  `git commit -m "feat(tracker): reconnect with backoff and http2 keepalives"`

---

### Task 7: Ported regression tests + fixtures

**Files:**
- Create: `tracker/tests/over_matching_regression.rs`
- Create: `tracker/tests/gating_real_txs.rs`
- Create: `tracker/tests/fixtures/*.cbor.hex` (copy from tx3-lift)

**Interfaces:**
- Consumes: the full matching pipeline (`apply_tx`, `run_specializations`, store) from Tasks 3–6.

- [ ] **Step 1: Copy fixtures.** Copy the `.cbor.hex` fixtures used by the upstream tests into `tracker/tests/fixtures/` (`dex_swap_iusd_06a73a03.cbor.hex`, `indigo_create_staking_c54778b4.cbor.hex`, `sp_deposit_71e89010.cbor.hex`, and any others referenced by `bin/tracker/tests/over_matching_regression.rs` / `gating_real_txs.rs` / `source_anchors.rs` at `7e8bc32`).

- [ ] **Step 2: Write `gating_real_txs.rs`.** `#[sqlx::test]` tests asserting anchor-strength gating on real txs: a tx with only a *soft* presence for a source does not gate (no row); a tx that forces a source's script (spend-from-script / mint / script-ref / datum output) gates and produces a row. Port the assertions from `bin/tracker/tests/gating_real_txs.rs` at `7e8bc32`, adapting the store/lookup to the registry's Postgres `Store`.

- [ ] **Step 3: Write `over_matching_regression.rs`.** `#[sqlx::test]` test(s) that drive a known-ambiguous transaction through the pipeline against multiple specialized sources and assert:
  - under `MatchMode::Best`, exactly the intended source(s) survive (rank-1), and the previously-spurious cross-protocol matches are absent;
  - under `MatchMode::All`, every gated candidate persists with a dense `match_rank`;
  - persisted `score` ordering matches expectation.
  Port the scenario + fixtures from `bin/tracker/tests/over_matching_regression.rs` at `7e8bc32`, adapting persistence assertions to `SELECT … FROM matches`.

- [ ] **Step 4: Run the full integration suite.**
  Run: `cd tracker && cargo test`
  Expected: PASS — all unit + integration tests green (requires `DATABASE_URL`).

- [ ] **Step 5: Commit.**
  `git add tracker/tests/over_matching_regression.rs tracker/tests/gating_real_txs.rs tracker/tests/fixtures`
  `git commit -m "test(tracker): regression for anchor-gate over-matching"`

---

## Final verification (after Task 7)

- [ ] `cd tracker && cargo build && cargo clippy && cargo test` all green with `DATABASE_URL` set.
- [ ] `cargo tree -p utxorpc-spec` resolves `0.19.2`.
- [ ] Acceptance criteria 1–6 from the spec hold (see `docs/superpowers/specs/2026-06-18-tracker-anchor-gate-matching-design.md`).
- [ ] Open the PR from `feat/tracker-anchor-gate-matching` referencing the spec.

## Notes / risks (verify during implementation)

- Library crates are expected to compile against `utxorpc-spec 0.19.2` unchanged (pattern construction is tracker-only). If not, the predicate fix scope widens — surface it.
- The exact transport-error variant returned by the registry's `connect()` may differ from upstream's `Error::TonicTransport`; match the registry's actual `Error` enum (Task 6, Step 5).
- The reconnect loop itself has no unit test (it needs a mock gRPC server); it is covered by the `retry.rs` unit tests plus the spec's manual acceptance criterion (simulated transient interruption resumes from cursor). Note this gap honestly in the PR.
- Confirm the registry's minimal valid config shape when writing the `config.rs` parsing tests (Task 2) — use the registry's actual required keys, not the upstream SQLite `database_path` shape.
