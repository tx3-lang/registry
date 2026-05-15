# Activity tab → Postgres via GraphQL backend

**Date:** 2026-05-14
**Branch:** `feat/add-activity-tab`
**Status:** Design approved, pending implementation plan.

## Goal

Migrate the protocol details Activity tab from its current local-SQLite path
(read by the React Router server via Kysely+`better-sqlite3`) to consume the
Postgres database written by the tracker daemon, exposed through the existing
Rust GraphQL backend.

Three concrete outcomes:

1. The protocol details page no longer fetches matches in its main loader; the
   Activity tab fetches its own data lazily on tab activation.
2. The list stays "live" via periodic polling while the tab is visible.
3. The detail view (`?tx=<hash>`) fetches by hash on-demand and is no longer
   limited to the most recent 50 matches.

## Non-goals

- Real-time push (GraphQL subscriptions / SSE). Polling is sufficient.
- Server-side cursor format compatibility with any third party — opaque to clients.
- Read-only Postgres role / row-level security. Future hardening.
- Moving the tab to a nested React Router route. The `?activeTab=activity&tx=...`
  URL scheme stays as-is.
- Replacing the `lib/tracker/lifted.ts` parser. It continues to live client-side
  and parse the `lifted` JSON for `PartyChip` and the raw JSON viewer.

## Current state (pre-change)

- The tracker daemon (Rust, `tracker/`) writes matches into Postgres via `sqlx`,
  one row per `(tx_hash, source_name)`. Schema lives in
  `tracker/migrations/20260511000001_initial.sql`.
- The backend (Rust, `backend/`, `async-graphql` + Rocket) does **not** touch
  Postgres. It only queries the OCI registry (zot).
- The frontend route `routes/protocol.$scope.$name.tsx` calls
  `safeListMatches(protocolName)` against a local `tracker.db` SQLite file via
  Kysely. The 50 most recent matches travel inside the protocol detail loader.
- The Activity tab (`pages/protocol/details/tab/activity.tsx`) receives
  `matches: MatchRow[]` as a prop and resolves the `?tx=<hash>` detail view
  in-memory from that list.

### Known issue with the current filter

`frontend/app/lib/tracker/queries.ts:69` filters by
`protocol_name = params.name`. But the tracker writes `protocol_name =
lifted.protocol_name` (the TII inner protocol name), while `params.name` is
the OCI repo name. They match today only by convention. Two different OCI
repos declaring the same TII inner name would conflate matches.

The new design fixes this by filtering on `(repo_scope, repo_name)` — the
authoritative OCI identity already available in the tracker's
`DiscoveredSource`.

## Architecture

```
            ┌──────────────────────────┐
            │   tracker (daemon Rust)  │
            │   sqlx INSERTs matches   │
            └────────────┬─────────────┘
                         │ writes
                         ▼
              ┌──────────────────────┐
              │   Postgres (matches) │
              └──────────┬───────────┘
                         │ reads (sqlx pool)
                         ▼
    ┌────────────────────────────────────────┐
    │  backend (Rust, async-graphql+Rocket)  │
    │  + module db: PgPool                   │
    │  + queries:                            │
    │     protocolMatches(scope, name, ...)  │
    │     protocolMatch(scope, name, txHash) │
    └────────────────────┬───────────────────┘
                         │ GraphQL
                         ▼
    ┌──────────────────────────────────────────┐
    │ frontend (React Router v7)               │
    │  protocol loader: no matches             │
    │  TabActivity: useFetcher + polling       │
    │  Resource routes /api/protocols/...      │
    └──────────────────────────────────────────┘
```

## Components

### 1. Tracker — schema migration + row population

**New migration** in `tracker/migrations/`, named
`20260514XXXXXX_add_repo_columns.sql` (timestamp picked at impl time):

- Adds `repo_scope TEXT NOT NULL DEFAULT ''`, `repo_name TEXT NOT NULL
  DEFAULT ''`, `repo_version TEXT NOT NULL DEFAULT ''` to `matches`.
- Backfills existing rows by parsing `source_name` (`scope/name:version`)
  with `split_part`.
- Drops the `DEFAULT ''` after backfill so future inserts must specify values.
- Creates a composite index `idx_matches_repo ON matches (repo_scope,
  repo_name, id DESC)` for the list query's filter+sort.

**Row construction** (`tracker/src/process.rs`, `tracker/src/store.rs`):

- `OwnedMatchRow` gains `repo_scope: String`, `repo_name: String`,
  `repo_version: String`.
