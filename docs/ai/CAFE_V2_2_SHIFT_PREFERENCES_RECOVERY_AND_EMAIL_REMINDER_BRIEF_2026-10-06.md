# CAFE v2.2 — Shift Preferences / Shift Requests Contract Recovery + Email Reminder (v1, Founder-approved scope)

Mission brief for a **fresh Claude Code session**, continuing Founder
Acceptance (Mission 11). Originally authored by GPT as a read-only
recovery/documentation brief; amended 2026-10-06 after the Lead Agent's own
code verification and one explicit Founder scope decision (§0.2). This file
is the single source of truth for the mission — do not re-derive scope from
the chat that produced it.

## 0.1 Context

Cafe v2.2 is under Founder Acceptance. Founder Technical Freeze: **APPROVED**.

During Founder Acceptance (QA3, 2026-10-06) the Founder found that Manager →
Settings → Shift requests → Shift preferences *looks* like a finished
workflow but parts of it are UI-only, semantically inconsistent with the
backend, or incomplete. This is primarily an **acceptance-defect recovery**
mission, not a license to broadly expand Cafe v2.2 — see §3 for the explicit
boundary.

## 0.2 Founder scope decision (binding — do not re-litigate)

GPT's original brief proposed deferring **both** LINE and email reminder
delivery to a separate post-v2.2 mission, keeping clipboard-copy as a
documented temporary stub through Cafe v2.2 closure.

**The Founder explicitly overrode this for email**, 2026-10-06:

> "делаем Б) ... в этой же миссии добавляем реальную отправку email ...
> а LINE остаётся заглушкой/откладывается до v2.3. почта будет у всех
> сотрудников."

Binding consequence:

- **Email reminder delivery is IN SCOPE for this mission** (real sending,
  not a stub) — see §18-28 as amended.
