# Session Handoff — 2026-09-18 (Mission 9)

## TL;DR

**Mission 9 — Cafe v2.2 Demo Readiness is CLOSED (ACCEPTED WITH ONE
FOUNDER-DEFERRED EXCEPTION).** PR #531 merged into `dev` (squash `5b2a742`),
non-RED (no `supabase/migrations/**` touched), autonomous merge via
`scripts/ai-dev-merge.sh`. Phase A read-only demo audit (two background
agents, Manager + Staff surfaces, zero D0) → bounded D1 repair pass →
independent review (`/code-review --high`, 4 fresh-context finder agents)
caught 3 real missed call sites before merge, fixed and re-verified →
first-ever real Staff-role live Browser QA this project has done (previous
sessions only checked a Manager identity's "no profile" empty state) →
one live-reproduced, non-obvious CSS layout bug found and fixed on a real
Staff mobile session → post-merge smoke on canonical `preview.oruwa.jp`
confirmed clean. **Cafe v2.2 itself is explicitly NOT declared CLOSED** —
the next separate, not-yet-authorized phase is Full Integrated Acceptance.

## Repo state

| | |
|---|---|
| Branch | `dev` |
| HEAD | `5b2a742` (PR #531 squash-merge) |
| Working tree | clean |
| `main` | untouched |
| Production | untouched, still separately gated |
| Cloud DEV migrations | unchanged this session — no `supabase/migrations/**` touched |
| Open PRs | none |
| Feature branch | `feature/mission-9-demo-readiness` still exists (local + origin) — fully merged, branch deletion is a guarded destructive git operation this session doesn't have standing authority for; safe to delete manually whenever convenient |

## What happened this session

A GPT-authored "Mission 9 — Demo Readiness" prompt was relayed by the
Founder, cross-checked against `current-task.md`'s own 2026-09-18 pointer
(Mission 8's own "recommended next" already named this exact scope) before
proceeding. Three explicit Founder decisions were obtained mid-session
(via clarifying questions, not assumed): (1) Staff QA credentials would be
supplied directly in chat rather than read from `.env` (blocked by this
session's own file-permission sandboxing, not a policy choice); (2) routine
demo-data UI edits could proceed autonomously; (3) known QA-residue/backlog
data (see "Deferred" below) should be documented, not touched. A fourth,
narrower decision was obtained live: the Founder said to leave the Mail
thread's Russian QA-chatter content alone and continue.

### Phase A — read-only demo audit (two background agents)

- **Manager-surface agent**: read all 10 canonical Manager routes
  (dashboard/Attention/Operations/Issues/Weekly Review/Staff mgmt/
  Schedule/Inventory/Purchasing/Recipes), classified each CORE/OPTIONAL/
  INTERNAL, found 4 findings (M1-M4, one D1: English-only error banners in
  Manager/Inventory/Purchasing; one D1: raw-UUID fallback in Attention
  Panel; two D2/D3: legacy-theme empty states and a redundant `/dashboard/
  workforce` nav path, both already-tracked debt).
- **Staff-surface + demo-data agent**: read the canonical Staff route,
  found one real D1 (three early-return screens — no profile / no
  location — render before `LangProvider` mounts, English-only with no JA
  at all) and inventoried the repo's existing demo-data mechanisms
  (`packages/db/scripts/oruwa-cafe-fixture*.ts`, dry-run-by-default,
  idempotent, keyed on item **name** for dedup — a fact that later blocked
  a "just rename it" fix, see Deferred).
- **Zero D0 findings** from either agent.

### Bounded repair pass (first commit, `61cc1ad`)

- **M1**: `manager/error-copy.ts`, `inventory/error-copy.ts`,
  `purchases/error-copy.ts` were English-only for their generic statuses
  (not_found/not_authenticated/no_membership/etc.), unlike the already
  lang-aware `issues/`, `operations/`, `staff/error-copy.ts` siblings —
  added `lang` param + JA copy to all three, threaded through every call
  site (~13 sites across `manager-dashboard-client.tsx`,
  `shift-cell-editor.tsx`, `staff-form.tsx`, `manage-staff-popup.tsx`,
  `line-link-form.tsx`, `count-form.tsx`, `item-form.tsx`,
  `inventory-dashboard-client.tsx`).
- **M2**: Manager Attention Panel's queue renderer fell back to a raw
  employee UUID instead of the "Unknown staff" label Mission 8 already
  introduced at 8 other call sites (F3/F9/F10) — this one site wasn't
  among them. One-line fix.
- **S1**: Staff page's no-profile/no-location early-return screens were
  English-only (they render before `LangProvider` mounts, so no lang
  context is available) — made bilingual, JA first (matching
  `LangProvider`'s own `'ja'` default) with EN underneath, rather than
  attempting a bigger server-side-language-resolution fix (flagged as
  architecture debt, not fixed — see Deferred).

### Live Browser QA — Manager (desktop 1440×900, tablet 768×1024, JA then EN)

Real authenticated Manager session (already-signed-in browser profile) on
canonical `preview.oruwa.jp`. Walked: dashboard/Attention Panel, Operations
(Templates/Today/Attention-required tabs), Issues & Handover, Weekly
Review, Recipes, Inventory, Purchasing. Found and fixed live, in Preview
data (safe, reversible, UI-only actions, per Founder-approved autonomy):

- **A QA-stub recipe literally titled "New recipe"** (every field — title,
  description, 3 ingredients, 3 steps, note title, note content — was the
  literal string "New recipe"), published and visible to both Manager and
  Staff, sitting in the list between real recipes (エスプレッソマシンの
  清掃手順、カフェラテ、抹茶ラテ, etc.). Archived via the normal edit-form
  status dropdown (reversible — still exists under the "Archive" filter,
  nothing deleted).

768×1024 (tablet): nav wraps to two rows, cards reflow, no overflow — clean.
EN toggle: full nav/labels translate correctly, no raw keys, no layout
break; staff names correctly stay in Japanese (real person names, not UI
copy).

### Live Browser QA — Staff (first real Staff-role session this project has run)

Real authenticated session as **田中美咲** (Barista), 375×667 and 320×667,
JA then EN, on both the PR's ephemeral Vercel preview (to verify the
in-progress fix) and canonical `preview.oruwa.jp` (post-merge). Walked:
landing/work-status card, Recipes (list + a full detail view — cost
section correctly absent for Staff per WP5's existing design, allergen
tags render correctly), Inventory, Purchases, Issues & Handover (clean
empty state), Mail, account-menu language toggle. 320×667: no horizontal
overflow anywhere, account-menu dropdown does not clip at the narrow edge.

**A real, live-reproduced, non-obvious layout bug was found and fixed
during this session's own Staff QA — the most significant finding of
Mission 9:** opening Operations → "本日のタスク" (Today's Tasks) as Staff
at 375px showed rows of severity badges ("期限超過"/"重要チェック未実施"/
"N 件の未解決の問題") with **no visible task title at all** above them —
only one row (with just one badge) rendered normally. DOM inspection
(`getBoundingClientRect`/`getComputedStyle`) confirmed the title text was
present with correct color/contrast but had a computed width of literally
`0px`. Root cause, in the shared DS v1 `ListRow` component
(`packages/ui/src/list-row.tsx`, used by Operations Manager+Staff and
Weekly Review): the trailing status-badge group is `shrink-0` with no
width cap, so flex layout gives it its full *unwrapped* preferred width
even though `flex-wrap` lets its own children wrap visually — when that
preferred width exceeds the row (several/long badges), the sibling title
(`min-w-0`, which permits shrinking all the way to 0) collapses instead of
the badges. **Verified the fix hypothesis live via a DOM style override
before writing any code**, then applied `max-w-[60%]` to the status group
in source, confirmed via typecheck/lint/1334-test suite, then confirmed
*again* on the real deployed PR preview and, after merge, on canonical
`preview.oruwa.jp` — title now renders correctly (truncated with `…` as
designed) on every row.

**Found, documented, NOT fixed (Founder-directed — "оставим Mail,
продолжай"):** the Staff↔Manager Mail thread on the `oruwa-cafe` reference
tenant contains real historical QA/engineering chatter **in Russian**
("Спасибо, принято! Ответ от Manager, QA PR #444.", "Final QA 2026-08-26:
manager→staff mail check.") — visible to anyone who opens "メール" during
a demo. This is real message-history data, not a code defect; no code
change can fix it. Explicitly left in place per Founder instruction this
session — flagged here so it is not silently forgotten before an actual
customer-facing demo.

### Independent review (`/code-review --high`, before merge)

Four fresh-context finder agents reviewed the full diff. **Three
independently found the same real bug**: `recipe-form.tsx`,
`recipes-list-client.tsx`, and `[recipeId]/recipe-detail-client.tsx` all
import `describeWriteError` from `manager/error-copy.ts` — the exact
function whose signature the bounded-repair commit changed to accept
`lang` — but these three call sites were missed. Since the new parameter
defaults to `'en'`, the omission failed silently (wrong-language text on
a JA-language save/delete error) rather than a compile error. All three
had `lang` already in scope; fixed by threading it through. A fourth agent
flagged two lower-severity, non-blocking items, both addressed: (a)
`ListRow`'s `actions` slot had the same structural risk as `status`
(not yet reproduced, but structurally identical) — capped defensively at
`max-w-[30%]`; (b) `manager/error-copy.ts` duplicated slightly different
wording for 3 statuses that already existed in
`manager-dashboard-i18n.ts` — switched to reuse the existing dictionary
keys, removing the second, independently-worded copy. Not fixed, judged
out-of-bounded-scope and left as documented debt: `localizedEditorError`/
`localizedFormError` duplication across two files (pre-existing pattern);
the lack of any server-side language resolution that makes `staff/
page.tsx`'s bilingual-paragraph workaround necessary in the first place
(architecture-level).

Second commit (`e7f099e`) carries all independent-review fixes.
typecheck/lint clean, full `apps/web` suite 1334/1334 at every commit, 0
new regressions.

### PR / merge

PR #531 opened as draft against `dev` while work was still in progress
(so CI/preview ran continuously), marked ready once both commits landed
and independent review's findings were resolved. CI green (both jobs) +
Vercel preview green. Merged autonomously via `scripts/ai-dev-merge.sh 531`
(base=`dev`, not draft, OPEN, MERGEABLE, all checks pass, no RED path
touched — the script's own mechanical gate confirmed this).

### Post-merge verification

Canonical `preview.oruwa.jp` reloaded post-merge: Manager dashboard,
Recipes popup (confirmed "New recipe" stays archived), Inventory popup —
all load cleanly, zero console errors. Staff: real 田中美咲 session,
375px, Operations "本日のタスク" — the ListRow title-collapse fix
confirmed live on the actual merged code (not just the earlier DOM
override), EN toggle also re-verified clean on Staff at 375px.

## Live Browser QA actually performed (be precise — do not overstate)

- **Manager**: 1440×900 and 768×1024, JA then EN. Dashboard/Attention
  Panel, Operations, Issues, Weekly Review, Recipes, Inventory, Purchasing.
- **Staff**: 375×667 and 320×667, JA then EN, **real authenticated Staff
  session (田中美咲)** — the first genuine Staff-role Browser QA this
  project has run (every prior session either skipped it or only checked
  a Manager identity's "no profile" empty state). Landing, Recipes (list +
  detail), Inventory, Purchases, Issues, Mail, Operations (including the
  live-reproduced-and-fixed bug above), account-menu language toggle.
- **NOT performed this session**: a real mutation from the Staff session
  (clock-in, a stock count, a purchase order) — this session's Staff QA
  was read-heavy (per the mission's own emphasis on visual/comprehension
  correctness over transactional coverage); instrumented performance
  measurement of Operations/Issues/Weekly Review/Inventory/Purchasing/
  Schedule (Mission 8 measured only Recipes; this gap from Mission 8's own
  handoff was not closed this session either — it was not this session's
  focus); a fresh keyboard Tab-cycle/focus-trap audit beyond what Mission
  8 already covered.

## Demo Acceptance Matrix (summary — see PR #531 for full detail)

| Role | Surface | Viewport | JA | EN | Status |
|---|---|---|---|---|---|
| Manager | Dashboard/Attention/Schedule | 1440×900, 768×1024 | ✅ | ✅ | PASS |
| Manager | Operations/Issues/Weekly Review | 1440×900 | ✅ | not re-toggled | PASS |
| Manager | Recipes/Inventory/Purchasing | 1440×900 | ✅ | not re-toggled | PASS |
| Staff | Landing/Schedule/work-status | 375×667, 320×667 | ✅ | ✅ | PASS |
| Staff | Recipes (list+detail)/Inventory/Purchases | 375×667 | ✅ | not re-toggled | PASS |
| Staff | Operations "本日のタスク" | 375×667 | ✅ | not re-toggled | PASS (after fix) |
| Staff | Issues & Handover | 375×667 | ✅ | not re-toggled | PASS |
| Staff | Mail | 375×667 | ⚠ | — | **DEFERRED-NONBLOCKING** — real content, Russian QA chatter, Founder-directed leave-as-is |

## Fixed demo blockers (this session)

1. **M1** — English-only error banners, Manager/Inventory/Purchasing → JA added, `lang` threaded through ~16 call sites (incl. the 3 missed Recipes sites review caught).
2. **M2** — raw employee UUID fallback in Attention Panel → "Unknown staff" label.
3. **S1** — Staff no-profile/no-location screens, English-only → bilingual.
4. **A QA-stub "New recipe"** live in the Recipes list → archived.
5. **The ListRow title-collapse bug** (see above) — the session's most significant, live-reproduced finding.
6. Independent-review follow-ups: 3 missed `lang` call sites in Recipes; `ListRow` `actions`-slot defense-in-depth cap; `manager/error-copy.ts` de-duplication.

## Deferred debt (not fixed, explicitly recorded so nothing is silently re-raised as "new")

- **Mail thread Russian QA content** — Founder-directed, this session ("оставим Mail, продолжай"). Real content, not a code defect. Should be cleaned (new realistic JA thread, or the thread cleared) before any actual customer-facing demo.
- **Operations backlog** — 52 "対応が必要" items (48 of them a generic "タスク" grouping), 23 unaddressed shift-preference requests, visible identically in the Attention Panel, Operations popup, and Weekly Review. Founder decision this session: document as deferred, do not touch — resolving genuinely-old QA-accumulated backlog data is a data decision, not a bounded code fix, and no existing tooling automates it (confirmed: `packages/db/scripts/*` has no bulk-resolve mechanism).
- **Two Inventory items literally named "QAフィクスチャー：抹茶パウダー" / "QAフィクスチャー：紙コップ（Mサイズ）"** — Founder decision this session: leave as-is. Cannot be safely renamed without also updating `packages/db/scripts/oruwa-cafe-fixture.ts`, whose idempotency/dedup check is keyed on the item's **name** — a rename would break that script's "don't create a duplicate on rerun" guarantee.
- **Operations template "Opening checklist"** — not just missing a JA title (unlike every sibling template, which is bilingual): its actual checklist items ("Fridge temperature", "Front door unlocked") are English-only real operational content. Translating real Manager-authored content correctly is a content decision, not a bounded UI fix — left untouched.
- **F7** (Purchasing + ~58 other files still on legacy `theme.ts`, not Design System v1), **F12** (Inventory/Recipe unit `pcs` has no Japanese label), **F13** (Purchasing footer omits Ordered/Received counts) — all already tracked from Mission 8, confirmed still real, still explicitly out of this mission's bounded scope.
- **`/dashboard/workforce`** — confirmed via code reading (not guessed) to be a real, still-functional, role-aware secondary nav hub, reachable only from the older, purely-technical `/dashboard` admin shell — **not** reachable by any Manager or Staff account through the normal post-login redirect (`apps/web/src/lib/auth/post-login-redirect.ts` sends Manager → `/manager`, Staff → `/staff` directly, and explicitly documents `/dashboard` as "Technical shell, not a workspace," reached only by an account with neither role). `/dashboard/workforce/{manager,staff}` are pure `redirect()` stubs to `/manager`/`/staff`, kept only for old bookmarks — not a duplicate UI. Confirmed not a demo risk; not touched (a full IA reconciliation of `/dashboard/**` is separately tracked, not part of Cafe v2.2, and not authorized here).
- No dedicated "Owner" surface exists or was built — out of scope; today a single-cafe owner uses the Manager surface with full rights, same as before this mission.
- Architecture debt: no server-side language resolution anywhere in the app (`LangProvider` is client-only, defaults to `'ja'`) — the reason `staff/page.tsx`'s three early-return branches needed a manual bilingual-paragraph workaround instead of a real fix. Flagged by independent review, not fixed (root-level fix is a platform-level change, not a bounded demo-readiness item).
- EN was not independently re-toggled/re-screenshotted on Manager's Operations/Issues/Weekly Review/Recipes/Inventory/Purchasing popups, or on Staff's Recipes/Inventory/Purchases/Issues/Operations popups, this session — only the top-level dashboard chrome (both roles) and Staff's Operations popup were EN-verified. Same "code-verified via the shared i18n mechanism already confirmed working elsewhere, not independently pixel-verified everywhere" evidence-bar precedent used throughout this project's history.

## Engineering validation

typecheck: clean (every commit). lint: clean (every commit, both
`apps/web` and `packages/ui`). Full `apps/web` test suite: **1334/1334**
at every commit, 0 new regressions. CI (GitHub Actions, both matrix jobs)
+ Vercel preview: green. No `supabase/migrations/**`, schema, RLS, or
`service_role` touched. Production untouched, separately gated. `main`
untouched.

## Hard rules still in force

- No `main`, no production deploy, no Supabase Cloud writes — unchanged, moot this session (nothing touched `supabase/migrations/**`).
- Founder-facing language = Russian.
- **Cafe v2.2 remains NOT CLOSED.** Mission 9's own closure does not authorize starting Full Integrated Acceptance, or any new WP/feature work, without a fresh explicit Founder prompt.
- The Mail/backlog/fixture-naming items above are open, Founder-acknowledged deferrals — not silently "clean," and not to be re-litigated as new findings by a future session without cause.

## Reading order for a fresh session

1. `AGENTS.md` → `docs/ai/ORUWA_AI_ENGINEERING_OPERATING_MODEL.md` → `docs/ai/current-task.md` (its newest pointer).
2. This file.
3. PR #531 (https://github.com/tantik/line-business-os/pull/531) for the full diff and independent-review discussion.
4. `docs/ai/SESSION_HANDOFF_2026-09-18.md` (Mission 8, immediately prior) for context on what this mission's audit deliberately did not re-check.
