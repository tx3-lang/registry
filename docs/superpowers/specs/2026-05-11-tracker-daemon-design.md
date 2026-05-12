# Tracker daemon — design

Status: approved (2026-05-11)
Scope: phase 1 — bring the `tx3-lift` tracker into the registry workspace,
migrate persistence from SQLite to Postgres, leave the binary buildable
and tested. No deployment artifacts, no backend integration in this phase.

## Motivation

The registry needs a long-running process that watches Cardano via a
utxorpc upstream, matches every transaction against the TIIs the registry
cares about, and persists each match as a `Lifted` annotation. Today this
daemon exists upstream as `tx3-lift/bin/tracker` and stores into SQLite.
We want to:

1. own a copy of the daemon inside the registry repo so it ships with the
   other registry components,
2. swap SQLite for Postgres so the daemon's persistence layer matches
   what the registry will standardize on operationally (managed Postgres
   in the cluster, queryable from anywhere the cluster reaches it),
   instead of a local file the way upstream `tx3-lift` does. The registry
   does not currently use Postgres for anything else; the tracker is the
   first component to introduce it.
3. keep the upstream `tx3-lift` / `tx3-lift-cardano` crates as plain git
   dependencies — we are not forking them.

This document describes the layout, the dependency strategy, the schema
changes, the `store.rs` rewrite, the test setup, and the order in which
the changes land.

## Repo layout

A new top-level `tracker/` directory, sibling of `backend/` and
`frontend/`. The tracker has its own `Cargo.toml`; we do not create a
root-level Cargo workspace. Each component (backend, frontend, tracker)
continues to build and deploy independently — that is already the pattern
of this repo.

```
registry/
├── backend/                       (unchanged)
├── frontend/                      (unchanged)
├── tracker/                       new
│   ├── Cargo.toml
│   ├── Cargo.lock
│   ├── src/
│   │   ├── main.rs
│   │   ├── config.rs
│   │   ├── error.rs
│   │   ├── process.rs
│   │   ├── specialization.rs
│   │   ├── store.rs
│   │   └── upstream/
│   │       ├── mod.rs
│   │       └── predicate.rs
│   ├── migrations/
│   │   └── 20260511000001_initial.sql
│   ├── tests/
│   │   ├── store_idempotency.rs
│   │   └── cursor_persistence.rs
│   ├── tracker.toml.example
│   └── examples/
│       └── orcfax-burn/           (copied verbatim, tracker.toml updated)
└── docker/                        (unchanged)
```

The `crates/tx3-lift` and `crates/tx3-lift-cardano` source code is NOT
copied into the repo. We depend on it by git rev. See the next section.

## Dependencies

`tracker/Cargo.toml`:

```toml
[package]
name        = "tx3-registry-tracker"
version     = "0.1.0"
edition     = "2021"
license     = "Apache-2.0"
repository  = "https://github.com/tx3-lang/registry"
description = "24/7 tracker daemon for the tx3 registry — lifts matched txs into Postgres"

[[bin]]
name = "tracker"
path = "src/main.rs"

[dependencies]
tx3-lift         = { git = "https://github.com/tx3-lang/tx3-lift", rev = "04d0b90a34b2461dd497f9941b491aed5d925bfd" }
tx3-lift-cardano = { git = "https://github.com/tx3-lang/tx3-lift", rev = "04d0b90a34b2461dd497f9941b491aed5d925bfd" }
tx3-tir          = "0.17.0"
tx3-sdk          = "0.11.0"
pallas           = ">=1.0.0-alpha, <2.0.0"

utxorpc-spec = "0.19"
tonic        = { version = "0.12", features = ["tls", "tls-roots"] }
prost        = "0.13"
prost-types  = "0.13"

tokio = { version = "1", features = ["rt-multi-thread", "macros", "signal", "sync"] }

sqlx = { version = "0.8", features = [
    "runtime-tokio",
    "tls-rustls",
    "postgres",
    "macros",
    "migrate",
    "json",
    "chrono",
] }

toml         = "0.8"
serde        = { version = "1.0", features = ["derive"] }
serde_bytes  = "0.11"
serde_json   = "1.0"

thiserror          = "2.0"
hex                = "0.4"
bech32             = "0.11"
tracing            = "0.1"
tracing-subscriber = { version = "0.3", features = ["env-filter"] }
```

Notes:

