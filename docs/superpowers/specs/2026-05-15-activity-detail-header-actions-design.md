# Activity tab — promote detail navigation actions

## Problem

In the protocol activity tab's transaction detail view, the two primary
navigation/action affordances — *Back to activity* and *View on cexplorer* — sit
as `text-xs` links mixed into the timestamp row of `DetailHeader`. Both feel
small and oddly placed for what they actually do:

- *Back to activity* is the main "leave this detail" affordance and should be
  obvious. Today it reads like metadata.
- *View on cexplorer* is a useful jump-out to a block explorer but gets visually
  flattened against the timestamp.

This is a UI/UX-only change. No data, fetch, or routing logic is affected.

## Goals

- Surface *Back to activity* as a prominent, easy-to-spot navigation control,
  separate from the row of tx metadata.
- Surface *View on cexplorer* as an actionable button-styled control, aligned
  with the header.
- Keep the loading and not-found fallback states consistent with the new layout.

## Non-goals

- No change to `cexplorerUrl()` or how the URL is built.
- No change to polling, fetcher wiring, route loaders, or query params.
- No change to `PartiesSection` or `RawLiftedDetails`.
- No change to the list view, its row links, or its query-string conventions.
- No change to error fallback wording or styling.

## Scope

Single file: `frontend/app/pages/protocol/details/tab/activity.tsx`.

Three components are touched:

1. `DetailView` — adds a back-link row above the header; passes back-link to
   fallback states for consistency.
2. `DetailHeader` — restructures the top row to `flex justify-between` so the
   *View on cexplorer* button sits to the right of the title block; removes
   both old links from the timestamp row.
3. Loading and not-found fallbacks inside `DetailView` — adopt the same back
   link styling so size and placement match.

## Layout spec

### Loaded detail

```
┌─────────────────────────────────────────────────────┐
│ ← Back to activity                                  │
│                                                     │
│ [TxName] v1.0  preprod · slot 12,345  [View on ↗]  │
│ a4f8e9b2c3d1...                                     │
│ 2026-05-14 18:32:11                                 │
│                                                     │
│ <Parties section unchanged>                         │
│ <Raw lifted JSON details unchanged>                 │
└─────────────────────────────────────────────────────┘
```

### Loading and not-found fallbacks

```
┌─────────────────────────────────────────────────────┐
│ ← Back to activity                                  │
│                                                     │
│   ┌─ dashed border box ─────────────────────┐       │
│   │ Loading… / Tx not found                 │       │
│   │ <hash mono>                             │       │
│   └─────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────┘
```

(In the fallback states the back link no longer lives *inside* the dashed box —
it sits above it, same as the loaded state, so the layout is consistent
regardless of whether the detail resolved.)

## Visual / styling decisions

- **Back link**
  - Text: `"← Back to activity"` (replaces `"← back to list"`; matches the tab
    name).
  - Classes: `inline-block text-sm text-zinc-400 hover:text-primary-600`.
  - Spacing: rendered above the header with `mb-6`.
  - It's a `<Link to="?activeTab=activity">`, unchanged target.

- **View on cexplorer button**
  - Text: `"View on cexplorer ↗"` (unchanged).
  - Classes: `inline-flex items-center rounded-md border border-zinc-800 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-900`
    — matches the existing "Load more" button so the page reads as one design.
  - Anchor with `target="_blank" rel="noopener noreferrer"`, unchanged.

- **Header row containing title block + button**
  - Wrapper becomes `flex items-start justify-between gap-3`.
  - Left side: existing `[TxNamePill] v{version} · {protocolName} · {profileName} · slot …` group.
  - Right side: the cexplorer button. On narrow viewports the `flex-wrap`
    behavior should still hold; the button can wrap below if needed.

- **Timestamp row**
  - Reduced to just the `font-mono text-xs text-zinc-500` timestamp. No more
    links mixed in.

## Component changes

### `DetailView({ match, hash, loading })`

- Always render the back link at the top of whatever body branch is chosen
  (loading-without-match, not-found, or loaded). Easiest way: factor a small
  inline `<BackToActivityLink />` (or just a const) and render it as the first
  child of the returned root in all three branches.
- The root element becomes a `<div className="space-y-6">` wrapper so the back
  link + body have consistent spacing in every state.

### `DetailHeader({ match })`

- Top row becomes `flex items-start justify-between gap-3`:
  - Left: existing inline metadata (TxNamePill + version + protocol · profile · slot).
  - Right: the cexplorer button.
- Tx hash row is unchanged.
- Timestamp row loses the two link siblings — keeps only the `<span>` with the
  formatted timestamp.

### Loading / not-found branches

- Each branch returns:
  ```
  <div className="space-y-6">
    <BackToActivityLink />
    <div className="rounded-md border border-dashed border-zinc-800 bg-zinc-950 px-6 py-12 text-center space-y-2">
      …existing inner content minus the old inline back link…
    </div>
  </div>
  ```
- The back link inside the dashed box is removed in both branches (it's now
  above the box).

## Acceptance criteria

- In the loaded state, *Back to activity* is the first thing rendered in the
  detail view, at `text-sm`, with clear separation from the header.
- *View on cexplorer* is rendered as a bordered button (matching the "Load
  more" style) aligned to the right of the title row in the header.
- The timestamp row contains only the timestamp.
- The loading-without-match state shows the same back link, above the dashed
  box, at the same size and styling as the loaded state.
- The not-found state shows the same back link, above the dashed box, at the
  same size and styling.
- No regressions in the list view, no changes to fetcher behavior, no changes
  to the route URL pattern used by back navigation (`?activeTab=activity`).
- TypeScript typechecks cleanly.

## Out of scope (explicit YAGNI)

- Sticky toolbar / scroll-aware header.
- Replacing the back link with a back-arrow icon button or breadcrumbs.
- Restyling parties, JSON viewer, list view rows, or other tabs.
- Adding new explorer providers or a multi-provider dropdown.
- Mobile-specific tuning beyond what `flex-wrap` already gives us.
