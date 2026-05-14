# Tracker Daemon Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the `tx3-lift` tracker into the registry as a new `tracker/` crate, migrating persistence from SQLite to Postgres via sqlx, depending on `tx3-lift` and `tx3-lift-cardano` by git rev.

**Architecture:** A standalone Rust binary crate at `registry/tracker/` (sibling of `backend/` and `frontend/`, no root Cargo workspace). The daemon subscribes to a utxorpc `WatchTx` stream, specializes configured TIIs per profile at startup, matches and lifts each streamed tx, and persists results into Postgres atomically. `tx3-lift` and `tx3-lift-cardano` are pulled by git rev (pinned to `04d0b90a34b2461dd497f9941b491aed5d925bfd`), not vendored.

**Tech Stack:** Rust (edition 2021), tokio, tonic + utxorpc-spec for gRPC streaming, sqlx (Postgres + macros + migrate), pallas for Cardano CBOR, tracing for logs.

**Authoritative reference for all concrete code, schemas, configs, and design choices:** `docs/superpowers/specs/2026-05-11-tracker-daemon-design.md`. Read it once before starting; every task below cites the section to consult for the actual artifact to produce.

**Upstream source files (read-only reference for verbatim-copy tasks):**
- Local mirror if available: `/Users/mduthey/Documents/Work/tx3-lang/tx3-lift/bin/tracker/`
- GitHub at the pinned sha: `https://github.com/tx3-lang/tx3-lift/tree/04d0b90a34b2461dd497f9941b491aed5d925bfd/bin/tracker`

---

## File Structure

What gets created under `registry/tracker/`:

| Path | Responsibility |
|---|---|
| `Cargo.toml` | Crate manifest, deps pinned (incl. git deps for tx3-lift). Declares both `[lib]` and `[[bin]]`. |
| `.gitignore` | Ignore build artifacts, local DB files, dotenvs. `Cargo.lock` is NOT ignored (binaries commit their lockfile). |
| `src/lib.rs` | Library entry: `pub mod` declarations + optional shared daemon entry function. Lets integration tests reach internal modules via `tx3_registry_tracker::*`. |
| `src/main.rs` | Bin entry: tracing init, arg parsing, dispatch into the lib. Thin wrapper. |
| `src/config.rs` | TOML schema + `load()` with `DATABASE_URL` env override. |
| `src/error.rs` | `Error` enum + `Result` alias. |
| `src/store.rs` | Postgres `Store` over `PgPool`: `open`, `cursor`, `apply_block`, `undo_tx`, `from_pool` (test-only). |
| `src/specialization.rs` | Per-source TII specialization, cached fingerprints. |
| `src/process.rs` | `apply_tx` / `undo_tx` handlers invoked from the Watch loop. |
| `src/upstream/mod.rs` | gRPC channel setup, API-key interceptor, intersect helpers. |
| `src/upstream/predicate.rs` | Compile `[upstream.filter]` to a server-side `TxPredicate`. |
| `migrations/20260511000001_initial.sql` | Postgres schema: `matches` (JSONB `lifted`, TIMESTAMPTZ `matched_at`), `cursor`, indexes. |
| `tests/store_idempotency.rs` | `#[sqlx::test]` integration test for `UNIQUE(tx_hash, source_name)`. |
| `tests/cursor_persistence.rs` | `#[sqlx::test]` integration test for cursor round-trip. |
| `tracker.toml.example` | Example config showing the Postgres URL format. |
| `examples/orcfax-burn/` | Copied verbatim from upstream, with `tracker.toml`'s `[storage]` block rewritten for Postgres. |
| `../.github/workflows/tracker.yml` | CI: Postgres sidecar + `cargo test`. |

---

## Task 1: Scaffold the crate

**Goal:** Land a buildable empty crate with all dependencies wired and the lib/bin split in place. No daemon logic yet.

**Files:**
- Create: `tracker/Cargo.toml`
- Create: `tracker/src/lib.rs`
- Create: `tracker/src/main.rs`
- Create: `tracker/.gitignore`
- Create: `tracker/migrations/20260511000001_initial.sql`

**Reference:** Spec section "Dependencies" for the full `Cargo.toml` contents. Spec section "Schema" for the migration SQL.

- [ ] **Step 1: Write `tracker/Cargo.toml`**

Follow the spec's "Dependencies" section verbatim for the `[package]` and `[dependencies]` blocks. Add a `[lib]` section (`name = "tx3_registry_tracker"`, `path = "src/lib.rs"`) above the `[[bin]]` block so integration tests can reach internal modules.

- [ ] **Step 2: Create `tracker/src/lib.rs` empty**