- `process.rs` populates them from the `DiscoveredSource` (which already
  carries `scope`, `name`, `version` split — see
  `tracker/src/discovery.rs:30-41`).
- `Store::apply_block` writes the three new columns. `source_name` is kept
  for back-compat / readability.
- `protocol_name` (TII inner) stays as informational metadata. Not a filter.

### 2. Backend — Postgres pool + match resolvers

**New file `backend/src/db.rs`:**

- `pub async fn open_pool(database_url: &str) -> Result<PgPool>` —
  `PgPoolOptions::new().max_connections(8)`. Does NOT run migrations (the
  tracker owns the schema).
- `pub struct MatchRow` — plain data: `id: i64`, `tx_hash: Vec<u8>`,
  `repo_scope`, `repo_name`, `repo_version`, `tx_name`, `protocol_name`,
  `profile_name`, `block_slot: i64`, `block_hash: Vec<u8>`, `lifted: String`
  (serialized JSONB read as text), `matched_at: chrono::DateTime<Utc>`. The
  resolver renders `matched_at` to ISO 8601 (`%Y-%m-%dT%H:%M:%SZ`) before
  returning as `String!` in GraphQL.
- `pub async fn fetch_matches(pool, scope, name, version, first, after_id) ->
  Result<(Vec<MatchRow>, bool /* has_next */)>`
  - SQL: `SELECT ... FROM matches WHERE repo_scope=$1 AND repo_name=$2 AND
    ($3::text IS NULL OR repo_version=$3) AND ($4::bigint IS NULL OR id <
    $4) ORDER BY id DESC LIMIT $5+1`.
  - Returns `first` items plus a `has_next` boolean (computed by checking if
    the `+1` row exists).
- `pub async fn fetch_match(pool, scope, name, tx_hash_bytes) ->
  Result<Option<MatchRow>>`
  - SQL: `SELECT ... FROM matches WHERE repo_scope=$1 AND repo_name=$2 AND
    tx_hash=$3 LIMIT 1`.

**New file `backend/src/schema/match_query.rs`** (`match` is a reserved word):

GraphQL types:

```graphql
type Match {
  id: ID!
  txHash: String!         # hex lowercase
  txName: String!
  source: MatchSource!
  profileName: String!
  protocolName: String!   # TII inner; informational
  blockSlot: String!      # u64 → String to avoid GraphQL Int truncation
  blockHash: String!      # hex
  matchedAt: String!      # ISO 8601 UTC, e.g. "2026-05-14T10:23:45Z"
  lifted: String!         # JSON serialized
}

type MatchSource {
  scope: String!
  name: String!
  version: String!
}

type MatchConnection {
  pageInfo: PageInfo!
  edges: [MatchEdge!]!
  nodes: [Match!]!
}

type MatchEdge {
  node: Match!
  cursor: String!         # opaque base64
}

extend type Query {
  protocolMatches(
    scope: String!
    name: String!
    version: String        # optional; null = all versions
    first: Int = 50
    after: String          # cursor
  ): MatchConnection!

  protocolMatch(
    scope: String!
    name: String!
    txHash: String!
  ): Match
}
```

Cursor encoding: `base64(b"id:<row_id>")`. Decoded server-side; malformed →
GraphQL error.

`txHash` validation: must match `^[0-9a-fA-F]+$` and have even length.
Malformed → GraphQL error.

Schema regeneration: `backend/schema.graphql` updated by the existing
`build_schema()` side-effect (writes file in `backend/src/schema/mod.rs`).
The updated SDL is committed.

**Wiring (`backend/src/main.rs`):**

- Read `DATABASE_URL` at boot. Required. Panic / exit on missing.
- Call `db::open_pool(...).await` and `.manage(pool)` on the Rocket builder.
- Resolvers obtain the pool via `ctx.data::<PgPool>()`.

**Cargo deps added:**

- `sqlx = { version = "0.8", features = ["runtime-tokio", "tls-rustls",
  "postgres", "chrono", "macros"] }` (align with tracker version).
- `base64 = "0.22"`.

**Error mapping:**

| Case | Response |
|---|---|
| Invalid `txHash` or `cursor` | `errors[]` with explanatory message |
| Match not found (`protocolMatch`) | `data.protocolMatch = null`, no error |
| Postgres unavailable / pool timeout | `errors[]` with "database unavailable" |

### 3. Frontend — resource routes + polling hook

**Removed:**

- `frontend/app/lib/tracker/db.ts`.
- `frontend/app/lib/tracker/queries.ts`.
- `safeListMatches`, `createTrackerDb` imports and the `matches` field of
  the loader return in `routes/protocol.$scope.$name.tsx`.
