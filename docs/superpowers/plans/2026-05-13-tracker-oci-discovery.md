# Tracker OCI Discovery — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Format note:** This plan intentionally describes goals, file targets, behaviors, test names and acceptance criteria — **not** code. The implementing agent writes the code. Each step says *what* must hold true, never *how to type it*.

**Goal:** Replace the tracker's local `[[sources]]` / `tii_path` config with allow/deny-filtered auto-discovery of protocols and TIIs from the Zot OCI registry at startup.

**Architecture:** New `tracker/src/discovery.rs` module owns all conversation with Zot, mirroring the GraphQL + `oci-client` pattern already in `backend/src/oci.rs`. It queries `RepoListWithNewestImage`, applies allow/deny filters, pulls each surviving image and decodes its `application/tii+json` layer, and returns a `Vec<DiscoveredSource>` that `specialization::specialize_all` consumes. `[[sources]]` is removed; `[oci]` + `[upstream].profile` replace it.

**Tech Stack:** Rust (existing tracker crate), `oci-client 0.14` (new dep), `reqwest 0.12` w/ `json` feature (new dep), `urlencoding` (new dep — used by backend already), `wiremock 0.6` (new dev-dep), `tokio`, `serde`, `serde_json`. The implementing agent should verify exact patch versions against `backend/Cargo.toml` for parity.

**Reference spec:** `docs/superpowers/specs/2026-05-13-tracker-oci-discovery-design.md` — read it before starting Task 1.

---

## File map (locked in)

Create:
- `tracker/src/discovery.rs` — discovery module (Zot GraphQL + image pulls + filters).
- `tracker/tests/discovery.rs` — wiremock-based integration test.
- `tracker/tests/fixtures/orcfax_burn.tii` — fixture TII for the integration test, copied from `tracker/examples/orcfax-burn/`.

Modify:
- `tracker/Cargo.toml` — new deps (`oci-client`, `reqwest`, `urlencoding`) and dev-dep (`wiremock`).
- `tracker/src/config.rs` — drop `SourceConfig`/`sources`, add `profile` to `UpstreamConfig`, add `OciConfig` + `ProfileOverride`, add `OCI_REGISTRY_URL` env override.
- `tracker/src/error.rs` — new variants `OciRegistry`, `ZotHttp`.
- `tracker/src/specialization.rs` — accept `&[DiscoveredSource]`, read TII from memory, use `source_name` (`scope/name:version`) as the `SpecializedTii.name`.
- `tracker/src/lib.rs` — invoke `discovery::fetch_catalog` before `specialize_all`; adjust startup log line.
- `tracker/tracker.toml.example` — new schema (no `[[sources]]`, with `[oci]` and `[upstream].profile`).
- `tracker/examples/orcfax-burn/tracker.toml` — same schema migration.
- `tracker/examples/orcfax-burn/run.sh` — `trix publish` step before launching the tracker.

Not touched: `tracker/src/main.rs`, `tracker/src/process.rs`, `tracker/src/store.rs`, `tracker/src/upstream/*`, the `migrations/` folder, the `cursor_persistence.rs` / `store_idempotency.rs` integration tests, `.github/workflows/tracker.yml`.

---

## Task 1: Strip `[[sources]]` and shape the new config schema

**Goal:** `tracker.toml` schema is the new shape — `[upstream].profile` is required, `[[sources]]` and `tii_path` no longer parse, `[oci]` exists with allow/deny lists and optional `profile_override`. Crate intentionally fails to build at the end of this task — it is repaired by Tasks 2-4.

**Files:**
- Modify: `tracker/src/config.rs`
- Modify: `tracker/tracker.toml.example`
- Modify: `tracker/examples/orcfax-burn/tracker.toml`

**Steps:**

- [ ] **Step 1: Read the reference spec.**
  Open `docs/superpowers/specs/2026-05-13-tracker-oci-discovery-design.md`. Internalize the "Config schema" section — that section is authoritative for what this task produces.

- [ ] **Step 2: Update `UpstreamConfig`.**
  Add a required `profile: String` field. No default. Document it in a doc comment as "TII profile name applied to every discovered protocol (with optional per-protocol overrides under [oci.profile_override])". Field order: after `intersect`, before `filter`.