- **LINE reminder delivery stays OUT of scope**, deferred to a v2.3 LINE
  integration mission (unchanged from GPT's original brief).
- Every employee is expected to have a registered email address (Founder's
  own statement) — do not design the primary path around "email missing"
  as a common case, but the write path must still degrade safely (log/flag,
  never crash) for the rare row that lacks one, since `email` is nullable in
  the schema (`workforce.employees.email_encrypted`).
- **Email provider: Resend** (Founder-selected, 2026-10-06 — recommended by
  the Lead Agent as the standard choice for a Next.js/Vercel stack: simple
  REST API, official Vercel integration, strong deliverability, free tier
  sufficient for this volume). **Setup already DONE by the Founder, same
  day**: sending domain `notifications.oruwa.jp` created and DNS-verified
  (DKIM/SPF/DMARC added at XServer, deliberately separate from the
  pre-existing `auth.oruwa.jp` domain Supabase Auth uses for its own
  emails); a **Sending access**-only API key issued and stored as
  `RESEND_API_KEY` in Vercel across Production/Preview/Development; project
  redeployed. The key was never pasted into chat and is not in this repo —
  read it from `process.env.RESEND_API_KEY` server-side only. **Do not ask
  the Founder for this key**, it is already live in the environment.
  (Side note, not this mission's problem to fix: the Founder observed the
  older `auth.oruwa.jp` Resend key shows 0 uses in 2 months, suggesting
  Supabase Auth's own emails may not actually be relayed through it — worth
  a quick sanity check if there's spare attention, otherwise leave it and
  register as deferred debt if confirmed to be a real gap.)

## 0.3 Lead Agent pre-verification (2026-10-06, read this before re-auditing)

The prior session (same Founder Acceptance mission) read the actual code
before handing this off, to save the new session's audit time. Treat the
following as VERIFIED, not to be re-derived from scratch — but still
re-confirm live once implementation starts, since code can drift between
sessions:

- **CONFIRMED real defect, worse than GPT's own description**:
  `apps/web/src/app/(protected)/staff/monthly-shift-preference-modal.tsx`.
  The cycle-tap UI only has two states (`null` = "not working" per its own
  code comment, or a concrete shift type) — there is no third
  "explicitly unavailable" state exposed at all, and
  `submitMonthlyShiftPreferences` is always called with
  `isUnavailable: false` (line ~123). Worse: `handleSubmit` filters
  `selections` to `value !== null` before submitting (line ~116) — a day
  the Staff member left at "not working" produces **zero persisted row**,
  not an `is_unavailable = true` row. The UI's own code comment
  ("A blank day already means 'not working' — no separate 'unavailable'
  state to explain") is incorrect: a blank day is indistinguishable from a
  day the Staff member never looked at, both are "no preference" to every
  downstream reader. This is exactly GPT's §5 worry, confirmed concretely.

- **CONFIRMED already correct, contrary to GPT's §15 worry**: the real
  auto-distribution engine (`packages/workforce/src/auto-distribute.ts`,
  NOT `apps/web/src/lib/workforce/auto-distribute.ts`, which is a thin
  re-export shim since the 2026-09-04 Auto Scheduling completion mission)
  already treats `isUnavailable` as a hard exclusion — see its own code
  comment "Rule 3: isUnavailable is a hard exclusion, not an 'unplaced'
  outcome." The gap is entirely upstream (the UI never lets Staff set that
  flag, per the point above), not in the scheduling engine itself. Do not
  spend time re-auditing the engine's exclusion logic; spend it on the UI
  and the write path.

- **CONFIRMED safe to reuse without a migration** (answers GPT's §11/§29
  question): `workforce.shift_requests` already has `status`
  (`workforce.request_status` enum: `pending | approved | rejected |
  cancelled`, migration `0009`) and `decided_by`/`updated_at`, shared
  across every `kind` (`swap`/`correction`/`preference`). No code anywhere
  currently reads `status` on a `kind = 'preference'` row (confirmed by
  reading `runAutoDistribution` in `apps/web/src/lib/workforce/schedule-actions.ts`,
  which consumes every submitted preference unconditionally, regardless of
  status) — so repurposing `status` for a Manager "reviewed" marker on
  preference rows is safe, no cross-kind side effect. The enum's own value
  name is `approved`, not `reviewed` — GPT's §11 concern about wording
  implying a confirmed schedule is legitimate; resolve it in **UI copy**
  (show "確認済み"/"Reviewed", never "承認済み"/"Approved a schedule"), not
  by adding a new enum value, unless the new session finds a concrete
  reason a new value is actually needed.

- Manager-side write policy (`wf_shift_requests_write`, migration `0009`)
  is keyed to `workforce.request.manage` and already covers every `kind`
  including `preference` — a Manager "mark reviewed" write does not need a
  new RLS policy, only a server action that sets `status`/`decided_by` on
  an existing row, gated the same way every other Manager write already is.

- `workforce.employees.email_encrypted` is server-side PII-encrypted
  (`apps/web/src/lib/workforce/employees.ts`) — the email reminder send
  must happen entirely in a `'use server'` action that decrypts it
  server-side, calls Resend, and returns only a delivery-result boolean to
  the client. Never return the decrypted address to the client just to
  render "has email" — that would leak PII unnecessarily across the wire.

## 1. Maximum autonomy

Same as every Founder Acceptance bounded-fix round in this chat so far: do
not stop to ask permission for investigation, implementation, tests, Browser
QA, independent review, PR creation, CI, or an eligible autonomous `dev`
merge (`scripts/ai-dev-merge.sh`). Use subagents where useful (DB/security
review is mandatory given this touches RLS-adjacent write paths and a new
external secret).

Stop only for a real Founder Gate: `main`, Production, a Cloud migration
apply, a material RLS/auth/security-policy change, destructive DB/Git,
secrets (the Resend API key itself — ask the Founder to paste it, never
generate or guess one), billing, LINE broadcast, or scope expansion beyond
this document.

## 2. First — read-only contract recovery

Before changing anything, recover current repository state (branch, HEAD,
working tree, open PRs — there should be none from this chat currently) and
re-read, in order: `AGENTS.md`, `docs/ai/ORUWA_AI_ENGINEERING_OPERATING_MODEL.md`,
`docs/ai/current-task.md`, `docs/operations/deferred-debt-register.md`, this
file, then the source files named in §0.3 and §9 below. Confirm §0.3's
claims still hold (git state may have moved since 2026-10-06) before
building on them.

## 3. Product meaning — do not confuse these three workflows

**A. Shift Preferences** (this mission's primary focus): before the
schedule exists, Staff tells Manager which shift they prefer, which days
they cannot work, and which days they have no preference. Inputs to
schedule generation, never actual assigned shifts.

**B. Shift Change/Exchange/Cancellation**: after a real shift already
exists, Staff asks Manager to change/exchange/cancel it. Different
workflow (`shift-exchange-requests-popup.tsx` et al.) — touch only if a
genuine Shift Preferences defect requires it; do not expand its own scope.

**C. Attendance Correction**: after work/attendance data exists, Staff asks
Manager to correct clock-in/out/break. Also separate
(`correction-requests-popup.tsx`).

Do not merge these three product concepts.

## 4. Shift preference day contract (target state)

Staff must be able to express three distinct states per day:

- **State A — Preferred shift**: `work_date` set, `shift_type_id` = chosen
  type, `is_unavailable = false`.
- **State B — Unavailable/cannot work**: `work_date` set, `shift_type_id =
  null`, `is_unavailable = true`. Must be distinguishable from no response.
- **State C — No preference**: no submitted row for that date at all.

## 5. The confirmed defect (see §0.3) — fix this

Redesign the monthly cycle-tap UI (or its interaction model, within the
existing architecture — no new scheduling model, reuse existing shift
types) so a Staff member can clearly choose between a preferred shift type,
"unavailable," and leaving a day with no preference, without relying on
color alone. The blank/"not working" cycle option must either be removed in
favor of an explicit "unavailable" option, or itself submit
`is_unavailable: true` (and the `value !== null` submit filter must change
accordingly) — pick whichever reads cleaner in the existing cycle-tap
interaction; do not invent a new multi-step form unless the cycle-tap
genuinely cannot express three states clearly.

Update Staff help text (`HelpIconButton` body) accordingly, JA and EN both:
this is a request/preference, not a confirmed schedule; explain all three
states; already-submitted days remain Staff-locked (§7 below), Manager
builds/reviews the final schedule.

## 6. Submission completeness ("N submitted / M missing")

Audit and document the exact current semantics the Manager popup's
"submitted/missing" count uses (`shift-requests-review-popup.tsx`,
`submittedEmployeeIds`/`submittedCount`). Determine whether "at least one
preference row this month" is an acceptable definition of "submitted" or
whether the product needs to distinguish "started" from "finished
submitting the whole month." Prefer the smallest change that uses the
existing data model; do not add a new table/column unless the current model
genuinely cannot express the needed distinction — if so, say so explicitly
rather than quietly picking an approximation.

## 7. Already-submitted days stay Staff-locked

Confirmed current behavior: `workforce.shift_requests` preference rows are
effectively INSERT-only for Staff (unique index
`wf_shift_requests_one_preference_per_day`, no Staff UPDATE RLS policy, UI
locks already-submitted days). This is an acceptable bounded v2.2 contract
— do not expand Staff UPDATE RLS for this mission. A Staff member who needs
a submitted day changed contacts the Manager, who can decide/edit directly.
If broader self-edit becomes a real need later, record it as deferred debt,
do not build it now.

## 8. Manager Shift Requests grid

Grid must clearly distinguish, per cell: preferred shift type, unavailable,
no preference (currently: a shift chip, "—", or "+" respectively — confirm
this reads unambiguously once §5's fix lands, and that help text explains
the symbols rather than relying on them being self-evident).

## 9. Manager review — make it real

Confirmed defect (§0.3): `approvedRequestIds` is local React state in
`shift-requests-review-popup.tsx`, never persisted. Fix:

- Reuse `workforce.shift_requests.status`/`decided_by`/`updated_at` on the
  preference row itself (§0.3 — confirmed safe, no migration needed) via a
  new or extended Manager-only server action, gated by the existing
  `workforce.request.manage`-keyed write policy.
- UI wording: "確認済み"/"Reviewed," never "承認"/"Approved" (the existing
  `approve`/`approvedPreferenceTitle` i18n keys need new copy, not just a
  relabeled button — audit `manager-dashboard-i18n.ts` for every string
  this touches).
- Reviewed state must **not** alter Auto Schedule priority or create/imply
  a published shift (confirm `runAutoDistribution` still ignores `status`
  after this change — it should, since nothing new reads it there; this is
  a regression-guard assertion, not new logic to add).
- Required persistence test: Manager marks reviewed → close popup → reopen
  → still reviewed → reload page → still reviewed → new session → still
  reviewed. If un-reviewing is supported, same test for removal.

## 10. Auto Schedule integration — verify, likely no engine change needed

Per §0.3, the engine (`packages/workforce/src/auto-distribute.ts`) already
correctly handles `isUnavailable` as a hard exclusion and documents its own
no-preference-fallback rule. This section is about **verifying** the full
path end-to-end after §5's UI fix makes `is_unavailable = true` actually
reachable — not about changing engine logic, unless live testing finds a
real discrepancy from the engine's own documented rules:

1. Preferred shift honored when compatible with constraints.
2. Explicit unavailable → never assigned that day (this is the one that was
   previously untestable, since the UI couldn't produce the input — now
   testable after §5).
3. No preference → fallback behavior matches the engine's own documented
   rule (`assignedWithoutPreference`), surfaced and reviewable by Manager.
4. Manual/published Manager assignments are preserved, never overwritten.
5. Auto-created shifts remain drafts per the existing contract — a Staff
   preference alone never becomes a published shift.

## 11. Email reminder — build this now (Founder decision, §0.2)

Replace `copyReminderMessage` (clipboard stub,
`shift-requests-review-popup.tsx`) with a real send action.

**Target workflow**: Manager clicks "Send reminder" (relabel from "Copy" —
JA `リマインダーを送信`, EN `Send reminder`; final native wording can be
refined later in a copy pass, the semantic action is SEND now) → a
`'use server'` action resolves the target employee's decrypted email
server-side → sends via Resend → returns a delivery result the UI shows
(sent / employee has no email on file / send failed) → no silent "success"
claim on partial or missing data.

**Scope for this mission** (per Founder decision, email only — no LINE):

- Resend account setup is **already done** (§0.2): domain
  `notifications.oruwa.jp` verified, `RESEND_API_KEY` live in Vercel
  (Production/Preview/Development), project redeployed. Read it via
  `process.env.RESEND_API_KEY` server-side only — do not ask the Founder
  for it, do not commit it, do not print it.
- Message content: employee display name, target month, no sensitive staff
  data, no internal IDs (per GPT's original §24, still valid for email
  text).
- Delivery result distinguishes at minimum: sent successfully / employee
  email missing / send failed. (LINE-specific result states from GPT's
  original §22 do not apply now — defer that whole dimension to v2.3.)
- Idempotency: guard against a double-click/retry firing two emails for the
  same reminder action (a simple pending/disabled-while-sending UI state is
  likely sufficient for this bounded scope — do not build a full
  notification-queue/audit-log platform for this one feature; if the
  Founder wants that generalized later, it is separate SaaS Hardening work,
  already tracked loosely in the debt register's audit-logging items).
- This reminder action is employee-targeted only. Do not reinterpret it as
  bulk/mass send — mass LINE broadcast (and by extension any future mass
  email) remains a separate Founder-gated capability, unrelated to this
  mission.

**Explicitly deferred to the v2.3 LINE integration mission** (do not build
now): LINE Messaging API, LINE webhook, LINE OA onboarding, employee LINE
identity linking for delivery purposes (LINE *account linking* for sign-in
already exists and is unrelated — do not confuse the two), combined
LINE+email delivery-result UX, a general notification-queue/audit
infrastructure beyond what this one feature needs.

## 12. Database model

Reuse existing: `workforce.shift_requests`, `workforce.employees`,
`workforce.shift_types`, `workforce.shifts`, `workforce.schedule_settings`,
`api.workforce_shift_requests`. Per §0.3, no new table is expected to be
necessary for §5 (UI/write-path fix), §9 (review persistence), or §10
(verification only). The email feature (§11) needs no new table either —
it is a stateless send action, not a queue — unless live testing surfaces a
real idempotency gap the simple UI-disabled-state guard can't cover, in
which case document why before adding one.

If any part of this turns out to need a Cloud migration after all: that is
a Founder Gate (RED PR, same pattern as migrations `0122`/`0123` earlier in
this Founder Acceptance round — branch, PR, independent DB/security review,
then the Founder merges and applies it themselves).

## 13. Security

Preserve tenant/location isolation, Staff self-scope, existing
`workforce.request.manage` gating, RLS. Staff must not see other employees'
preference/request details beyond current intentional exposure (the shared
roster view). The email action must not leak a decrypted employee email to
the client (§0.3). Do not weaken RLS. Any material RLS change is a Founder
Gate.

## 14. Required live QA

Use real Staff and Manager sessions on this mission's own PR Preview
deployment (not `preview.oruwa.jp` until merged), per the pattern already
established this Founder Acceptance round (branch → PR → CI → live check on
the PR's Preview → independent review where warranted → merge via
`scripts/ai-dev-merge.sh`).

**Staff**: submit a preferred shift on one day, mark one day explicitly
unavailable, leave one day with no preference, submit, reload, reopen,
confirm all three states persist and read correctly; confirm already-
submitted days stay locked; JA and EN sanity; 375×667 and 320×667.

**Manager**: confirm the grid shows all three states distinctly; mark a
preference reviewed, close/reopen/reload, confirm it persists; confirm help
text matches real behavior; send a real reminder email to a real inbox you
control for the test (or a disposable one) and confirm it actually arrives
with correct content; confirm the "no email on file" and "send failed"
paths render sensibly (can be forced by testing against an employee row
with no email, or an invalid Resend configuration briefly, if safe to do
on a Preview deployment — use judgment, don't risk real employee data).

**Auto Schedule**: with safe QA data, confirm explicit-unavailable is now
reachable from the real UI and is genuinely excluded by a real auto-create
run; confirm preferred-shift and no-preference-fallback behavior match the
engine's documented rules; confirm manual/published assignments are
preserved.

## 15. Tests, review, PR, merge

Add/update regression tests (existing `*.test.ts` files for
`schedule-actions`, `auto-distribute`, `shift-requests` are the likely
targets — check `apps/web/src/lib/workforce/*.test.ts` and
`packages/workforce/src/*.test.ts`) for: unavailable persists and excludes;
no-preference fallback unchanged; preferred-shift honored; review persists
and does not affect scheduling; reminder send result states. Run targeted
tests, typecheck, lint, the full `apps/web` suite, build, relevant pgTAP if
any RLS/DB surface changed, Browser QA, CI — target 0 new regressions.

Independent review is **mandatory** here (touches RLS-adjacent write paths,
a new external secret/integration, and PII-handling code) — dispatch both
`oruwa-db-security-reviewer` (write-path/RLS/PII angle) and
`oruwa-ux-i18n-reviewer` (the Staff preference UI redesign and JA/EN copy).
If either finds bounded problems, fix and rerun.

Feature branch → PR → `dev` (never `main`). Merge autonomously via
`scripts/ai-dev-merge.sh` once tests/review/CI are green and no Founder Gate
applies, then verify live on `preview.oruwa.jp` post-merge.

## 16. Return to the acceptance checkpoint

After repair, return the Founder to exactly this QA3 checkpoint (Shift
Preferences / Shift Requests), not a restart of the whole Founder
Acceptance round. Give a concise summary: what was broken, what Staff now
does, what Manager now does, how Auto Schedule uses it, what the email
reminder now does, what remains intentionally deferred (LINE, in full, to
v2.3; anything else deferred in the process, named explicitly with a
DEBT-### entry registered in `docs/operations/deferred-debt-register.md`).

## 17. Final report — required sections

Current defect audit (Implemented/Partial/UI-only/Broken/Deferred) · Staff
preference contract (all three states + submission completeness) · Manager
contract (grid, review, persistence) · Auto Schedule (verified, not
rebuilt) · Data model (confirm no migration was needed, or document the one
that was) · Security (RLS/PII handling for the email path) · Repairs (root
cause → change → verification, one row per defect) · Browser QA results ·
Test results · Review verdict · Integration (branch/PR/merge/final `dev`
HEAD) · **Reminder product state**: email delivery now real and live
(Resend, verified with a real send), LINE still explicitly deferred to the
v2.3 LINE integration mission — restate this exact framing so the next
mission after v2.3 planning doesn't rediscover it from scratch.

Then STOP. Do not start v2.3 LINE work, SaaS Hardening, the clean demo
tenant, or any other new mission without a fresh, explicit Founder prompt.
