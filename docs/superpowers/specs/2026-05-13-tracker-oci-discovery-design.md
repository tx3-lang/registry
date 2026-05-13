# Tracker OCI discovery — design

Status: drafted (2026-05-13)
Scope: replace the tracker's local `[[sources]]` / `tii_path` model with
auto-discovery of protocols and TIIs from the Zot OCI registry. Phase 1
of the auto-discovery work explicitly deferred by the original tracker
design (`2026-05-11-tracker-daemon-design.md`, "Out of scope").

## Motivation

Protocols are published to Zot via `trix publish` (see
[`trix publish command`](https://github.com/tx3-lang/trix/blob/main/src/commands/publish.rs)). Each protocol is pushed as an OCI
image tagged `scope/name:version`, with layers for the protocol source
(`application/tx3`), the TII (`application/tii+json`), and an optional
README (`text/markdown`). The registry's `backend/` already consumes
this exact data via `backend/src/oci.rs` to serve GraphQL queries.

The tracker today reads each TII from disk via a `[[sources]]` block
with a `tii_path`. That coupling forces operators to maintain a local
copy of every TII the tracker should match against, in lockstep with
whatever is published to Zot. It also breaks the "publish once, observe
everywhere" promise of the registry.

This change makes the tracker pull its catalog of protocols and TIIs
directly from Zot at startup, mirroring the pattern the backend already
uses.

## Decisions (recap)

- Auto-discovery with allow/deny filters by `scope` and `scope/name`.
- A single `[upstream].profile` applies to every discovered protocol,
  with optional per-protocol overrides.
- The tracker tracks the **newest tag** per protocol (same notion of
  newest as `backend/src/schema/protocol/query.rs`).
- The catalog is fetched **once at startup**. No polling, no SIGHUP.
- If Zot is unreachable, returns an empty catalog, or every protocol is
  filtered out, the tracker **fails fast and exits**. The supervisor
  (kubelet / systemd) decides on retry.
- `source_name` in the `matches` table becomes `scope/name:version`.
- Auth is **anonymous**, same as `backend/src/oci.rs`.
- Implementation mirrors `backend/src/oci.rs`: GraphQL extension
  (`/_zot/ext/search`) + `oci-client` pulls, in a new `discovery.rs`
  module inside the tracker. No shared crate yet.

## Repo layout

```
registry/tracker/
├── src/
│   ├── config.rs           (modified)
│   ├── discovery.rs        new
│   ├── error.rs            (modified)
│   ├── lib.rs              (modified)
│   ├── main.rs             (unchanged)
│   ├── process.rs          (unchanged)
│   ├── specialization.rs   (modified)
│   ├── store.rs            (unchanged)
│   └── upstream/           (unchanged)
├── tests/
│   ├── cursor_persistence.rs  (unchanged)
│   ├── store_idempotency.rs   (unchanged)
│   ├── discovery.rs           new
│   └── fixtures/
│       └── orcfax_burn.tii    new (copied from examples/)
├── examples/orcfax-burn/    (modified — tracker.toml + run.sh)
└── tracker.toml.example     (modified)
```

## Config schema

```toml
[upstream]
endpoint  = "https://preview.utxorpc-v0.demeter.run"
profile   = "preview"            # applied to every discovered TII
# api_key = "dmtr_..."
intersect = "tip"

[upstream.filter]
# unchanged from phase 1: server-side WatchTx pre-filter
addresses = []

[storage]
database_url = "postgres://tracker:tracker@localhost:5432/tracker"

[oci]
registry_url = "http://localhost:3000"   # zot base URL

# Allow/deny — semantics:
# - If `include_scopes` and `include_names` are BOTH empty: allow every repo.
# - Otherwise: allow only repos matching at least one include entry.
# - `exclude_*` is applied after includes; exclude wins on conflict.
# - `include_names` / `exclude_names` are exact "scope/name" strings, no tag.
# - No wildcards / regex in this phase.
include_scopes = []
include_names  = []
exclude_scopes = []
exclude_names  = []

# Optional per-protocol profile overrides. Empty by default.
# Matched on exact "scope/name". First match wins.
[[oci.profile_override]]
match   = "txpipe/orcfax-burn"
profile = "mainnet"
```

Config behavior:

- `OCI_REGISTRY_URL` env var, if set, overrides `[oci].registry_url` at
  startup. Mirrors the `DATABASE_URL` override added in phase 1 for
  cluster deploys.
- `[[sources]]` and `tii_path` are **removed** from the config schema.
  A `tracker.toml` that still contains them fails to parse (loud break
  on stale config files).
- `[upstream].profile` is required. Missing it is a config error at
  startup.

## Architecture

### Data flow at startup

```
config::load ──▶ discovery::fetch_catalog ──▶ specialization::specialize_all ──▶ matcher loop
                       │                              │
                       ├─ GraphQL: RepoListWithNewestImage
                       ├─ apply_filters (allow/deny)
                       ├─ oci-client.pull per surviving repo
                       ├─ extract application/tii+json layer → TiiFile
                       └─ resolve_profile per repo (default or override)
```

### Module boundaries

- `config.rs` — pure TOML decoding + env overrides. No knowledge of OCI
  or HTTP. Exposes `OciConfig`, `ProfileOverride`, the new `profile`
  field on `UpstreamConfig`.
- `discovery.rs` — owns *all* talk to Zot. Exposes one async function
  (`fetch_catalog`) and one struct (`DiscoveredSource`). Private helpers
  for paginated GraphQL, filter application, profile resolution, image
  pull. The filter and profile-resolution helpers are pure and unit-tested
  in-file.
- `specialization.rs` — switches from `SourceConfig` to
  `DiscoveredSource`. Drops the `read_to_string(tii_path)` line; the TII
  arrives already-decoded.
- `lib.rs::run` — three new lines (load OCI URL override, call
  `fetch_catalog`, pass result to `specialize_all`). Everything after
  specialization is unchanged.
- `error.rs` — two new variants (`OciRegistry`, `ZotHttp`).

## `discovery.rs` API

```rust
use tx3_sdk::tii::spec::TiiFile;

use crate::config::OciConfig;
use crate::error::Result;

/// One discovered protocol, ready to be specialized.
#[derive(Debug, Clone)]
pub struct DiscoveredSource {
    /// `scope/name:version` — also stored as `source_name` per match.
    pub source_name: String,
    pub scope: String,
    pub name: String,
    pub version: String,
    pub tii: TiiFile,
    pub profile_name: String,
}

/// Query Zot, apply filters, fetch each protocol's TII layer, resolve
/// the profile name. Returns the full catalog of protocols the tracker
/// should match against. Errors if the registry is unreachable, the
/// catalog is empty, every protocol is filtered out, or any individual
/// protocol fails to pull / decode.
pub async fn fetch_catalog(
    oci: &OciConfig,
    default_profile: &str,
) -> Result<Vec<DiscoveredSource>>;
```

Internal helpers (private; not part of the public surface):

- `query_repo_list(client, registry_url) -> Vec<RepoSummary>` —
  paginated `RepoListWithNewestImage` GraphQL query against
  `<registry>/v2/_zot/ext/search`. Page size 100; loops until
  `Page.item_count < 100`. The GraphQL request asks only for
  `Name` and `NewestImage { Tag Vendor }`.
- `apply_filters(repos: Vec<RepoSummary>, oci: &OciConfig) -> Vec<RepoSummary>` —
  pure. Allow/deny semantics from the config schema section above.
- `pull_tii(client, registry_host, scope, name, version) -> TiiFile` —
  uses `oci_client::Client::pull(reference, Anonymous, [TII_MEDIA_TYPE])`
  then `serde_json::from_slice` on the matching layer. Errors if no
  layer with media type `application/tii+json` is present.
- `resolve_profile(scope, name, oci, default) -> String` — pure. Walks
  `oci.profile_override`, returns the first `match == "scope/name"`, or
  `default` if no override matches.

GraphQL query body (sent URL-encoded as the `query` param to
`/v2/_zot/ext/search`):

```graphql
query Catalog($limit: Int!, $offset: Int!) {
  RepoListWithNewestImage(requestedPage: { limit: $limit, offset: $offset }) {
    Page { TotalCount ItemCount }
    Results {
      Name
      NewestImage { Tag Vendor }
    }
  }
}
```

Pulling: an `oci_client::Reference` of the form
`<registry_host>/<scope>/<name>:<version>`. `registry_host` is extracted
from `registry_url` by stripping the scheme, matching
`backend::oci::get_oci_image`. Scheme drives `ClientProtocol::Http` vs
`ClientProtocol::Https`, again matching backend behavior.

## `specialization.rs` change

The public surface becomes:

```rust
pub fn specialize_all(sources: &[DiscoveredSource]) -> Result<Vec<SpecializedTii>>;
```

`specialize_one`:

- Stops opening `tii_path` and stops calling `serde_json::from_str`.
- Reads `src.tii` (already a `TiiFile`) directly.
- Uses `src.profile_name` instead of `src.profile`.
- Sets `SpecializedTii.name = src.source_name` (the
  `scope/name:version` string). This is the value `process::apply_tx`
  writes into `matches.source_name` via `OwnedMatchRow`.

All other behavior — fingerprint extraction, profile lookup, the
"source has no transactions in its TII" error — is preserved.

## `lib.rs::run` change

```rust
let cfg = config::load(&config_path)?;
let store = store::Store::open(&cfg.storage.database_url).await?;

let discovered = discovery::fetch_catalog(&cfg.oci, &cfg.upstream.profile).await?;
let specialized = specialization::specialize_all(&discovered)?;
info!(sources = specialized.len(), "specialized discovered sources");
// ... rest of the function unchanged
```

The startup log line is adjusted from "specialized sources" to
"specialized discovered sources" so log readers can tell at a glance
which mode the daemon was started in (post-migration there is only one
mode, but the distinction is useful while operators still run mixed
versions in the cluster).

## Errors

`error.rs` adds:

```rust
#[error("oci registry: {0}")]
OciRegistry(#[from] oci_client::errors::OciDistributionError),

#[error("zot http: {0}")]
ZotHttp(#[from] reqwest::Error),
```

`reqwest` is added to `[dependencies]` with `features = ["json"]` —
same set as `backend/Cargo.toml`.

Catalog-related failures stay as `Error::Config(...)` so they appear
alongside other config validation failures:

- `"OCI registry returned no protocols (catalog empty or all filtered out)"`
- `"protocol {scope}/{name}:{version} has no transactions for profile {profile}"`

The second message reuses the same wording shape as the existing
`source {:?} has no transactions in its TII` error, with the
fully-qualified source name (matches the new `source_name` format).

## Tests

Three layers.

### Unit tests in `discovery.rs`

In-file `#[cfg(test)] mod tests`. No network, no Postgres.

- `apply_filters`:
  - empty includes + empty excludes → identity.
  - include_scopes only → keeps matches, drops the rest.
  - include_names only → same shape.
  - both include lists populated → union.
  - exclude wins over include on conflict.
- `resolve_profile`:
  - no overrides → returns the default.
  - first-match-wins ordering.
  - non-matching override → still returns default.

### Integration test `tests/discovery.rs`

`wiremock = "0.6"` as a `[dev-dependencies]` entry. The test:

1. Spins up a `MockServer`.
2. Programs `POST /v2/_zot/ext/search` to return a two-repo
   `RepoListWithNewestImage` payload across two pages (forces the
   pagination loop to execute at least one extra round-trip).
3. Programs `GET /v2/<repo>/manifests/<tag>` and
   `GET /v2/<repo>/blobs/<digest>` to serve a manifest pointing at a
   fixture `application/tii+json` blob. The fixture TII is a real,
   minimal one copied to `tests/fixtures/`.
4. Invokes `fetch_catalog` against the mock URL.
5. Asserts on the returned `Vec<DiscoveredSource>`:
   - count matches the expected post-filter set,
   - `source_name` is `scope/name:version` for each,
   - `profile_name` is the default in the no-override case, and the
     override value in a separately-configured case.

A second test case configures `include_names` so the filter drops both
repos and asserts that `fetch_catalog` returns the
`OCI registry returned no protocols` error.

The integration test does not need Postgres, so it is safe to run
unconditionally — the existing `tracker.yml` Postgres sidecar continues
to serve `store_idempotency.rs` and `cursor_persistence.rs`.

### Fixture

`tests/fixtures/orcfax_burn.tii` — copied from the
`examples/orcfax-burn/` payload that already lives in the repo. Reused
verbatim. If the example's TII ever changes shape, the fixture is
updated in the same commit so the test stays representative.

## Example update — `examples/orcfax-burn`

The example moves from "TII on disk" to "TII fetched from a local Zot":

- `tracker.toml`:
  - drops `[[sources]]`,
  - adds `[oci] registry_url = "http://localhost:3000"`,
  - adds `[upstream].profile = "mainnet"` (the example's profile),
  - adds `include_names = ["txpipe/orcfax-burn"]` so the example does
    not depend on whatever else is in the local Zot.
- `run.sh`:
  - before launching the tracker, runs `trix publish` against the
    local Zot so the example is self-contained.
  - the rest (`trix build -p mainnet`, the historical `intersect`) is
    unchanged.

This keeps the example useful as a manual smoke test for the *whole*
publish → discover → track pipeline, not just the tracker leg.

## Migration plan

One commit per step. Each step is independently verifiable. The crate
goes briefly red (build-only) between steps 1 and 4; this is acceptable
because the intermediate states are not landed on `main` — they exist
only as a chain of commits inside the PR.

1. **Strip `[[sources]]` from config.** Remove `SourceConfig`, add
   `profile` to `UpstreamConfig`, add `OciConfig` + `ProfileOverride`.
   Update `tracker.toml.example` and the example's `tracker.toml`. The
   crate stops compiling — `lib.rs` and `specialization.rs` still
   reference the deleted type. That is intentional and resolved by
   step 2.
2. **Introduce `DiscoveredSource` in `specialization.rs`.** Change
   `specialize_all` and `specialize_one` to consume it. Read `src.tii`
   in memory, drop the file IO. Still uncompilable — `lib.rs` is the
   last caller.
3. **Create `discovery.rs` (pure helpers + unit tests).** Define
   `DiscoveredSource` (or re-export from `specialization.rs`),
   implement `apply_filters` and `resolve_profile` with their unit
   tests. The module compiles, tests pass.
4. **Finish `discovery::fetch_catalog`** (GraphQL + `oci-client` pull),
   add `reqwest` to `[dependencies]`, add `OciRegistry` / `ZotHttp` to
   `error.rs`. Wire it into `lib.rs::run` with the `OCI_REGISTRY_URL`
   env override in `config::load`. The crate is green again; the
   binary boots end-to-end against a real Zot.
5. **Integration test `tests/discovery.rs`** with `wiremock`. Add
   `wiremock` to `[dev-dependencies]`. Copy fixture TII to
   `tests/fixtures/`. Cover pagination, allow/deny, profile override,
   and the empty-catalog error path.
6. **Update the `orcfax-burn` example** — `tracker.toml` switches to
   `[oci]`, `run.sh` calls `trix publish` first.
7. **No CI changes needed.** The existing `tracker.yml` Postgres
   sidecar continues to serve the store tests; the new discovery test
   is fully in-process via `wiremock`.

## Risks

- **Zot schema drift.** Field names like `Results`, `NewestImage`,
  `Tag`, `Vendor` are Zot-extension-specific and can change between Zot
  versions. The integration test pins us to a snapshot, but a real Zot
  upgrade in production could surface a mismatch the test does not
  catch. Mitigation: the docker-compose for Zot pins a specific image
  tag (already the case for `zot/docker-compose.*.yml`).
- **`oci_client` and the backend share a registry view but not a
  type.** `backend/src/oci.rs` and `tracker/src/discovery.rs` will end
  up with duplicate `ZotResponse`-like structs. This is a deliberate
  trade-off (Approach A): one duplicated 50-LOC file is cheaper than
  introducing a workspace crate today. If a third consumer arrives, or
  if the duplication starts to drift, the next step is a small
  `registry-oci` crate consumed by both.
- **`source_name` change is observable in Postgres.** Existing rows
  (if any) have `source_name = "transfer-preprod"`-style strings;
  post-migration rows will be `txpipe/transfer:1.0.0`-style. The
  `UNIQUE(tx_hash, source_name)` constraint stays satisfied since the
  whole second component changes shape consistently. Backend consumers
  reading the table (out of scope here, see
  `2026-05-11-tracker-daemon-design.md`) will need to handle both
  shapes if they predate the migration, or accept that the table is
  wiped on cutover.

## Out of scope (this phase)

- Polling / SIGHUP / hot-reload of the catalog.
- Authenticated pulls from Zot.
- Simultaneous tracking of multiple versions of the same protocol.
- Wildcards or regex in allow/deny.
- Backend GraphQL queries reading `matches` with the new versioned
  `source_name`.
- A `registry-oci` shared crate factoring `backend/src/oci.rs` and
  `tracker/src/discovery.rs` together — postponed until a third
  consumer or actual drift.