- [ ] **Step 3: Remove the `SourceConfig` type and the `sources` field on `Config`.**
  Delete both. The `Config` struct keeps `upstream`, `storage`, and gains `oci` (added below). Also delete the `at least one [[sources]] entry is required` validation in `load()`.

- [ ] **Step 4: Add `OciConfig` and `ProfileOverride`.**
  New struct `OciConfig` with fields: `registry_url: String`; four allow/deny lists `include_scopes: Vec<String>`, `include_names: Vec<String>`, `exclude_scopes: Vec<String>`, `exclude_names: Vec<String>` (each `#[serde(default)]`); `profile_override: Vec<ProfileOverride>` (`#[serde(default)]`, key in TOML is `profile_override`). New struct `ProfileOverride` with `match_: String` (rename via `#[serde(rename = "match")]`) and `profile: String`. Both structs derive `Debug, Clone, Deserialize, Serialize`. Add an `oci: OciConfig` field to `Config`.

- [ ] **Step 5: Wire the `OCI_REGISTRY_URL` env override in `config::load`.**
  Mirror the existing `DATABASE_URL` override: after deserializing the TOML and before returning, if the env var is set, replace `cfg.oci.registry_url` with its value.

- [ ] **Step 6: Update `tracker/tracker.toml.example`.**
  Make it match the spec's "Config schema" example verbatim (with the inline comments documenting allow/deny semantics). Drop the `[[sources]]` block entirely. Add `profile = "preview"` under `[upstream]`.

- [ ] **Step 7: Update `tracker/examples/orcfax-burn/tracker.toml`.**
  Drop its `[[sources]]` block. Add `[upstream].profile = "mainnet"` (the orcfax-burn example targets mainnet). Add an `[oci]` block with `registry_url = "http://localhost:3000"` and `include_names = ["txpipe/orcfax-burn"]` (the example must not depend on whatever else lives in the local Zot).

- [ ] **Step 8: Verify the config module's unit-test view.**
  If `config.rs` has any `#[cfg(test)]` block, update or remove cases that assume `SourceConfig`. (Per current code there is no such block — confirm and move on.)

- [ ] **Step 9: Build expectation.**
  `cargo build -p tx3-registry-tracker` is **expected to fail** at this step: `lib.rs` and `specialization.rs` still mention `SourceConfig` / `cfg.sources`. Do not chase those errors here — Task 2 and Task 3/4 fix them. Record the failure mode in the commit body for traceability.

- [ ] **Step 10: Commit.**
  Subject: `tracker: replace [[sources]] config with [oci] + [upstream].profile`. Body: 1-2 lines noting that the crate intentionally does not build until Task 4 lands.

---

## Task 2: Introduce `DiscoveredSource` and re-shape `specialize_all`

**Goal:** `specialization::specialize_all` accepts `&[DiscoveredSource]`. It no longer reads the filesystem. `SpecializedTii.name` is the `scope/name:version` source name. The crate is **still** not buildable (the type does not yet exist anywhere callable from `lib.rs`), but `specialization.rs` and its callees are internally consistent.

**Files:**
- Modify: `tracker/src/specialization.rs`

**Steps:**

- [ ] **Step 1: Define `DiscoveredSource` in `specialization.rs`.**
  For now the type lives here; Task 3 either keeps it here or re-exports from `discovery.rs` — whatever produces less churn. Fields exactly as in the spec's "`discovery.rs` API" section: `source_name: String`, `scope: String`, `name: String`, `version: String`, `tii: TiiFile`, `profile_name: String`. Derives: `Debug, Clone`.

- [ ] **Step 2: Rewrite `specialize_all` signature.**
  Change to take `&[DiscoveredSource]`. Return type unchanged (`Result<Vec<SpecializedTii>>`).

- [ ] **Step 3: Rewrite `specialize_one`.**
  Inputs: a single `&DiscoveredSource`. Stop calling `std::fs::read_to_string` and `serde_json::from_str`. Use `src.tii` directly as the `TiiFile`. Use `src.profile_name` everywhere the old code used `src.profile`. Set the returned `SpecializedTii.name = src.source_name.clone()` and `SpecializedTii.profile_name = src.profile_name.clone()`. Keep the empty-`txs` check, but adjust its error message to: `"protocol {source_name} has no transactions for profile {profile_name}"` (using `Error::Config`).