Just a header comment that says module declarations will be added by subsequent tasks. The lib must compile as an empty crate.

- [ ] **Step 3: Create `tracker/src/main.rs` as a stub**

A minimal `fn main()` that prints a marker line. The bin must build.

- [ ] **Step 4: Create `tracker/.gitignore`**

Ignore `target/`, `*.db`, `*.db-wal`, `*.db-shm`, `.env`, `.env.*` (whitelist `.env.example`). Do NOT ignore `Cargo.lock` — binary crates commit their lockfile.

- [ ] **Step 5: Create the initial migration**

Write `tracker/migrations/20260511000001_initial.sql` exactly as in the spec's "Schema" section. The filename's timestamp prefix matters — sqlx-migrate sorts by it.

- [ ] **Step 6: Verify the scaffold builds**

Run `cargo build` from `tracker/`. First build pulls git deps; can take 2–4 minutes. Expected outcome: both the library and the binary compile clean.

- [ ] **Step 7: Commit**

Single commit. Message: `tracker: scaffold crate with git deps to tx3-lift`. Include `Cargo.toml`, `Cargo.lock`, `src/`, `.gitignore`, `migrations/`.

---

## Task 2: Implement `error.rs`

**Goal:** Define the crate's `Error` enum and `Result` alias so subsequent modules can use them.

**Files:**
- Create: `tracker/src/error.rs`
- Modify: `tracker/src/lib.rs` (add `pub mod error;`)

**Reference:** Spec section "`store.rs` rewrite → Collateral edits → `error.rs`" for which variants change vs. upstream. Upstream `error.rs` is at `bin/tracker/src/error.rs` in the source mirror.

- [ ] **Step 1: Write `tracker/src/error.rs`**

Start from the upstream module. Drop the `Sqlite(rusqlite::Error)` variant. Add `Sqlx(sqlx::Error)` and `SqlxMigrate(sqlx::migrate::MigrateError)`. Keep all other variants (`Config`, `Io`, `TomlDe`, `Json`, `Hex`, `Lift`, `LiftCardano`, `TonicTransport`, `Rpc`, `PallasDecode`, `TxNotInBlock`, `Internal`) — `process.rs` and `specialization.rs` reference them in later tasks.

- [ ] **Step 2: Declare `pub mod error;` in `tracker/src/lib.rs`**

- [ ] **Step 3: Verify build**

`cargo build` from `tracker/`. Expect clean build with `unused` warnings on variants (they get used in later tasks).

- [ ] **Step 4: Commit**

Message: `tracker: add error type with sqlx variants`.

---

## Task 3: Implement `config.rs`

**Goal:** Land the TOML config schema with the `database_url` field and `DATABASE_URL` env override.

**Files:**
- Create: `tracker/src/config.rs`
- Modify: `tracker/src/lib.rs` (add `pub mod config;`)

**Reference:** Spec section "`store.rs` rewrite → Collateral edits → `config.rs`" for the two diffs vs. upstream. Upstream `config.rs` is at `bin/tracker/src/config.rs` in the source mirror.

- [ ] **Step 1: Write `tracker/src/config.rs`**

Start from upstream verbatim. Apply two edits per spec:
1. `StorageConfig.database_path: PathBuf` → `StorageConfig.database_url: String`.
2. In `load()`, after parsing the TOML, override `cfg.storage.database_url` if the `DATABASE_URL` env var is set. Keep the "at least one [[sources]] entry" validation.

- [ ] **Step 2: Declare `pub mod config;` in `tracker/src/lib.rs`**

- [ ] **Step 3: Verify build**

`cargo build`. Expect clean build, `unused` warnings on most config items.

- [ ] **Step 4: Commit**

Message: `tracker: add config with database_url + DATABASE_URL override`.

---

## Task 4: Implement `store.rs`

**Goal:** Land the Postgres store with the same public API as the upstream SQLite store. This is the largest single change of the project.

**Files:**
- Create: `tracker/src/store.rs`
- Modify: `tracker/src/lib.rs` (add `pub mod store;`)

**Reference:** Spec section "`store.rs` rewrite" — read it fully before starting. Key constraints:

- Public surface must match the spec's listed signatures exactly (`Store::open`, `cursor`, `apply_block`, `undo_tx`, `from_pool`). `OwnedMatchRow` and `ChainPoint` field shapes match upstream so `process.rs` can be copied verbatim later.
- `Store::from_pool(pool)` is `pub` (not `#[cfg(test)]`) with a doc comment marking it test-only.
- `apply_block` and `undo_tx` are each a single SQL transaction (`pool.begin()` → `commit()`).
- Use `sqlx::query` / `sqlx::query_as` (runtime-checked) — NOT `query!`/`query_as!`. Add a comment near a query noting this is intentional so future contributors don't introduce compile-time queries by accident.
- Migration runner is `sqlx::migrate!("./migrations").run(&pool)` called from `Store::open`. No manual `_schema_versions` bookkeeping.
- `matched_at` is set by Postgres (`DEFAULT now()`), not bound from Rust.
- `lifted` parameter is bound as `String` and cast with `::jsonb` in the SQL.

The pool size is 8 (`PgPoolOptions::new().max_connections(8)`).

- [ ] **Step 1: Write `tracker/src/store.rs`**

Follow the spec's "`store.rs` rewrite" section. Implement the four async methods and the test-only `from_pool` constructor.

- [ ] **Step 2: Declare `pub mod store;` in `tracker/src/lib.rs`**

- [ ] **Step 3: Verify build**

`cargo build`. The `sqlx::migrate!("./migrations")` macro reads `tracker/migrations/` at compile time — if the migration file is missing or unreadable, the build fails with a clear macro error.

- [ ] **Step 4: Commit**

Message: `tracker: add postgres store with sqlx + migrate!`.

---

## Task 5: Copy verbatim `specialization.rs`, `process.rs`, `upstream/`

**Goal:** Bring the unchanged business logic from upstream. These four files reference `crate::config`, `crate::error`, `crate::store`, `crate::specialization` — the names already match what tasks 2–4 created, and because the modules now live under `lib.rs`, `crate::*` inside them resolves to `tx3_registry_tracker::*`.

**Files:**
- Create: `tracker/src/specialization.rs`
- Create: `tracker/src/process.rs`
- Create: `tracker/src/upstream/mod.rs`
- Create: `tracker/src/upstream/predicate.rs`
- Modify: `tracker/src/lib.rs` (add `pub mod` for each)

**Reference:** Upstream files at the pinned sha:
- `bin/tracker/src/specialization.rs`
- `bin/tracker/src/process.rs`
- `bin/tracker/src/upstream/mod.rs`
- `bin/tracker/src/upstream/predicate.rs`

Copy each one **byte-for-byte**. No edits, including no rewording of doc comments.

- [ ] **Step 1: Copy `specialization.rs`**

- [ ] **Step 2: Copy `process.rs`**

- [ ] **Step 3: Copy `upstream/mod.rs` and `upstream/predicate.rs`**

Create the `upstream/` subdirectory under `src/`.

- [ ] **Step 4: Declare `pub mod` lines in `tracker/src/lib.rs`**

Add `pub mod process;`, `pub mod specialization;`, `pub mod upstream;` (order alphabetical is fine).

- [ ] **Step 5: Verify build**

`cargo build`. Lots of `unused` warnings (none of these modules are called from `main` yet) — expected. If the build fails with "cannot find type X" or "no field Y", check that the upstream file was copied without modification at the pinned sha.

- [ ] **Step 6: Commit**

Message: `tracker: import specialization/process/upstream from tx3-lift`.

---

## Task 6: Wire the daemon entry point

**Goal:** Connect everything: write the daemon body (config load → store open → specialize → connect upstream → Watch loop → signal handling) and have `main.rs` invoke it. The behavior must match upstream `main.rs` exactly except for the one line where `database_path` becomes `database_url`.

**Files:**
- Modify: `tracker/src/lib.rs` (add daemon entry function + supporting helpers)
- Modify: `tracker/src/main.rs` (full thin wrapper)

**Reference:** Upstream `bin/tracker/src/main.rs` is the model for the daemon body. Spec section "`store.rs` rewrite → Collateral edits → `main.rs`" notes the single substantive change.

Design choice for the lib/bin split:
- The async daemon entrypoint (config load + store open + watch loop) lives in `lib.rs` as a `pub async fn run(config_path: PathBuf) -> Result<()>`. The `signal_listener` helper lives next to it.
- `main.rs` does only: tracing init, arg parsing for the config path, and `tx3_registry_tracker::run(path).await`. On error: log + `std::process::exit(1)`.

This keeps the bin small enough to be obviously correct and makes the daemon body reachable from a future end-to-end test if we ever add one.

- [ ] **Step 1: Add the daemon body to `tracker/src/lib.rs`**

Port the upstream `run()` function into `lib.rs` as `pub async fn run(config_path: PathBuf) -> Result<()>`. Replace `cfg.storage.database_path` with `cfg.storage.database_url`. Port `signal_listener` as a private helper in the same file.