- The `rev` is pinned to the current `main` of `tx3-lift`
  (`04d0b90a34b2461dd497f9941b491aed5d925bfd`, captured at spec time via
  `git ls-remote`). Bumping it later is a single edit + `cargo update -p`.
- `sqlx` replaces `rusqlite`. Features rationale:
  - `postgres` — driver.
  - `runtime-tokio` + `tls-rustls` — fits the rest of the daemon (tokio
    runtime, no system OpenSSL dependency for managed Postgres).
  - `macros` — enables `#[sqlx::test]` for the test suite.
  - `migrate` — embedded migrator (`sqlx::migrate!("./migrations")`).
  - `json` — JSONB ↔ `serde_json::Value`.
  - `chrono` — `TIMESTAMPTZ` ↔ `chrono::DateTime<Utc>` (read path).
- Compile-time query verification (`query!`/`query_as!`) is intentionally
  not used in phase 1. We use runtime-checked queries
  (`sqlx::query`, `sqlx::query_as::<_, T>("...")`) so `cargo build` does
  not need a live Postgres. If we want compile-time checking later, we
  generate `.sqlx/` with `sqlx prepare` and commit it.

## Schema

`tracker/migrations/20260511000001_initial.sql`:

```sql
CREATE TABLE matches (
    id            BIGSERIAL   PRIMARY KEY,
    tx_hash       BYTEA       NOT NULL,
    block_slot    BIGINT      NOT NULL,
    block_hash    BYTEA       NOT NULL,
    source_name   TEXT        NOT NULL,
    protocol_name TEXT        NOT NULL,
    tx_name       TEXT        NOT NULL,
    profile_name  TEXT        NOT NULL,
    lifted        JSONB       NOT NULL,
    matched_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tx_hash, source_name)
);

CREATE INDEX idx_matches_block  ON matches (block_slot, block_hash);
CREATE INDEX idx_matches_source ON matches (source_name);

CREATE TABLE cursor (
    id         SMALLINT PRIMARY KEY CHECK (id = 1),
    slot       BIGINT   NOT NULL,
    block_hash BYTEA    NOT NULL
);
```

Material differences from the SQLite original
(`tx3-lift/bin/tracker/migrations/001_initial.sql`):

- `lifted` is `JSONB` instead of `TEXT`. Postgres has native typed JSON
  with operators (`->`, `->>`, `@>`); we keep the schema-evolution-friendly
  property of the original (annotation shape can change without a
  migration) and gain the option of GIN indexes later.
- `matched_at` is `TIMESTAMPTZ DEFAULT now()` instead of
  `INTEGER` populated from `unix_secs()` in Rust. Insert path drops the
  parameter; readers consume a TZ-aware timestamp.
- `block_slot` is explicit `BIGINT`. SQLite's `INTEGER` is 64-bit;
  Postgres' is 32-bit, which can grow into a problem.
- `id` is `BIGSERIAL` instead of `INTEGER PRIMARY KEY` (Postgres
  equivalent of SQLite rowid).
- The `_schema_versions` bookkeeping table is gone. `sqlx::migrate!()`
  manages its own `_sqlx_migrations` table with the same purpose
  (checksum-hashed per file, drift-detecting).
- No `PRAGMA journal_mode=WAL`. Postgres has MVCC natively; concurrent
  readers are safe without per-connection setup.

Invariants preserved exactly:

- `UNIQUE(tx_hash, source_name)` + `ON CONFLICT … DO NOTHING` keeps the
  re-application of a previously-seen block idempotent on restart.
- `cursor` is single-row (`CHECK (id = 1)`).
- Apply and Undo are atomic — one `BEGIN` envelopes the row writes AND
  the cursor update, so the cursor never gets ahead of persisted matches.

## `store.rs` rewrite

The module's public surface is unchanged:

```rust
pub struct Store { /* internals private */ }
pub struct ChainPoint { pub slot: u64, pub hash: [u8; 32] }
pub struct OwnedMatchRow { /* unchanged */ }

impl Store {
    pub async fn open(database_url: &str) -> Result<Self>;
    pub async fn cursor(&self) -> Result<Option<ChainPoint>>;
    pub async fn apply_block(&self, cursor: ChainPoint, rows: Vec<OwnedMatchRow>) -> Result<usize>;
    pub async fn undo_tx(&self, tx_hash: Vec<u8>, parent: Option<ChainPoint>) -> Result<usize>;
    // tests only:
    pub fn from_pool(pool: PgPool) -> Self;
}
```