- [ ] **Step 4: Update doc comments at the top of the file.**
  The module comment currently says "every configured TII" — adjust it to "every discovered TII". Keep the explanation of why specialization is hoisted out of the hot path.

- [ ] **Step 5: Verify expected build state.**
  `cargo build -p tx3-registry-tracker` still **expected to fail**: `lib.rs::run` still calls `specialize_all(&cfg.sources)` — that wires the missing type and missing field together. Both go away in Task 4.

- [ ] **Step 6: Commit.**
  Subject: `tracker: switch specialization to in-memory DiscoveredSource`. Body line: notes the crate stays red until lib.rs wires discovery.

---

## Task 3: `discovery.rs` — pure helpers and unit tests (no network)

**Goal:** A new module `tracker/src/discovery.rs` is registered from `lib.rs`. It exports `DiscoveredSource` (or re-exports it from `specialization.rs` — see Task 2 Step 1) and the two pure helpers `apply_filters` and `resolve_profile`, each covered by unit tests. The module compiles. No HTTP, no GraphQL, no `fetch_catalog` yet.

**Files:**
- Create: `tracker/src/discovery.rs`
- Modify: `tracker/src/lib.rs` — single line: `pub mod discovery;`

**Steps:**

- [ ] **Step 1: Add `pub mod discovery;` to `tracker/src/lib.rs`.**
  Position it alphabetically with the other module declarations. No other edits to `lib.rs` in this task.

