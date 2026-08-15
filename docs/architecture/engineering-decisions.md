# Engineering Decisions

Verified decisions only — proven by actual work on this project, not general
theory. Each entry stays until contradicted by later evidence.

----------------------------------

ED-001

Decision: Never resolve tenant/auth context (`auth.getUser()`, membership,
module, location, permission) more than once per request.

Reason: Helper functions composed independently each re-resolved context
their caller had already resolved, silently doubling auth round trips.

Evidence: `resolvePreviewTenantContext()` called `auth.getUser()` and
`listTenantMemberships()` itself, then called `requireTenantContext()` which
called both again — fixed in commit `7cbf0f8` by accepting pre-resolved
user/memberships. `previewUpsertRecipe` ran the full 4-step manager
auth-context chain twice per publish just to check a second permission —
fixed in commit `bced914` by accepting an optional second permission against
the already-resolved context.

Applies to: any Server Action or page loader composed from more than one
context-resolving helper.

Status: Active.

----------------------------------

ED-002

Decision: Sign Supabase Storage URLs once per list load, server-side, in the
same request that already reads the rows — never re-sign on every modal
open, and never let a client component re-fetch signed URLs it already has.

Reason: `previewListRecipeMediaUrls` was invoked by the Recipes modal's
`useEffect` on every open, running a second full manager-auth chain plus a
Storage call for URLs the page had just read moments earlier.

Evidence: `createRecipeMediaUrlMap()` (`lib/workforce/recipes.ts`) is now
called once from the Manager page's server-rendered load and shared by the
Server Action, so a normal modal open renders with zero fetches. The modal's
effect now diffs each recipe's `mediaPath` against a `knownMediaPaths` ref
and only calls the Server Action for rows that are new or whose path
actually changed (`preview-recipe-kind-manager.tsx`).

Applies to: any client component whose data was already loaded by its
parent Server Component.

Status: Active.

----------------------------------

ED-003

Decision: When a shared `Modal` unmounts its children on close (this one
does), any state that must survive close/reopen must be owned by the parent
that stays mounted, not by the child rendered inside the modal.

Reason: State declared inside `PreviewRecipeKindManager` (recipes, then
signed media URLs) was discarded every time the modal closed, forcing a
refetch on every reopen even though nothing had changed.

Evidence: `recipes` and `recipeMediaUrls` are both `useState` in
`PreviewStaffRecipeManagement` (which never unmounts while the page is
open) and passed down as props + setters, not owned by
`PreviewRecipeKindManager` itself.

Applies to: any component rendered inside `components/demo/cafe/Modal.tsx`.

Status: Active.

----------------------------------

ED-004

Decision: Find the root cause via code inspection and/or a timing trace
before changing code; do not refactor speculatively against a vague "it
feels slow" report.

Reason: Two founder-reported symptoms (page scroll jump, ~14s recipe
publish) each had one concrete, traceable cause once inspected — a
`router.push()` default-scroll behavior, and a duplicated auth chain
(ED-001) — not a general architecture problem.

Evidence: commit `bced914` names the exact line-level cause for both
symptoms before any fix is described. `lib/perf/timing.ts` exists purely to
support this: gated `time()`/`mark()` wrappers, no-op by default, added at
call sites during investigation and left as no-op scaffolding afterward.

Applies to: any "Manager page is slow" report before a fix is proposed.

Status: Active.

----------------------------------

ED-005

Decision: This sandbox cannot capture real before/after network timings — it
has no access to `apps/web/.env.local` and no authenticated browser session
against the backend. Perf work done here ships with static verification
(typecheck/lint/test, code-path tracing) and an explicit flag that a human
must run the live timing pass, never fabricated numbers.

Reason: Stated directly in commit `7cbf0f8`'s message after the same
constraint was hit; re-confirmed this session when reading `.env.local` to
attempt a live check was itself blocked.

Evidence: `7cbf0f8` commit message; this session's Part 6 verification.

Applies to: any performance task attempted from this environment.

Status: Active.