- The `matches` prop on `pages/protocol/details/index.tsx` and on
  `pages/protocol/details/tab/activity.tsx`.
- Dependencies: `better-sqlite3`, `kysely`, `@types/better-sqlite3`. Remove
  `pnpm.onlyBuiltDependencies.better-sqlite3`.
- Env var `TRACKER_DB_PATH` (no longer referenced).

**Kept:**

- `frontend/app/lib/tracker/lifted.ts` — parses `lifted` JSON into
  `LiftedParty` shape; consumed by `PartyChip` and the JSON viewer.

**Added:**

- `frontend/app/gql/matches.query.ts` — `LIST_MATCHES_QUERY`,
  `MATCH_BY_HASH_QUERY`, key generators. Same shape as
  `protocols.query.ts`.
- `frontend/app/routes/api.protocols.$scope.$name.matches.tsx` — resource
  route. `loader`:
  - Reads `first` (default 50, clamp [1, 200]) and `after` from search params.
  - Calls `requestGraphQL(LIST_MATCHES_QUERY, ...)` server-side.
  - Returns `{ matches: Match[], pageInfo: { hasNextPage, endCursor } }`.
- `frontend/app/routes/api.protocols.$scope.$name.matches.$txHash.tsx` —
  resource route. `loader`:
  - Validates `txHash` against `^[0-9a-fA-F]+$` and even length; if invalid,
    returns 400.
  - Calls `requestGraphQL(MATCH_BY_HASH_QUERY, ...)` server-side.
  - Returns `{ match: Match | null }`.
- `frontend/app/hooks/useFetcherPolling.ts` — generic hook around
  `useFetcher`:
  - `fetcher.load(url)` on mount.
  - `setInterval(load, intervalMs)` while document is visible.
  - `visibilitychange` listener pauses interval when hidden; refetches on
    visible-again.
  - Cleanup on unmount and on `url`/`key` change.

**Rewired `pages/protocol/details/tab/activity.tsx`:**

The UI (list table, `PartyChip`, `TxNamePill`, raw JSON viewer, empty state,
"Tx not found") stays essentially the same. The data wiring changes:

```ts
function TabActivity({ protocol }: Props) {
  const [searchParams] = useSearchParams();
  const selectedHash = searchParams.get('tx');
  const { scope, name } = protocol;

  const listUrl = `/api/protocols/${scope}/${name}/matches`;
  const list = useFetcherPolling<ListResp>({
    key: `activity-list:${scope}/${name}`,
    url: listUrl,
    intervalMs: 12_000,
  });

  const [firstPage, setFirstPage]   = useState<Match[]>([]);
  const [extraPages, setExtraPages] = useState<Match[]>([]);
  const [hasNext, setHasNext]       = useState(false);

  // sync list.data into firstPage (latest result wins) and hasNext.
  // append "load more" results into extraPages.
  // dedupe by id when concatenating for render.

  const detail = useFetcher<DetailResp>({ key: 'activity-detail' });
  useEffect(() => {
    if (selectedHash) detail.load(`${listUrl}/${selectedHash}`);
  }, [selectedHash, listUrl]);

  return selectedHash
    ? <DetailView match={detail.data?.match ?? null} hash={selectedHash} loading={detail.state !== 'idle'} />
    : <ListView matches={dedupeById([...firstPage, ...extraPages])} hasNext={hasNext} onLoadMore={...} />;
}
```

The detail view stops reading from `matches.find(...)` and consumes the
detail fetcher's result.

**Pagination behavior:**

- Initial fetch loads 50 newest. Polling refreshes that first page.
- "Load more" appends additional pages using `?after=<cursor>` (cursor =
  the encoded id of the oldest item currently in the list).
- Render = `dedupeById([...firstPage, ...extraPages])`. Dedup is defensive;
  the cursor logic should prevent overlap, but polling overlapping with a
  fresh load-more could theoretically introduce duplicates.

**Edge cases:**

- If more than 50 new matches arrive between polls, `firstPage` shifts
  entirely and there is a gap with `extraPages`. Documented but not solved
  in v1.
- `?tx=<hash>` for a hash not in the recent list still works (separate
  detail fetch). This is an explicit improvement over the current behavior.
- `?tx=<malformed>` → resource route returns 400 → `DetailView` falls into
  the "Tx not found" branch.

### 4. URLs — what changes for the user