- [ ] **Step 2: Stand up `discovery.rs` skeleton.**
  Module header comment summarizing role (paraphrase the spec's "Architecture" section). Imports it will need now: `crate::config::OciConfig`, types from `oci-client` and `reqwest` are NOT needed yet (Task 4). Re-export or re-declare `DiscoveredSource` to match Task 2's decision.

- [ ] **Step 3: Define an internal `RepoSummary` helper struct.**
  Plain Rust struct used by the unit tests in this task. Fields: `name: String` (the full `scope/name`), `scope: String`, `tag: String`. Derive `Debug, Clone, PartialEq`. This intentionally does not match the Zot GraphQL response shape — that comes in Task 4. Justification: the filter is logically independent from the wire format; keeping it that way is what makes it pure-testable.

- [ ] **Step 4: Write the unit test `apply_filters_no_lists_is_identity`.**
  Located in `#[cfg(test)] mod tests` at the bottom of the file. Assertion: with empty include and empty exclude lists, the returned vector equals the input (order preserved).

- [ ] **Step 5: Implement `apply_filters` minimally to make Step 4 pass.**
  Signature: `fn apply_filters(repos: Vec<RepoSummary>, oci: &OciConfig) -> Vec<RepoSummary>`. Body: if every list is empty, return `repos` unchanged.

- [ ] **Step 6: Verify Step 4.**
  Run: `cargo test -p tx3-registry-tracker apply_filters_no_lists_is_identity`. Expected: PASS.

- [ ] **Step 7: Add the rest of the `apply_filters` test cases.**
  Five more tests, each named for its scenario:
  - `apply_filters_include_scopes_keeps_only_matching` — given two repos in different scopes and one include_scope, only the matching one survives.
  - `apply_filters_include_names_keeps_only_matching` — given two repos and one include_name (`scope/name`), only the matching one survives.
  - `apply_filters_includes_are_union` — if either include list matches, the repo survives.
  - `apply_filters_exclude_scopes_drops_matching` — even with empty includes, an excluded scope is dropped.
  - `apply_filters_exclude_wins_over_include` — if a repo matches both an include and an exclude, exclude wins.

- [ ] **Step 8: Flesh out `apply_filters` to make Step 7 tests pass.**
  Semantics from the spec's "Config schema" section: includes are evaluated first as a union; if both include lists are empty the include phase is a no-op (allow-all); excludes are applied afterwards on the result.

- [ ] **Step 9: Verify.**
  Run: `cargo test -p tx3-registry-tracker apply_filters`. Expected: all six PASS.

- [ ] **Step 10: Write `resolve_profile` tests.**
  Three tests:
  - `resolve_profile_falls_back_to_default_with_no_overrides`.
  - `resolve_profile_first_match_wins` — two overrides where the second also matches; the first override's profile is returned.
  - `resolve_profile_returns_default_when_no_override_matches` — overrides exist but none target this `scope/name`.

- [ ] **Step 11: Implement `resolve_profile`.**
  Signature: `fn resolve_profile(scope: &str, name: &str, oci: &OciConfig, default: &str) -> String`. Walk `oci.profile_override`, return the first whose `match_` equals `format!("{scope}/{name}")`. Otherwise return `default.to_string()`.

- [ ] **Step 12: Verify.**
  Run: `cargo test -p tx3-registry-tracker resolve_profile`. Expected: all three PASS.

- [ ] **Step 13: Commit.**
  Subject: `tracker: add discovery module with pure filter and profile-resolution helpers`. Body: notes the helpers are pure and unit-tested in isolation; the network path is Task 4.

---

## Task 4: `discovery::fetch_catalog` — GraphQL + image pulls, wire into `lib.rs`

**Goal:** `discovery::fetch_catalog(&cfg.oci, &cfg.upstream.profile)` returns `Result<Vec<DiscoveredSource>>` by paginating Zot's `RepoListWithNewestImage` GraphQL, applying `apply_filters`, pulling each surviving image with `oci-client`, decoding the `application/tii+json` layer, and resolving the profile. `lib.rs::run` consumes it. `cargo build` is green again; `cargo test` (existing tests + Task 3 unit tests) passes.

**Files:**
- Modify: `tracker/Cargo.toml`
- Modify: `tracker/src/discovery.rs`
- Modify: `tracker/src/error.rs`
- Modify: `tracker/src/lib.rs`

**Steps:**

- [ ] **Step 1: Add dependencies to `tracker/Cargo.toml`.**
  Under `[dependencies]`:
  - `oci-client = "0.14"` — pin major.minor to match `backend/Cargo.toml`.
  - `reqwest = { version = "0.12", features = ["json"] }` — match backend.
  - `urlencoding = "2.1"` — match backend, used for the GraphQL `query=` param.
  Run `cargo build -p tx3-registry-tracker` to fetch and verify resolution.

- [ ] **Step 2: Add error variants in `tracker/src/error.rs`.**
  Two new variants on the `Error` enum:
  - `OciRegistry(#[from] oci_client::errors::OciDistributionError)` — display string `"oci registry: {0}"`.
  - `ZotHttp(#[from] reqwest::Error)` — display string `"zot http: {0}"`.
  Leave existing variants untouched.

- [ ] **Step 3: Define the GraphQL response types inside `discovery.rs`.**
  Mirror the shape of `backend/src/oci.rs::ZotResponse` but for `RepoListWithNewestImage`. Suggested type names (private to the module): `ZotResponse`, `Data`, `RepoListWithNewestImage`, `RepoSummaryWire`, `NewestImage`, `PageInfo`. Use the same `#[serde(rename = "...")]` attributes the backend uses for the capitalized JSON field names (`Page`, `Results`, `Name`, `NewestImage`, `Tag`, `Vendor`, `TotalCount`, `ItemCount`). `Data` should expose `RepoListWithNewestImage` via `#[serde(rename = "RepoListWithNewestImage")]`. These types are private to `discovery.rs`.

- [ ] **Step 4: Implement `query_repo_list`.**
  Private async fn. Signature: takes a `&reqwest::Client` and a base URL `&str`, returns `Result<Vec<RepoSummary>>` (the existing `RepoSummary` from Task 3). Behavior:
  - Loop with `offset` starting at 0, `LIMIT = 100`.
  - Per iteration: build the GraphQL `query` body for `RepoListWithNewestImage` with `requestedPage: { limit: $LIMIT, offset: $offset }`, asking only for `Name` and `NewestImage { Tag Vendor }`. URL-encode with `urlencoding::encode`. GET against `<base_url>/v2/_zot/ext/search?query=<encoded>`. Deserialize into `ZotResponse`.
  - For each `Results[]` entry: produce a `RepoSummary { name, scope: NewestImage.Vendor, tag: NewestImage.Tag }`. Skip entries missing a tag (log a warning).
  - Stop when `Page.ItemCount < LIMIT`.
  - Errors propagate as `Error::ZotHttp`. A `data == null` + `errors != null` response is mapped to `Error::Config("zot returned graphql errors: {...}")` — surface the message body in the log so operators can diagnose schema drift.

- [ ] **Step 5: Implement `pull_tii`.**
  Private async fn. Signature: takes an `&oci_client::Client`, a `registry_host: &str`, and a `scope`, `name`, `version`. Returns `Result<TiiFile>`. Behavior:
  - Build a `oci_client::Reference` from `format!("{registry_host}/{scope}/{name}:{version}")`. (Same trick as `backend/src/oci.rs::get_oci_image`.)
  - `client.pull(&reference, &RegistryAuth::Anonymous, vec!["application/tii+json"])`.
  - Find the layer whose `media_type == "application/tii+json"`. If absent, return `Error::Config("protocol {scope}/{name}:{version} has no application/tii+json layer")`.
  - `serde_json::from_slice::<TiiFile>(&layer.data)` (propagated through whatever Json error variant the existing `error.rs` exposes — verify the variant exists or add a `from_str` path via the standard chain).

- [ ] **Step 6: Implement helpers to derive scheme + host from `registry_url`.**
  Two tiny private fns (or inline expressions): one returns `oci_client::client::ClientProtocol::{Http,Https}` based on the URL scheme; the other strips the scheme to produce the registry host used inside the `oci_client::Reference`. Follow the exact same parsing approach as `backend/src/oci.rs::get_client` / `get_oci_image` — same split on `"://"`. Unit-test the host stripper with three inputs: `http://localhost:3000`, `https://reg.example.com`, and `https://reg.example.com:8443`.

- [ ] **Step 7: Implement `fetch_catalog`.**
  Public async fn. Signature: `pub async fn fetch_catalog(oci: &OciConfig, default_profile: &str) -> Result<Vec<DiscoveredSource>>`. Behavior:
  - Construct a `reqwest::Client::new()` and an `oci_client::Client` (with `ClientConfig.protocol` from Step 6).
  - `repos = query_repo_list(&http, &oci.registry_url).await?`.
  - `filtered = apply_filters(repos, oci)`.
  - For each entry in `filtered`: split `RepoSummary.name` on `'/'` into `(repo_scope, name_only)`. Compare against `RepoSummary.scope` (which carries the manifest `Vendor`): if they disagree, log a warning and **prefer `repo_scope`** (Vendor is operator-set and untrusted; the repo path is what Zot indexes by). Then pull the TII via `pull_tii`, resolve the profile via `resolve_profile(repo_scope, name_only, oci, default_profile)`, and push `DiscoveredSource { source_name: format!("{repo_scope}/{name_only}:{tag}"), scope: repo_scope, name: name_only, version: tag, tii, profile_name }`.
  - If the resulting `Vec` is empty, return `Error::Config("OCI registry returned no protocols (catalog empty or all filtered out)")`.
  - Otherwise return it.

- [ ] **Step 8: Wire into `lib.rs::run`.**
  Replace the `let specialized = specialization::specialize_all(&cfg.sources)?;` call (which no longer compiles) with two lines: `let discovered = discovery::fetch_catalog(&cfg.oci, &cfg.upstream.profile).await?;` and `let specialized = specialization::specialize_all(&discovered)?;`. Adjust the surrounding `info!(...)` line to read `"specialized discovered sources"` (per spec §"`lib.rs::run` change").

- [ ] **Step 9: Sanity build + existing tests.**
  Run: `cargo build -p tx3-registry-tracker`. Expected: PASS.
  Run: `cargo test -p tx3-registry-tracker --lib`. Expected: all unit tests PASS (Task 3 helpers plus any others).
  Run: `cargo test -p tx3-registry-tracker --test store_idempotency --test cursor_persistence`. Expected: PASS if Postgres is running; SKIP otherwise.

- [ ] **Step 10: Commit.**
  Subject: `tracker: discover protocols and TIIs from the OCI registry at startup`. Body: 2-3 lines linking to the spec and noting the new deps.

---

## Task 5: Integration test for `fetch_catalog` with `wiremock`

**Goal:** `cargo test -p tx3-registry-tracker --test discovery` runs in-process (no Zot, no Postgres), exercises the paginated GraphQL path, the allow/deny filter, the profile override, and the empty-catalog error case.

**Files:**
- Modify: `tracker/Cargo.toml`
- Create: `tracker/tests/discovery.rs`
- Create: `tracker/tests/fixtures/orcfax_burn.tii`

**Steps:**

- [ ] **Step 1: Add `wiremock = "0.6"` to `tracker/Cargo.toml` under `[dev-dependencies]`.**
  Verify with `cargo build -p tx3-registry-tracker --tests`.

- [ ] **Step 2: Copy a fixture TII.**
  Copy the existing TII used by `tracker/examples/orcfax-burn/` to `tracker/tests/fixtures/orcfax_burn.tii`. Verbatim. The implementing agent should locate the TII file path inside the example dir (likely produced by `trix build` and committed; if not, take the canonical one from the example's repo). If no committed TII exists, document the gap in a comment at the top of `discovery.rs` integration test and produce a small synthetic but valid TII via `tx3_sdk::tii::spec` types — but prefer the verbatim copy.

- [ ] **Step 3: Test `fetch_catalog_returns_discovered_sources`.**
  Behavior:
  - Spin up a `wiremock::MockServer`.
  - Program `GET /v2/_zot/ext/search` to return a `RepoListWithNewestImage` payload with **two repos** across **two pages** (so the pagination loop runs at least twice). First call returns Page 1 with two repos and `ItemCount == 100` (forcing another round-trip); second call returns Page 2 with zero repos and `ItemCount == 0`. Repos: `txpipe/orcfax-burn:1.0.0` and `txpipe/transfer:1.0.0`.
  - Program `GET /v2/txpipe/orcfax-burn/manifests/1.0.0` and `GET /v2/txpipe/transfer/manifests/1.0.0` to return OCI manifests pointing at a single TII blob each (media type `application/tii+json`, digest computed at test time over the fixture bytes).
  - Program `GET /v2/txpipe/orcfax-burn/blobs/<digest>` and the equivalent for `transfer` to serve the fixture TII bytes.
  - Build an `OciConfig` with `registry_url = mock.uri()` and empty filters. Build a default profile (use whatever profile name the fixture TII actually declares).
  - Call `fetch_catalog(&oci, default_profile).await`. Assert: returned vector has exactly two entries; their `source_name` values are `txpipe/orcfax-burn:1.0.0` and `txpipe/transfer:1.0.0`; their `profile_name` equals the default.

- [ ] **Step 4: Test `fetch_catalog_applies_include_filter`.**
  Same mock setup as Step 3, but the `OciConfig` includes `include_names = ["txpipe/orcfax-burn"]`. Assert: returned vector has length 1; `source_name == "txpipe/orcfax-burn:1.0.0"`.

- [ ] **Step 5: Test `fetch_catalog_applies_profile_override`.**
  Same mock setup, `OciConfig` carries a `profile_override` matching `txpipe/orcfax-burn` with `profile = "preprod"` (any string distinct from the default). Assert: the returned `DiscoveredSource` for orcfax-burn has `profile_name == "preprod"`, while the one for `transfer` keeps the default.

- [ ] **Step 6: Test `fetch_catalog_errors_on_empty_catalog`.**
  Program the mock to return a `RepoListWithNewestImage` with `Results: []`. Assert: `fetch_catalog` returns an `Error::Config` whose `to_string()` contains `"OCI registry returned no protocols"`.

- [ ] **Step 7: Test `fetch_catalog_errors_on_missing_tii_layer`.**
  Program the mock to return a manifest whose layers do not include `application/tii+json` (e.g. only `application/tx3` and `text/markdown`). Assert: returns an `Error::Config` whose message contains `"has no application/tii+json layer"`.

- [ ] **Step 8: Verify the whole integration suite.**
  Run: `cargo test -p tx3-registry-tracker --test discovery`. Expected: all five tests PASS.

- [ ] **Step 9: Commit.**
  Subject: `tracker: add wiremock-based integration test for discovery`. Body: notes the test runs without Zot or Postgres.

---

## Task 6: Update the orcfax-burn example for the new flow

**Goal:** `tracker/examples/orcfax-burn/run.sh` publishes the protocol to the local Zot before launching the tracker. The example is now an end-to-end smoke test for the *publish → discover → track* loop, not just for the tracker leg.

**Files:**
- Modify: `tracker/examples/orcfax-burn/tracker.toml` (already started in Task 1; this task confirms and tightens it)
- Modify: `tracker/examples/orcfax-burn/run.sh`
- Possibly create: `tracker/examples/orcfax-burn/README.md` if missing — note Zot prerequisite.

**Steps:**

- [ ] **Step 1: Confirm the `tracker.toml` edit from Task 1.**
  Open `tracker/examples/orcfax-burn/tracker.toml`. Verify it carries no `[[sources]]`, has `[upstream].profile = "mainnet"`, and `[oci].registry_url = "http://localhost:3000"` with `include_names = ["txpipe/orcfax-burn"]`. Adjust if Task 1 left it inconsistent.

- [ ] **Step 2: Update `run.sh`.**
  Add a `trix publish` invocation (against the local Zot) *before* the `tracker` binary is launched. Preserve the existing `trix build -p mainnet` step that precedes it. The `trix publish` line should not require operator-specific paths — assume `trix` is on `$PATH` and the script is run from its own directory. If the script does not already `set -euo pipefail`, add it.

- [ ] **Step 3: Document the Zot prerequisite.**
  If the example lacks a README, add a short one stating: (a) Zot must be running on `localhost:3000`, (b) `trix` must be on `$PATH`, (c) Postgres must be reachable per `tracker.toml`. If a README exists, append a "Prerequisites" section instead.

- [ ] **Step 4: Smoke-test manually.**
  This step is the only one in the plan that requires real infrastructure: a local Zot (`docker compose -f registry/zot/docker-compose.{arm,amd}.yml up -d`), a Postgres reachable per the example's `tracker.toml`, and a recent `trix` binary. Run `./run.sh` from the example directory; expect the script to publish to Zot, then the tracker to boot, discover the orcfax-burn protocol, and persist at least one row to `matches` (per the historical intersect baked into the example). If Postgres/Zot/`trix` are unavailable, mark this step as skipped in the commit body — CI does not cover this path.

- [ ] **Step 5: Commit.**
  Subject: `tracker: switch orcfax-burn example to publish-then-discover flow`. Body: notes manual smoke-test status (PASS or SKIPPED with reason).

---

## Acceptance criteria for the whole plan

After Task 6, all of the following are simultaneously true. The implementing agent checks them before declaring done.

1. `cargo build -p tx3-registry-tracker` — clean build.
2. `cargo clippy -p tx3-registry-tracker -- -D warnings` — no warnings. *(Reviewer note: the user manages lint locally; do not run lint:fix.)*
3. `cargo test -p tx3-registry-tracker --lib` — all unit tests PASS (Task 3 helpers, Task 4 host-stripping).
4. `cargo test -p tx3-registry-tracker --test discovery` — all five integration tests PASS.
5. `cargo test -p tx3-registry-tracker --test store_idempotency --test cursor_persistence` — PASS if Postgres is up; SKIP otherwise. Behavior must be **unchanged** from `main`.
6. `tracker/tracker.toml.example` contains no `[[sources]]`, contains `[oci]`, contains `[upstream].profile`. It successfully parses through `tracker::config::load`.
7. `tracker/examples/orcfax-burn/tracker.toml` matches the new shape and `run.sh` publishes before launching the tracker.
8. The `matches` table receives rows with `source_name` of the form `scope/name:version` when the tracker runs against the orcfax-burn example.

---

## Out of scope (not in this plan — confirm by absence)

- Polling, SIGHUP, hot-reload of the catalog.
- Authenticated pulls from Zot.
- Multiple simultaneous versions of the same protocol.
- Wildcard / regex allow/deny.
- Backend queries that consume the new `scope/name:version` `source_name`.
- A shared `registry-oci` crate factoring `backend/src/oci.rs` and `tracker/src/discovery.rs` together.

If the implementing agent finds themselves adding any of these, stop and check the spec — the work belongs in a follow-up plan.
