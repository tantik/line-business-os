# CAFE_V2_1_STAFF_SURFACE_RECONCILIATION_HANDOFF (2026-08-15)

> **Retained (ORUWA AI Governance Consolidation, Phase 2C, 2026-08-15).**
> This file is cited directly by `docs/ai/ORUWA_AI_ENGINEERING_OPERATING_MODEL.md`
> §§4–5 as the originating pattern for its execution-loop and self-correction
> rules — kept, not archived. Several one-off 2026-08-14 mission reports this
> document cross-references below (git/branch-preparation reports, local
> implementation/Preview-gate reports) were retired in the same Phase 2C
> cleanup as fully-superseded process detail; their content is preserved in
> git history, not in a live file at those paths.

Durable handoff for a **fresh** Claude Code session. This file, git, and the
repository's own tests/docs are the source of truth — not any prior chat's
conversational memory. Everything below is VERIFIED against tool output in
the session that wrote this handoff, unless explicitly marked INFERRED or
UNKNOWN.

---

## 1. Repository / git state (VERIFIED)

- Repo: `D:\Dev\line-business-os`.
- Current branch at handoff time: `fix/cafe-v2-1-invite-token-hash-callback`.
- HEAD: `946bc24` ("fix(cafe): server-side token_hash callback for new-user
  Staff invites (Stage 1)").
- `946bc24` **is** an ancestor of `origin/dev` (`git merge-base
  --is-ancestor HEAD origin/dev` → true) — already merged via PR #233 (merge
  commit `f4b7cda929cc27d0b18ccb8106eea6bf8d536df8` on `dev`).
- `origin/dev` HEAD: `f4b7cda` → `946bc24` → `ee0fada` (PR #232, prior Cafe
  reference-tenant work).
- Working tree: only pre-existing, unrelated **untracked** files (not
  staged, not part of any Staff-onboarding or reconciliation work). Present
  at handoff time:
  - `-` (stray file, ignore)
  - `ORUWA_BUSINESS_OS_PROJECT_HANDOFF_2026-07-31.md`
  - `docs/AI_PLAYBOOK.md`
  - `docs/QA_ACCESS.md`
  - `docs/ai/MANAGER_ROUTE_AUTHORIZATION_FINAL_REPORT_2026-08-14.md`
  - `docs/ai/ORUWA_CAFE_V2_1_REFERENCE_TENANT_REPORT_2026-08-14.md`
  - `docs/ai/STAFF_AUTH_CLEAN_BRANCH_REPORT_2026-08-14.md`
  - `docs/ai/STAFF_AUTH_GIT_COMMIT_PUSH_REPORT_2026-08-14.md`
  - `docs/ai/STAFF_AUTH_PREVIEW_FINAL_REPORT_2026-08-14.md`
  - `docs/ai/STAFF_AUTH_PREVIEW_PREFLIGHT_REPORT_2026-08-14.md`
  - `docs/ai/STAFF_PRODUCT_SURFACE_AND_QA_IDENTITY_AUDIT_2026-08-14.md`
  - `docs/architecture/engineering-decisions.md`
  - `docs/product/cafe-audit-*.md` (several), `cafe-commercial-competitive-audit-plan.md`, `cafe-product-principles.md`, `cafe-v2-2-candidate-backlog.md`
  - `icon/`
  - `packages/db/src/types.generated.ts`
  - `supabase/migrations/0060_workforce_recipe_tenant_wide_update_fix.sql`
  - `supabase/tests/0028_workforce_recipe_tenant_wide_update.sql`

  **Do not delete, stage, commit, or otherwise "clean up" any of these** —
  they predate this workstream, are unrelated to it, and were deliberately
  left untouched across multiple prior sessions. Their presence is expected
  and normal.