This preserves `main.rs` and `process.rs` as untouched callers. Internals:

- `Arc<Mutex<rusqlite::Connection>>` → `PgPool` (max 8 connections). The
  daemon serializes writes logically (single Watch loop), so the pool is
  mainly there for tests and any future read-only consumer.
- `tokio::task::spawn_blocking` calls are removed — sqlx is async-native.
- `?` placeholders → `$1..$N`.
- `INSERT OR IGNORE` → `INSERT ... ON CONFLICT (tx_hash, source_name) DO NOTHING`.
- `matched_at` is no longer bound from Rust; `DEFAULT now()` does it.
- `lifted` is bound as `String` and cast inline (`$8::jsonb`).
- `Store::open_memory()` is removed — Postgres has no `:memory:`. Tests
  use `#[sqlx::test]` instead (see below).
- Internal `MIGRATIONS` const + `run_migrations` are removed —
  `sqlx::migrate!("./migrations").run(&pool)` runs on `open`.

### Collateral edits

`config.rs`:

- `StorageConfig.database_path: PathBuf` → `StorageConfig.database_url: String`.
- `load()` overrides `storage.database_url` with the `DATABASE_URL` env
  var if set. Cluster deployments inject the connection string via secret,
  not via TOML.

`error.rs`:

- Remove `Sqlite(#[from] rusqlite::Error)`.
- Add `Sqlx(#[from] sqlx::Error)` and
  `SqlxMigrate(#[from] sqlx::migrate::MigrateError)`.
- `Io` and `Join` variants stay if other modules still need them; the
  store stops triggering them.

`main.rs`:

- One line: `Store::open(&cfg.storage.database_path)` →
  `Store::open(&cfg.storage.database_url)`.

`tracker.toml.example`:

```toml
[storage]
database_url = "postgres://tracker:tracker@localhost:5432/tracker"
```

## Tests

Two integration tests, both via `#[sqlx::test]`:

```rust
// tests/store_idempotency.rs
#[sqlx::test(migrations = "./migrations")]
async fn reinserting_same_match_is_noop(pool: PgPool) -> sqlx::Result<()> {
    let store = Store::from_pool(pool);
    let row = sample_match_row();
    let cursor = sample_cursor();

    let n1 = store.apply_block(cursor, vec![row.clone()]).await.unwrap();
    let n2 = store.apply_block(cursor, vec![row.clone()]).await.unwrap();

    assert_eq!(n1, 1);
    assert_eq!(n2, 0); // UNIQUE constraint + ON CONFLICT DO NOTHING
    Ok(())
}
```

```rust
// tests/cursor_persistence.rs
#[sqlx::test(migrations = "./migrations")]
async fn cursor_survives_reopen(pool: PgPool) -> sqlx::Result<()> {
    let store = Store::from_pool(pool.clone());
    let cursor = sample_cursor();
    store.apply_block(cursor, vec![]).await.unwrap();

    let reopened = Store::from_pool(pool);
    let got = reopened.cursor().await.unwrap();
    assert_eq!(got.map(|c| (c.slot, c.hash)), Some((cursor.slot, cursor.hash)));
    Ok(())
}
```

Setup details:

- `#[sqlx::test(migrations = "./migrations")]` creates a fresh database
  per test against the Postgres at `DATABASE_URL` and applies the
  migrations before invoking the test fn. Tests are skipped if
  `DATABASE_URL` is not set.
- `Store::from_pool(pool)` is a constructor used by the integration tests
  to inject the pool that `#[sqlx::test]` already migrated. Because Cargo
  integration tests (`tests/*.rs`) compile as separate crates, it must be
  `pub` — not gated behind `#[cfg(test)]`. We document its test-only
  intent with a `// test-only` doc comment instead.
- `sample_match_row()` / `sample_cursor()` are trivial helpers; can be
  duplicated across the two test files or factored into a
  `tests/common/mod.rs`. Duplicate first; extract if a third test arrives.

### Running tests locally

```sh
docker run --rm -d --name tracker-pg \
  -e POSTGRES_PASSWORD=tracker -p 5432:5432 postgres:16
export DATABASE_URL=postgres://postgres:tracker@localhost:5432/postgres
cargo test
```

### Running tests in CI

`.github/workflows/tracker.yml` uses GH Actions `services:` Postgres
sidecar:

```yaml
name: tracker
on:
  push:
    paths: ['tracker/**']
  pull_request:
    paths: ['tracker/**']
jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: tracker
          POSTGRES_PASSWORD: tracker
          POSTGRES_DB: tracker
        ports: ['5432:5432']
        options: >-
          --health-cmd "pg_isready -U tracker"
          --health-interval 5s
          --health-timeout 3s
          --health-retries 10
    env:
      DATABASE_URL: postgres://tracker:tracker@localhost:5432/tracker
    defaults:
      run:
        working-directory: tracker
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
      - uses: Swatinem/rust-cache@v2
        with:
          workspaces: tracker
      - run: cargo test --all-features
```

## Example: orcfax-burn

`tracker/examples/orcfax-burn/` is copied verbatim from
`tx3-lift/bin/tracker/examples/orcfax-burn/`. It is a manual smoke test:
`run.sh` rebuilds the TII via `trix build -p mainnet`, then runs the
tracker with an `intersect` pinned to a parent block of a known historical
Orcfax burn on Cardano mainnet. With a v1beta utxorpc server reachable
locally, the daemon captures the burn and persists one row.

The only change to the example is the `tracker.toml` it ships with:
`[storage] database_url = "postgres://..."` replaces `database_path`.

Maintenance commitment: if the pinned intersect ever falls outside the
upstream's retention window or the `trix` build pipeline breaks, we
repin / fix it. Code that bit-rots in the repo is worse than no example.

## Migration plan

Each step is a separate commit. Each step is independently verifiable.

1. **Capture the pinned `tx3-lift` sha**
   (`04d0b90a34b2461dd497f9941b491aed5d925bfd` — already recorded above).
   The Cargo.toml's `rev = "…"` uses it.
2. **Scaffold the crate.** Create `tracker/Cargo.toml`, `tracker/src/main.rs`
   with `fn main() {}`, `tracker/.gitignore` (`target/`, `*.db*`).
   `cargo build` from `tracker/` resolves the git deps.
3. **Copy verbatim modules from `tx3-lift/bin/tracker/src/`:** `config.rs`,
   `error.rs`, `process.rs`, `specialization.rs`, `upstream/mod.rs`,
   `upstream/predicate.rs`. Also copy `main.rs`. The crate will not build
   yet — `store` is missing and `config`/`error` still target SQLite.
4. **Adapt `config.rs` and `error.rs` to Postgres.** Rename
   `database_path` → `database_url`, add `DATABASE_URL` env override in
   `load()`, swap `Sqlite` variant for `Sqlx` + `SqlxMigrate` in the error
   enum.
5. **Add `tracker/migrations/20260511000001_initial.sql`** and **rewrite
   `tracker/src/store.rs`** with `PgPool` + `sqlx::migrate!()`. Same
   public API as before. Update the single line in `main.rs` that passes
   `database_url`. `cargo build` passes.
6. **Port the two store tests** to `#[sqlx::test]`. Add the
   `Store::from_pool` test-only constructor. Tests pass against a local
   Postgres with `DATABASE_URL` set; skipped otherwise.
7. **Copy `examples/orcfax-burn/` verbatim**, replacing only the
   `tracker.toml` storage block with `database_url`. Copy
   `tracker.toml.example` and update it to Postgres semantics.
8. **Add `.github/workflows/tracker.yml`** with the Postgres service
   sidecar. The first push runs the workflow and both tests pass.

## Risks

- The pinned `tx3-lift` sha (`04d0b90`) was built against
  `tx3-tir = "0.17.0"` and `tx3-sdk = "0.11.0"`, same versions the
  registry's `backend/` uses. Resolution is expected to succeed but is
  verified in step 2.
- `sqlx::query!()` would activate compile-time DB checks. We are using
  the runtime-checked `query` / `query_as` helpers; if anyone introduces
  a `query!()`, the build starts requiring `DATABASE_URL`. Worth a
  comment near the queries to keep that intentional.
- Step 6 needs a Postgres running locally for the verification. If
  unavailable, the step is still verifiable on the GH Actions run added
  in step 8.

## Out of scope (phase 1)

- Dockerfile and cluster manifests for running the daemon 24/7.
- Backend GraphQL queries reading from the tracker's Postgres.
- Auto-discovery of TIIs from the OCI registry.
- A registry-specific E2E smoke test (one built around a registry
  protocol, not Orcfax). The orcfax-burn example covers the
  tx3-lift-developer workflow; a registry-flavored smoke test will be
  designed separately if/when it is needed.