| URL | Before | After |
|---|---|---|
| `/protocol/$scope/$name` | Loader brings 50 matches inline. | Loader brings no matches; detail page renders without waiting on Postgres. |
| `?activeTab=activity` | Reads from prop. | Triggers `useFetcherPolling`; first fetch happens after tab mount. |
| `?activeTab=activity&tx=<hash>` | Looks `hash` up in the in-memory 50. | Fires a separate `detail` fetcher to fetch by hash; works for any historical hash. |

No URL contract changes for the user.

## Configuration

| Component | Env var | Required | Notes |
|---|---|---|---|
| Backend | `DATABASE_URL` | Yes | Postgres URL of the tracker DB. Backend fails fast at boot if missing. |
| Frontend (RR server) | `TRACKER_DB_PATH` | — | Removed. |
| Frontend (RR server) | `API_ENDPOINT` | Yes (existing) | Unchanged. Points to backend GraphQL. |

## Testing

### Tracker

- Extend existing `#[sqlx::test(migrations = "./migrations")]` tests to
  verify that `OwnedMatchRow` round-trips `repo_scope`, `repo_name`,
  `repo_version`.
- Backfill correctness: a row inserted under the old schema (manually,
  pre-migration) is parsed correctly into the new columns. Optional but
  recommended.

### Backend

- `#[sqlx::test]` integration tests with ephemeral Postgres:
  - Insert N synthetic matches across multiple `(scope, name, version)`.
  - `protocolMatches(scope, name)` returns only matching rows, newest-first.
  - Pagination with cursor: first page + second page = the full set; no
    duplicates, no gaps.
  - `version` filter narrows correctly.
  - `protocolMatch(scope, name, txHash)` returns the right row; non-existent
    hash returns `null`.
  - Invalid `txHash` returns GraphQL error.
  - Invalid `cursor` returns GraphQL error.
- Unit test: cursor encode/decode round-trip, including malformed input
  rejection.

### Frontend

- Resource route loaders: unit tests mocking `requestGraphQL`, verifying
  variable passing and error mapping (especially the 400 for invalid
  `txHash`).
- `useFetcherPolling` hook: tests with a mocked `useFetcher`, verifying:
  - Initial load fires.
  - Interval triggers reloads.
  - `visibilitychange` to `hidden` pauses the interval; `visible` resumes
    and fires immediately.
  - Unmount clears intervals and listeners.
- `TabActivity` component (RTL):
  - Initial list renders after fetcher resolves.
  - Polling updates first page.
  - "Load more" appends and disables when `hasNext` is false.
  - Selecting `?tx=<hash>` triggers detail fetch; "Tx not found" shows on
    null.

### Non-functional

- `pnpm run typecheck` passes.
- `cargo build` (workspace) passes.
- `cargo test -p tx3-registry-tracker` and `cargo test -p
  tx3-registry-backend` pass.
- `backend/schema.graphql` regenerated and committed.

## Acceptance criteria

Functional:

- [ ] Protocol detail loader no longer queries `matches`. Detail page load
  time is no worse than before.
- [ ] Activity tab fetches its own data on activation. Default 50 most-recent
  rows.
- [ ] The list returns only matches for the URL's `(scope, name)`, filtered
  by `repo_scope` / `repo_name`. The TII inner-name conflation bug is fixed.
- [ ] Each list row shows the source version.
- [ ] "Load more" button paginates backwards using cursor; disabled when
  `hasNextPage === false`.
- [ ] While the tab is visible, the list refreshes ~every 12s. Polling
  pauses when the page is hidden; resumes (with an immediate refetch) on
  visibility-regain.
- [ ] Clicking a row navigates to `?activeTab=activity&tx=<hash>` and renders
  the detail using a fresh per-hash fetch (not in-memory list lookup).
- [ ] `?tx=<hash>` for a hash older than the most recent 50 still renders
  the detail correctly.
- [ ] `?tx=<hash>` for a non-existent hash renders "Tx not found".

Non-functional:

- [ ] `pnpm run typecheck` passes.
- [ ] `cargo build` and tracker + backend test suites pass.
- [ ] `backend/schema.graphql` reflects the new types and is committed.
- [ ] `better-sqlite3` and `kysely` are absent from `package.json`.
- [ ] Single PR shipped from `feat/add-activity-tab` to `main`.

## Out of scope (future work)

- GraphQL subscriptions / SSE for live push.
- Read-only Postgres role for the backend.
- Read-through cache (e.g., in-memory LRU) for very hot protocols.
- Version filter UI control on the Activity tab.
- Nested route migration (`/protocol/:scope/:name/activity`).
- Server-side aggregation (counts per profile, time-series rollups, etc.).