Imports inside `lib.rs` reference its own modules (`config`, `store`, etc.) by `crate::` — that resolves to `tx3_registry_tracker::*` correctly.

- [ ] **Step 2: Rewrite `tracker/src/main.rs` as a thin wrapper**

Tracing init (using the same env filter default as upstream: `tracker=info`), parse the first CLI arg as the config path (defaulting to `tracker.toml`), call `tx3_registry_tracker::run(path).await`, log + `exit(1)` on error.

- [ ] **Step 3: Verify build**

`cargo build`. Expect a fully clean build, both lib and bin. Warnings should be gone or limited to deprecation notices from transitive deps.

- [ ] **Step 4: Smoke-check the binary**

Run the binary with a nonexistent config path. Expected behavior: it logs `starting tracker config=...` (from `run`), then the config load returns an `Io` error, the top-level catches it, logs `tracker exited with error`, and exits 1. This proves tracing init, arg parsing, lib dispatch, and the error path are all wired.

- [ ] **Step 5: Commit**

Message: `tracker: wire daemon body with postgres store`.

---

## Task 7: Add `store_idempotency` integration test

**Goal:** Verify the `UNIQUE(tx_hash, source_name)` constraint + `ON CONFLICT DO NOTHING` makes re-applying the same match a no-op.

**Files:**
- Create: `tracker/tests/store_idempotency.rs`

**Reference:** Spec section "Tests" for the shape of the test. The test reaches into the crate via `tx3_registry_tracker::store::*` — the lib/bin split from Task 1 already exposes this.

**Prerequisite for running the test locally:** a Postgres reachable at `DATABASE_URL`. Quick local setup:

```bash
docker run --rm -d --name tracker-pg \
  -e POSTGRES_PASSWORD=tracker -p 5432:5432 postgres:16
export DATABASE_URL=postgres://postgres:tracker@localhost:5432/postgres
```

Without `DATABASE_URL`, `#[sqlx::test]` silently skips the test (0 tests run) — that is the expected "skipped" state, not a failure.

- [ ] **Step 1: Write `tracker/tests/store_idempotency.rs`**

The test:
1. Defines local helpers `sample_match_row()` and `sample_cursor()` returning deterministic data (any fixed 32-byte hashes, a slot, a small lifted JSON literal).
2. Uses `#[sqlx::test(migrations = "./migrations")]` to receive a fresh `PgPool` with migrations already applied.
3. Builds a `Store` via `Store::from_pool(pool)`.
4. Calls `apply_block` twice with the same row + cursor.
5. Asserts the first call's return is `1` (one row inserted) and the second is `0` (conflict skipped).

- [ ] **Step 2: Run the test**

With `DATABASE_URL` set and Postgres up: `cargo test --test store_idempotency`. Expected: 1 test, passes.

Without `DATABASE_URL`: `cargo test --test store_idempotency` reports 0 tests run. Both outcomes are valid.

- [ ] **Step 3: Commit**

Message: `tracker: add store idempotency integration test`.

---

## Task 8: Add `cursor_persistence` integration test

**Goal:** Verify the cursor round-trips through Postgres: write via `apply_block`, read back via `cursor()` against a freshly-built `Store` against the same pool.

**Files:**
- Create: `tracker/tests/cursor_persistence.rs`

**Reference:** Spec section "Tests" for the shape of the test.

- [ ] **Step 1: Write `tracker/tests/cursor_persistence.rs`**

The test:
1. Reuses a `sample_cursor()` helper (can be a local duplicate of the one in Task 7; do not extract to a `tests/common/` module unless a third test arrives).
2. Uses `#[sqlx::test(migrations = "./migrations")]` to receive a fresh `PgPool`.
3. Calls `apply_block(cursor, vec![])` on a first `Store::from_pool(pool.clone())` — passing an empty rows vec exercises the cursor-upsert path without matching rows.
4. Builds a second `Store::from_pool(pool)` and calls `cursor()`.
5. Asserts the returned cursor's `(slot, hash)` equals the one written.

- [ ] **Step 2: Run the test**

With `DATABASE_URL` set: `cargo test --test cursor_persistence`. Expected: 1 test, passes.

- [ ] **Step 3: Run the full suite to confirm no regression**

`cargo test`. Expected: 2 tests run, 2 pass (or 0 if `DATABASE_URL` is unset — both files skipped).

- [ ] **Step 4: Commit**

Message: `tracker: add cursor persistence integration test`.

---

## Task 9: Import the orcfax-burn example + tracker.toml.example

**Goal:** Provide the upstream smoke-test example (manual end-to-end check against a real utxorpc + Postgres) and a generic configuration template.

