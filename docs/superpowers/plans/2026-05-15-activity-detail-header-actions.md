# Activity detail header actions — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Promote *Back to activity* and *View on cexplorer* in the activity tab's detail view so they read as primary affordances instead of timestamp-row metadata. UI-only.

**Spec:** `docs/superpowers/specs/2026-05-15-activity-detail-header-actions-design.md` (read this before starting — it carries the layout diagrams, class strings, and out-of-scope list).

**Architecture:** Single-file change inside `frontend/app/pages/protocol/details/tab/activity.tsx`. Splits into two logical commits: (1) hoist a shared back link above the body in `DetailView`'s three render branches; (2) restructure `DetailHeader` so *View on cexplorer* becomes a bordered button on the right of the title row and the timestamp row keeps only the timestamp.

**Tech Stack:** React 19, React Router 7, Tailwind utility classes (zinc / primary palette already in use in this file). No tests to add — the frontend has no test runner; verification is `pnpm typecheck` plus manual browser check.

**Constraints from user memory:**
- Plans describe specs/tests/criterios — the agent writes the code (no implementation snippets here).
- Do NOT run `pnpm lint` / `pnpm lint:fix`. `pnpm typecheck` is fine.

---

## File Structure

Files modified:

- `frontend/app/pages/protocol/details/tab/activity.tsx` — only this file. Three functions touched:
  - `DetailView` (current: lines ~298–332) — gains a shared back-link affordance rendered at the top of all three render branches (loading-without-match, not-found, loaded). Root wrapping element is normalized so spacing is consistent.
  - `DetailHeader` (current: lines ~334–364) — top row becomes a `flex justify-between` row with the title block on the left and the *View on cexplorer* button on the right. The timestamp row is reduced to just the timestamp.
  - The two fallback render branches inside `DetailView` (current: lines ~299–309 and ~311–321) — drop the back-link line that today sits *inside* the dashed box.

No new files. No new components extracted to other files (a local back-link element/constant inside `activity.tsx` is fine; do not create a new module).

Files NOT touched:
- `MatchRowItem`, `ListView`, `EmptyState`, `LoadingSkeleton`, `PartiesSection`, `RawLiftedDetails`, `cexplorerUrl`, `jsonStyles`.
- Any sibling tab, route loader, GraphQL doc, or backend file.

---

## Task 1: Hoist *Back to activity* above the body in all three `DetailView` branches

**Files:**
- Modify: `frontend/app/pages/protocol/details/tab/activity.tsx`, function `DetailView` (~298–332)