- **Recommended for the new audit chat**: create a **new branch off
  `origin/dev`** (do not reuse `fix/cafe-v2-1-invite-token-hash-callback`,
  which is a merged, closed-out fix branch) if any file needs to be written
  — e.g. `git checkout -b audit/cafe-v2-1-staff-surface-reconciliation
  origin/dev`. The audit is read-only/documentation-only, so a branch is
  only needed to have somewhere to commit the two audit docs.

## 2. Relevant merged PRs

- **PR [#233](https://github.com/tantik/line-business-os/pull/233)**
  ("fix(cafe): server-side token_hash callback for new-user Staff invites
  (Stage 1)") — merged to `dev`, commit `f4b7cda`. CI (`typecheck / test /
  build / lint`) and Vercel both green. Preview redeployed and verified
  live at the time (deployment `dpl_3avjmqN7WsjMpYj77hVLGk61V56Q`).
  Files changed: `apps/web/package.json`,
  `apps/web/src/app/auth/accept-invite/route.ts` (+ new
  `route.test.ts`), `apps/web/src/lib/workforce/invitations.ts` (+
  `invitations.test.ts` additions), new
  `apps/web/src/lib/workforce/invitation-actions.test.ts`, and
  `docs/ai/STAFF_ONBOARDING_INVITE_CALLBACK_DEFECT_IMPLEMENTATION_PLAN_2026-08-15.md`.
- **PR #232** (prior session) — created the ORUWA Cafe reference tenant and
  fixed the canonical Add-staff form. Background context only; not this
  workstream's subject.
- Full history/rationale for #233 is written up in
  `docs/ai/STAFF_ONBOARDING_INVITE_CALLBACK_DEFECT_IMPLEMENTATION_PLAN_2026-08-15.md`
  and `docs/ai/ORUWA_CAFE_V2_1_REFERENCE_TENANT_REPORT_2026-08-14.md` §33-34
  — read these for the "why," not this handoff.

## 3. Verified Staff C onboarding result (CLOSED — do not reopen without new evidence)

Staff C (employee `鈴木健太`, real reachable email
`konstantin.a.chvykov+staffc@gmail.com`, tenant ORUWA Cafe
`72b81b2f-9ba5-4a4a-a296-02e32d4682b8`) completed a **fully real,
end-to-end** invite → onboarding cycle with **zero Admin API or manual auth
workaround**, verified against live DB state and live browser behavior:

- Real Manager-created invitation via the canonical `/dashboard/workforce/manager` UI.
- Real email delivered via Resend/custom SMTP (`noreply@auth.oruwa.jp`).
- Supabase Invite email template (Stage 2, Founder-applied in Supabase
  Studio, Preview project `pehcoenozjtsjdvjietj`) using the new
  `token_hash`/`type=invite` link shape, not the old
  `{{ .ConfirmationURL }}` implicit-fragment shape.
- Server-side `verifyOtp({ token_hash, type: 'invite' })` callback (the
  Stage 1 code from PR #233) — confirmed used, not the PKCE `?code=`
  fallback.
- Real password setup via `SetPasswordForm` → `setPasswordAndAcceptInvitation`.
- `api.accept_employee_invitation` **confirmed executed** as part of that
  same server action (landing directly on `/dashboard/workforce/staff`,
  which is only reachable on that action's `success` branch) —
  `workforce.employee_invitations` row for Staff C: `status='accepted'`,
  `accepted_at` set, correct `target_user_id`.
- `workforce.employees.user_id` correctly bound to Staff C's own new Auth
  user; exactly 3 employee rows total for this tenant (Staff A, B, C), no
  duplicates.
- Exactly 1 `core.tenant_memberships` row (ORUWA Cafe, `active`), exactly 1
  `core.role_assignments` row (`employee`, not manager/owner), correctly
  location-scoped to ORUWA Cafe Main Store — matching the employee's own
  `location_id`.
- Live-verified: Staff C's own `/dashboard/workforce/staff` view shows only
  their own data; `/dashboard/workforce/manager` → **"Access denied"**
  (confirmed live by the Founder while signed in as Staff C).
- Cross-account attribution: Staff A and Staff C each submitted a shift
  preference for the **same date** (2026-08-10); DB confirms two distinct
  rows correctly attributed to two distinct `employee_id`s; each account's
  own staff view shows only its own submission; the Manager's roster view
  correctly shows both, each under the right real name (田中美咲 /
  鈴木健太) — no mixing, no overwrite.

**Conclusion: Stage 1 (PR #233) + Stage 2 (Founder-applied Invite email
template) together fully resolve the "new-user invite gets stuck
Auth-confirmed but never onboarded" defect (Defect C's fresh-onboarding
half) for a real, first-time hire, with zero privileged/manual recovery.**

**Do not re-investigate or re-litigate this result** unless the upcoming
Staff Product Surface Reconciliation Audit (§9 below) turns up concrete
evidence that contradicts it (e.g. discovers the landing route itself is
wrong for product reasons — that is a *different*, open question, see §6).

Staff A (`employee.id 47111fc0-...`, bound to auth user
`e7ab9856-7195-4d7e-ae2f-e3485c72deb7`) and Staff B (`employee.id
0f225fc9-...`, still **unbound**, invitation still `pending`, deliberately
left in its interrupted-onboarding limbo state as evidence of the
*original* bug) both remain exactly as they were. **Do not modify, delete,
recover, or re-invite either.**

## 4. Known defects (recorded, NOT to be fixed in the next workstream unless explicitly authorized)

- **Defect A** — `/dashboard/admin`
  (`apps/web/src/app/(protected)/dashboard/admin/page.tsx`) has no
  role/permission gate, only `requireTenantContext()` (membership check).
  Currently inert (every read on that page is itself RLS-scoped to return
  empty for non-managers; every management action is a hardcoded-disabled
  placeholder). Severity: Low-Medium. Must be resolved before any real
  privileged action is ever wired onto that route.
- **Defect B** — `listMyPendingWorkforceInvitations`
  (`apps/web/src/lib/workforce/invitations.ts`) filters only by
  `status='pending'`, relying solely on RLS to scope to "self." But
  `workforce.employee_invitations` also has a tenant-wide
  `wf_employee_invitations_manager_read` RLS policy, and Postgres OR-combines
  policies for the same command — so a Manager viewing their own tenant
  also sees (and gets an Accept button for) other people's pending
  invitations via `PendingInvitationBanner`. Severity: Low (info
  disclosure only — `api.accept_employee_invitation` independently
  re-validates `target_user_id = caller`, so no unauthorized write is
  actually possible). Live-reproduced multiple times this session (visible
  as the "スタッフとして招待されています。承認する" banner on the Manager's own
  dashboard while Staff B's invitation was pending).
- **Defect C** — **partially resolved** by PR #233 + Stage 2 (see §3). The
  *fresh-onboarding* half is fixed and proven. The *interruption/recovery*
  half remains open: if a user's Auth identity gets confirmed (token
  consumed) but the browser never completes password setup / app-level
  acceptance — for *any* reason (closed tab, lost connection, not just the
  original redirect bug) — there is still no self-service recovery path
  (`/sign-in` states outright "password reset... not available yet").
  Staff B is the preserved, intentional evidence of this exact limbo state.
  A permanent fix (self-service recovery flow, or a formal
  Manager-triggered recovery action) is a **separate, not-yet-scoped**
  future task.

Full technical detail on all three: `docs/ai/ORUWA_CAFE_V2_1_REFERENCE_TENANT_REPORT_2026-08-14.md`
§33-34, and `docs/ai/STAFF_ONBOARDING_INVITE_CALLBACK_DEFECT_IMPLEMENTATION_PLAN_2026-08-15.md`.

## 5. Relevant existing documentation (read before investigating)

- `docs/ai/STAFF_PRODUCT_SURFACE_AND_QA_IDENTITY_AUDIT_2026-08-14.md` —
  **primary existing source** for this new workstream. Already documents
  (as of 2026-08-14, **re-verify currency, do not assume unchanged**):
  three Staff-related code paths (a real Supabase-Auth-backed "preview"
  surface, a mock/localStorage demo surface, and the real `(protected)/dashboard`
  surface), a full capability matrix between them, and a preliminary
  recommendation that `/dashboard/workforce/staff` + `/manager` (what this
  doc calls "Surface B") should become canonical, with Surface A's
  UX-superior features (roster, self-pin, live polling, exchange,
  inventory UI, i18n) ported into B. **This is the single most relevant
  starting point for the new audit — read it in full before anything
  else.**
- `docs/ai/ORUWA_CAFE_V2_1_REFERENCE_TENANT_REPORT_2026-08-14.md` — the
  ORUWA Cafe reference-tenant creation/acceptance report, §33-34 covers
  this session's Staff A/B/C work and the three defects.
- `docs/ai/STAFF_ONBOARDING_INVITE_CALLBACK_DEFECT_IMPLEMENTATION_PLAN_2026-08-15.md`
  — the reviewed implementation plan behind PR #233 (root cause,
  architecture options, security analysis).
- `docs/ai/STAFF_AUTH_PROVISIONING_HANDOFF_2026-08-13.md` — original design
  doc for the invitation/acceptance system (`workforce.employee_invitations`,
  `api.accept_employee_invitation`, Founder decisions 8 and 9). Referenced
  by code comments throughout `apps/web/src/lib/workforce/invitations.ts`
  and `apps/web/src/app/auth/accept-invite/route.ts` — useful for
  understanding *why* the acceptance flow is shaped the way it is.
- `docs/phase-1n-4c-mame-to-cha-db-preview-architecture-plan.md` — documents
  the intended `demo.oruwa.jp` / `preview.oruwa.jp` / `app.oruwa.jp` domain
  architecture and the `_client-preview` surface's original design intent.
  Relevant background for §9.B (surface origin) of the new audit.
- `AGENTS.md`, `.cursor/rules/*` — repo-wide operating rules (architecture,
  security, DB/RLS, git workflow) that any new code path must respect. Read
  before proposing any architecture in §9.F of the new audit.

## 6. Staff surfaces — routes currently believed relevant (VERIFIED existence only; behavior/classification is TO VERIFY by the new audit)

**VERIFIED to exist in the current tree** (confirmed via `find`/`git
ls-tree` against HEAD `946bc24` in this session):

| Path on disk | Notes |
|---|---|
| `apps/web/src/app/(protected)/dashboard/workforce/staff/page.tsx` | The route Staff C actually landed on after real onboarding (§3). Part of the `(protected)` layout group — real Supabase session via `requireTenantContext()`. |
| `apps/web/src/app/(protected)/dashboard/workforce/manager/page.tsx` | Manager counterpart; PR #231 gates this on `workforce.staff.manage`. |
| `apps/web/src/app/(protected)/dashboard/workforce/recipes/*` | Recipes surface under the same protected dashboard. |
| `apps/web/src/app/%5Fclient-preview/mame-to-cha/staff/page.tsx` | **IMPORTANT, UNRESOLVED TECHNICAL DETAIL**: the directory's *actual, literal* name on disk and in the git tree is `%5Fclient-preview` — the three characters `%`, `5`, `F`, not an underscore character. `docs/ai/STAFF_PRODUCT_SURFACE_AND_QA_IDENTITY_AUDIT_2026-08-14.md` (and this handoff's author's own recollection from earlier in the session) refer to this as `_client-preview` (literal underscore, the conventional Next.js "exclude from routing" prefix). **This handoff does NOT resolve whether that's a display/encoding artifact of some tool, a real filesystem quirk, or genuinely how the folder is named in git** — confirmed via `git ls-tree HEAD` showing the raw tree entry as `%5Fclient-preview` with `cat -A` showing no hidden escaping. **The new audit must verify this precisely** (e.g. via `git cat-file`, checking how Next.js's router actually resolves the live Preview URL for this surface, and confirming whether the live route is reachable at `/mame-to-cha/*` as documented, or at some percent-encoded path, or not at all) before relying on any prior document's routing claims for this surface. |
| `apps/web/src/app/%5Fclient-preview/mame-to-cha/manager/page.tsx` | Manager counterpart of the above. |
| `apps/web/src/app/%5Fclient-preview/mame-to-cha/recipes/page.tsx`, `recipes/[recipeId]/page.tsx` | Recipes counterpart. |
| `apps/web/src/app/mame-to-cha/staff/page.tsx` | A **third**, separately-rooted `mame-to-cha` directory (no `%5Fclient-preview`/underscore prefix at all) — per the 2026-08-14 audit doc, this is the mock/localStorage demo surface (`STAFF` array, `CURRENT_STAFF_ID`, no Supabase calls). **Re-verify this classification**, do not assume it's still accurate. |
| `apps/web/src/app/mame-to-cha/manager/page.tsx`, `apps/web/src/app/mame-to-cha/recipes/page.tsx`, `apps/web/src/app/mame-to-cha/page.tsx` | Same third surface's other routes. |
| `apps/web/src/app/workforce/page.tsx` | Exists; purpose not established in this handoff — **TO VERIFY**. |
| `apps/web/src/app/demo/cafe/*` | A `demo.oruwa.jp`-style public/marketing surface per the architecture-plan doc — likely out of scope for "real Staff product experience" but **TO VERIFY**, not assumed. |

**TO VERIFY (not confirmed in this handoff-writing session, do not assume from filenames alone):**
- Which of the three code paths above is actually reachable at which live
  URL on `preview.oruwa.jp` (host-based rewrites are documented in the
  architecture-plan doc but were not re-verified live in this session).
- Whether the `%5Fclient-preview` naming affects Next.js's routing/exclusion
  behavior at all (see above).
- Current accuracy of the 2026-08-14 audit doc's capability matrix — it is
  10 months... (same-day, actually 1 day) old relative to this handoff but
  PR #233 and other recent changes may have touched shared
  `lib/workforce/*` code it depends on; re-verify rather than cite as
  current fact.
- Why `/dashboard/workforce/staff` (not a Cafe-specific/tenant-aware route)
  is what a freshly-accepted invitation currently redirects to — this is
  §9.E of the new audit's mandate, not resolved here.

## 7. Architecture / security constraints (binding, from `CLAUDE.md`/`AGENTS.md`)

- LINE Business OS is **one shared multi-tenant SaaS Core** — every product
  (including Cafe) runs as a module inside it, never as an isolated
  project or tenant-specific fork.
- Never expose `service_role` to the frontend or bundle it into `apps/web`.
- Never run Supabase Cloud writes (`db push`, `db pull`, `link`, migration
  repair) without explicit human approval.
- Never run a production deploy without explicit human approval.
- Never touch customer data, billing, or LINE broadcast/mass messaging
  without explicit human approval.
- Rule source of truth, in order: `AGENTS.md` →
  `docs/ai/oaes-project-profile.md` → `docs/ai/current-task.md` →
  `.cursor/rules/*` → `docs/architecture/*` → `docs/security/*` →
  `docs/operations/deployment-checklist.md`.
- The Founder's own framing for this workstream (verbatim, binding): *"one
  SaaS → shared Platform Foundation → reusable modules → vertical product
  packages → no tenant-specific forks."* Any recommendation in the audit's
  §9.F must respect this — do not solve the Staff-surface question by
  hardcoding Mame To Cha- or Cafe-specific logic into shared/platform code.

## 8. Explicit prohibition on implementation during the audit

The next chat's task is **read-only investigation and documentation only**.
Explicitly prohibited for that task (per the Founder's instructions):
redesigning, refactoring, deleting routes, redirecting routes, merging
implementations, changing DB/RLS/auth, or implementing any fix — all
require separate, explicit Founder approval **after** the audit is
delivered and reviewed. The audit may freely: read files, search code,
inspect git history/log/diff, inspect existing docs/tests, run
typecheck/test/lint/build, inspect Preview via browser tooling, compare
UI/routes live, and inspect read-only DB state via the existing `npx
supabase db query --linked` tooling (already proven safe/working against
project `pehcoenozjtsjdvjietj` throughout this and prior sessions).

## 9. New workstream — full objective (verbatim from Founder, do not paraphrase away detail)

**Title**: ORUWA Cafe v2.1 — Staff Product Surface Reconciliation Audit.

**Primary question**: What is the canonical Staff product experience for a
real ORUWA Cafe employee, and why do multiple Staff surfaces currently
exist?

Investigate, at minimum, these areas (see the full task prompt the Founder
supplied — reproduce it in full for the new chat rather than re-summarizing,
since it specifies exact required sub-investigations):

- **A. Route map** — every Staff-facing route: source files, layouts, entry
  points, redirects, auth requirements, role/permission requirements,
  tenant/location resolution, intended user, Preview-reachability, and
  classification (production/demo/preview-only/compatibility/technical-reference/obsolete)
  based on tracing actual code and routing, not filenames.
- **B. Surface origin** — via git/PR history and existing docs: when each
  surface was introduced, why, which product phase, whether one was meant
  to replace another, whether both are intentionally maintained or
  divergence was accidental. Distinguish verified history from inference.
- **C. Feature comparison matrix** — profile, schedule, self/all modes,
  week navigation, shift preferences, attendance/work reports, correction
  requests, shift change/cancel/exchange, recipes/manuals, inventory,
  language switching, live refresh/polling, loading/performance, tenant/location
  context, navigation, mobile usability, and any other current Cafe v2.1
  Staff capability. Classify each surface per capability: IMPLEMENTED /
  PARTIAL / MISSING / NOT APPLICABLE / UNKNOWN, with concrete file/function
  citations or live-verified behavior for every claim.
- **D. Data/backend duplication** — same services/API facade/views/RPCs or
  duplicated logic; different abstractions; different RLS/security
  assumptions; risk of inconsistent behavior; whether one UI is just
  another presentation over the same backend or two independently evolving
  applications.
- **E. Onboarding destination** — trace the full path after
  `api.accept_employee_invitation` to determine exactly why Staff C landed
  on `/dashboard/workforce/staff`: exact redirect source, whether
  intentional, whether tenant kind/product package is considered, whether
  Cafe Staff should resolve to a Cafe-specific route, implications for
  future vertical products. **Do not change the redirect.**
- **F. Canonical product decision** — recommend exactly one architecture
  (`/dashboard/workforce/staff` canonical; Cafe-specific surface canonical;
  shared Workforce shell + Cafe package composition; or another, only if
  evidence strongly supports it), respecting the "no tenant-specific forks"
  constraint (§7).
- **G. Gap analysis** — if the recommended canonical surface lacks
  capabilities present in the other, classify each gap P0 (blocks Cafe v2.1
  acceptance) / P1 (should be reconciled soon) / P2 (later polish). Do not
  inflate P0.
- **H. Deprecation/deletion analysis** — retain/compose/redirect/deprecate/delete
  candidates, with dependencies and migration risk identified first, actions
  NOT performed.
- **I. Security review** — authentication, tenant isolation, role
  enforcement, location scope, own-data scoping, mutation authorization
  equivalence between surfaces; flag discrepancies; no RLS weakening, no
  `service_role` in frontend.
- **J. Product/UX review** — task clarity, daily workflow, information
  density, mobile suitability, Japanese-first usability, unnecessary
  technical/admin concepts, whether a real Staff member could use it
  without training. Not a visual redesign.

## 10. Required deliverable for the new workstream

Create `docs/ai/CAFE_V2_1_STAFF_SURFACE_RECONCILIATION_AUDIT_2026-08-15.md`
with exactly this structure (Founder-specified):

1. Executive conclusion
2. Verified route/surface map
3. Historical origin
4. Feature comparison matrix
5. Backend/data-flow comparison
6. Onboarding destination analysis
7. Security comparison
8. Product/UX comparison
9. Canonical Staff surface recommendation
10. P0/P1/P2 reconciliation gaps
11. Deprecation/deletion candidates
12. Risks
13. Unknowns requiring Founder/manual verification
14. Proposed implementation phases — **PLAN ONLY, do not implement**
15. Exact acceptance criteria for Cafe v2.1 Staff surface reconciliation
16. Final verdict: Cafe v2.1 Staff surface is already coherent, OR
    reconciliation required before acceptance

## 11. Operating mode for the new chat (Founder-specified, carry forward verbatim)

Bounded autonomous engineering agent, PLAN → inspect → gather evidence →
test/verify → update conclusions → continue → final review → report. May
autonomously do all low-risk read-only work (inspect files, search code,
git history, docs, tests, non-destructive local checks, typecheck/test/lint/build,
Preview browser inspection, read-only DB queries via existing tooling) and
may create/update audit/plan/handoff/report docs on a working branch. Must
NOT autonomously: deploy production, modify production data, run
destructive SQL, run unreviewed migrations, push schema changes, bypass
RLS, expose/use `service_role` in frontend, modify secrets/credentials,
modify Supabase Auth configuration, modify billing, send LINE broadcasts,
perform destructive cleanup, merge PRs, make irreversible changes, or
implement outside the explicitly approved task. Ask the Founder only when
human credentials/session are genuinely required, a browser action can't be
safely automated, external configuration must change, a destructive/privileged
action is required, a product decision has multiple materially different
valid choices, or requirements are genuinely ambiguous and repository
evidence can't resolve them — not merely because asking is easier than
investigating.

Self-correction rule: never claim an action was executed unless tool output
proves it; use VERIFIED / INFERRED / UNKNOWN / NOT TESTED markers; if new
evidence contradicts an earlier conclusion (including anything in this
handoff), explicitly correct it and continue from the corrected state
rather than protecting an earlier answer for consistency.

Context management: the new chat is itself responsible for creating its own
further handoff (`docs/ai/<WORKSTREAM>_HANDOFF_<DATE>.md`) if it runs long,
before context becomes unreliable — same discipline as this document.

## 12. What must NOT be accidentally modified

- Staff A (`47111fc0-...`/`e7ab9856-...`), Staff B (`0f225fc9-...`,
  unbound, invitation pending — intentional evidence, not a bug to clean
  up), Staff C (`5452506b-...`/`bc8ad612-...`) — all in the ORUWA Cafe
  tenant (`72b81b2f-9ba5-4a4a-a296-02e32d4682b8`), all Preview-only, all
  reference data to be **left exactly as-is**.
- Any Supabase Auth configuration (Site URL, Redirect URLs, email
  templates — Stage 2 is applied and correct as of this handoff) in
  project `pehcoenozjtsjdvjietj`.
- Any SMTP/Resend configuration.
- Any code already merged via PR #233.
- The unrelated untracked-file clutter listed in §1.
- `main`/production — never touched by any of this work; confirmed
  throughout prior sessions that the linked Supabase project is always
  `pehcoenozjtsjdvjietj` (Preview/dev), never `jsgmmsdkuptdsxtcxhsv` (a
  separate, unrelated, inactive project for a different product line).

---

No secrets, passwords, tokens, or service_role values are recorded anywhere
in this handoff.