**Files:**
- Create: `tracker/examples/orcfax-burn/main.tx3` (verbatim)
- Create: `tracker/examples/orcfax-burn/trix.toml` (verbatim)
- Create: `tracker/examples/orcfax-burn/run.sh` (verbatim)
- Create: `tracker/examples/orcfax-burn/README.md` (verbatim)
- Create: `tracker/examples/orcfax-burn/tracker.toml` (single block changed)
- Create: `tracker/tracker.toml.example`

**Reference:** Upstream `bin/tracker/examples/orcfax-burn/` and `bin/tracker/tracker.toml.example` at the pinned sha. Spec section "Example: orcfax-burn" and section "`store.rs` rewrite → Collateral edits → `tracker.toml.example`" for the Postgres-flavored changes.

- [ ] **Step 1: Copy `main.tx3`, `trix.toml`, `run.sh`, `README.md` verbatim**

Into `tracker/examples/orcfax-burn/`. Do not edit.

- [ ] **Step 2: Copy `tracker.toml` and replace its `[storage]` block**

Bring the upstream `tracker.toml` to the same directory. The only edit: replace the `database_path = "./tracker.db"` line under `[storage]` with `database_url = "postgres://tracker:tracker@localhost:5432/tracker"`. Every other line stays.

- [ ] **Step 3: Write `tracker/tracker.toml.example`**

A generic template covering `[upstream]` (with endpoint + commented api_key + intersect = "tip"), `[upstream.filter]` (empty addresses + commented policy filters), `[storage]` (database_url with a brief comment noting `DATABASE_URL` env override), and one example `[[sources]]` entry. Use the upstream `bin/tracker/tracker.toml.example` as the model; the only behavioral change is in `[storage]`.

- [ ] **Step 4: Verify files exist (no build impact)**

`ls tracker/examples/orcfax-burn/` shows five files. `tracker/tracker.toml.example` exists.

- [ ] **Step 5: Commit**

Message: `tracker: import orcfax-burn smoke test + toml example`.

---

## Task 10: Add GitHub Actions workflow

**Goal:** CI builds the crate and runs both integration tests against a Postgres service sidecar. Triggered only by changes under `tracker/` or to the workflow file itself.

**Files:**
- Create: `.github/workflows/tracker.yml`

**Reference:** Spec section "Tests → Running tests in CI" for the workflow shape.

- [ ] **Step 1: Write `.github/workflows/tracker.yml`**

Triggers on push and PR for paths under `tracker/**` and the workflow file. One job, `ubuntu-latest`. Postgres 16 as a service with health checks; expose port 5432 to the runner. Set `DATABASE_URL` at the job level. Working directory `tracker/` for the run steps.

Steps:
1. `actions/checkout@v4`
2. `dtolnay/rust-toolchain@stable`
3. `Swatinem/rust-cache@v2` configured for the `tracker` workspace
4. `cargo build --all-targets`
5. `cargo test --all-features`

- [ ] **Step 2: Validate the YAML**

Use a YAML linter (e.g. `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/tracker.yml'))"`, or paste into yamllint.com). Expected: parses without error.

- [ ] **Step 3: Commit**

Message: `ci: add tracker workflow with postgres service sidecar`.

- [ ] **Step 4: Push and watch the first CI run**

Push the branch and open the Actions tab on GitHub. First run takes 5–8 minutes due to dep compilation; subsequent runs benefit from the rust-cache. Verify: postgres sidecar reports healthy, both `cargo build` and `cargo test` exit 0, both tests pass.

If either step fails, do NOT bypass — investigate. Common causes: Postgres health check too tight, `DATABASE_URL` typo, missing `--all-targets` revealing a test-only path that doesn't compile.

---

## Final verification

After Task 10 lands, the following are all true:

1. From `registry/tracker/`: `cargo build` succeeds, both lib and bin.
2. With Docker Postgres running and `DATABASE_URL` exported: `cargo test` runs 2 tests, both pass.
3. The `tracker` binary boots, logs `starting tracker`, and exits 1 on a missing config (proves the wiring end-to-end).
4. GH Actions `tracker` workflow goes green on a push to the branch.

## Intentionally NOT done in phase 1

These are listed in the spec's "Out of scope" section and must NOT be implemented as part of this plan. If you find yourself wanting to add them, stop and discuss with the user first.

- Dockerfile / k8s manifests for cluster deployment.
- Auto-discovering TIIs from the OCI registry.
- Backend GraphQL queries reading from the tracker's Postgres.
- A registry-specific smoke test (one wired to a `data/*.tx3` protocol).