**What to change:**
- Introduce one shared back-link element local to this file (inline JSX element, or a tiny local component — pick whatever reads cleanest; do not export it).
- Render the back link as the first child of `DetailView`'s returned tree in **all three** branches: loading-without-match, not-found, and loaded.
- Wrap each branch's return in an element that gives consistent vertical rhythm between the back link and the body (the spec calls for `space-y-6` on the wrapper).
- Remove the existing inline `← back to list` links from inside the dashed-box fallbacks (the link no longer lives inside the dashed box — it sits above it).
- Wording: `← Back to activity` (replaces today's `← back to list`).
- Styling and target per spec §"Visual / styling decisions" → "Back link".

**Out of scope for this task:**
- Do not touch `DetailHeader` yet. The old `← back to list` link that's *inside* `DetailHeader`'s timestamp row stays in place for now; it will be removed in Task 2.
- Do not touch the *View on cexplorer* link yet.

**Acceptance criteria:**
- In the loaded state, *Back to activity* is the first visible element of the detail view, above `DetailHeader`, at `text-sm` with the styling from the spec.
- In the loading-without-match state, the same back link sits above the dashed box. The dashed box no longer contains a back link.
- In the not-found state, the same back link sits above the dashed box. The dashed box no longer contains a back link.
- All three branches use the same wrapper class so visual spacing is identical between states.
- Back link target is unchanged: `?activeTab=activity`.
- TypeScript: `pnpm --filter frontend typecheck` (or `pnpm typecheck` from `frontend/`) passes with no new errors.

**Verification:**
- `pnpm typecheck` from `frontend/` — must pass.
- Manual browser check, with the dev server running:
  1. Open a protocol's Activity tab, click a row to enter detail. *Back to activity* should be the first visible element of the detail panel and clearly read as a navigation control (larger and higher up than today).
  2. Reload the URL with `?activeTab=activity&tx=<unknown-hash>` (or visit a tx the tracker hasn't seen). The not-found state should show *Back to activity* above the dashed box.
  3. While the detail is loading (throttle network in DevTools to provoke this), the loading state should also show *Back to activity* above the dashed box.
- Clicking *Back to activity* in each state returns to the activity list and resumes polling.

**Commit:**
- Subject suggestion: `feat(frontend): hoist 'Back to activity' above tx detail`
- Stage only this file.

---

## Task 2: Restructure `DetailHeader` — cexplorer button on the right, clean timestamp row

**Files:**
- Modify: `frontend/app/pages/protocol/details/tab/activity.tsx`, function `DetailHeader` (~334–364)

**What to change:**
- Change the top row of `DetailHeader` from a single `flex items-center gap-3` line into a `flex items-start justify-between gap-3` row:
  - **Left:** the existing title block — `TxNamePill` + `v{version}` + `{protocolName} · {profileName} · slot …`. Keep contents as-is; only the wrapping changes.
  - **Right:** the *View on cexplorer ↗* anchor, restyled as a bordered button matching the existing "Load more" pattern in `ListView`. Exact classes and `target` / `rel` attributes are in spec §"View on cexplorer button".
- Reduce the timestamp row to only the timestamp `<span>`. Remove:
  - The `← back to list` `<Link>` inside this row (already replaced by the hoisted link from Task 1).
  - The `View on cexplorer ↗` anchor inside this row (now lives in the header's right slot).
- Tx hash row (the `font-mono text-sm break-all text-zinc-50` line) is unchanged.

**Out of scope for this task:**
- No changes to `cexplorerUrl()`.
- No new explorer providers.
- No mobile-specific media queries beyond relying on the row's `flex-wrap`-friendly layout.

**Acceptance criteria:**
- *View on cexplorer ↗* is rendered as a bordered button (same visual family as the *Load more* button at activity.tsx:226–233) aligned to the right of the title row.
- The header's title block (TxNamePill + version + protocol/profile/slot text) stays grouped together on the left.
- The timestamp row contains only the formatted timestamp `<span>`; no links remain in it.
- The `target="_blank"` and `rel="noopener noreferrer"` attributes are preserved on the explorer anchor.
- On narrow viewports (≤ ~640px wide), the button wraps below the title block rather than overflowing — `justify-between` on a flex container with no `flex-nowrap` is enough; verify in browser at a narrow width.
- TypeScript: `pnpm typecheck` from `frontend/` passes.

**Verification:**
- `pnpm typecheck` from `frontend/` — must pass.
- Manual browser check, with dev server running:
  1. On a tx detail page, the cexplorer button reads as an actionable button (bordered, hover background change) and sits on the right of the title row.
  2. Hover on the button matches the *Load more* button's hover behavior visually.
  3. Click *View on cexplorer ↗* — opens cexplorer (with `preview.` / `preprod.` subdomain for those profiles, mainnet for `mainnet`) in a new tab. URL is identical to before.
  4. Resize the browser narrow enough that the title block + button would overlap — the button wraps to the next line rather than overflowing.
  5. The timestamp row has only the timestamp, no inline links anywhere on the page.
- Combined check with Task 1: the *only* back affordance on the page is the hoisted one from Task 1; *View on cexplorer* appears exactly once, in the header's right slot.

**Commit:**
- Subject suggestion: `feat(frontend): promote cexplorer link to header button`
- Stage only this file.

---

## Cross-task acceptance (post-Task 2)

Both tasks together must satisfy the spec's "Acceptance criteria" section in full:
- *Back to activity* is the first visible element in all three render states of `DetailView`.
- *View on cexplorer* is a bordered button on the right of the header title row.
- The timestamp row is just the timestamp.
- No regressions in the activity list, no fetcher/polling behavior changes, back navigation still uses `?activeTab=activity`.
- `pnpm typecheck` clean.

If the executing agent notices that splitting into two commits creates a momentarily-inconsistent intermediate state (it will: after Task 1 there will be two back links on screen briefly, the hoisted one and the original inside `DetailHeader`'s timestamp row), that's expected — Task 2 removes the duplicate. Do not skip Task 1's commit just to avoid this; the two-commit history is intentional for reviewability.

---

## Self-review notes

- **Spec coverage:** Every bullet in the spec's "Acceptance criteria" maps to either Task 1 or Task 2 (back link → T1; cexplorer button → T2; clean timestamp row → T2; consistent fallback layout → T1; no regressions → cross-task acceptance).
- **No placeholders:** No TBDs, no "add appropriate styling", no vague handling. Class strings and wording are pinned via the spec; tasks reference the spec instead of duplicating it.
- **Type / name consistency:** No new types or exported names introduced. Local back-link element/constant deliberately unnamed in the plan so the implementing agent can pick what reads best in context, but the spec pins its rendering contract.
- **Constraint compliance:** No implementation code in this plan; lint commands are not part of any verification step; only `pnpm typecheck` is invoked.
