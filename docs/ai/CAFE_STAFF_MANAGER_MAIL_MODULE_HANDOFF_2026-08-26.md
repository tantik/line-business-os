# Cafe Staff↔Manager Mail Module — Handoff (2026-08-26)

Read this first if anything about the Manager/Staff "メール" (Mail) module,
`workforce.staff_messages`, the "要確認" panel's mail chip, or the deleted
Daily-message card comes up.

## 1. What this mission was

A Manager+Staff combined QA pass on `preview.oruwa.jp` (first session with a
working chrome-devtools MCP browser tool for this product) found that
Staff's "今日のメッセージ" (daily message to the manager) card was a dead
end: it wrote into `workforce.attendance.daily_message`, a column only ever
displayed to a Manager by accident, inside the Correction Requests popup,
and only when a correction happened to reference that exact attendance row.
Confirmed live, not speculative — a real communication channel that looked
like it worked from the sender's side and silently went nowhere.

The Founder, over several rounds of discussion the same session, expanded
this from "fix the Manager-visibility gap" into a full two-way messaging
module:

- Full message history (new table, not a patch on the single-value column).
- **Bidirectional from the start**: Staff↔Manager, not Staff→Manager only.
- Manager's mailbox: all staff at once, as per-employee conversation
  threads (unread badge per employee) inside the existing "要確認" panel,
  a persistent chip after "在庫不足" whose unread count also folds into the
  panel's Level-1 total.
- Staff's mailbox: a 4th entry-point button (`Recipes/Inventory/Purchases/
  Mail`), replacing the deleted Daily-message card entirely.
- **Archive only, no per-message Delete** — corrected mid-build by the
  Founder ("давай не будем удалять сделаем только в архив"). The
  `deleted_at` column/RLS/guard-trigger allowance still exist in the schema
  (harmless, already pgTAP-tested) but no UI or action calls it.
- LINE push notifications on new messages are explicitly out of scope now,
  but `queueLineNotification()` gets a new inert `'staff_message'` type so
  a future platform-wide LINE integration lights this up with no further
  code change here.

## 2. What shipped — PR #444 (`feat/staff-manager-mail` → `dev`)

4 migrations, in order:

- **0090** — `workforce.staff_messages` table: one thread per `employee_id`,
  `sender_role` staff/manager, guard trigger (only
  `is_read`/`read_at`/`read_by`/`archived_at`/`deleted_at`/`updated_at` may
  ever change post-insert), a stamping trigger for `read_at`/`read_by` on
  UPDATE, full RLS (self select/insert/update, manager select/insert/update
  via the existing `workforce.attendance.manage` permission key — no new
  permission key), `api.workforce_staff_messages` passthrough view.
- **0091** — `staff_messages` joins the existing
  `permanently_delete_employee` history guard (same block-don't-cascade
  behavior as shifts/attendance/requests/exchanges) — **not** a cascade
  purge. See §4 below for the larger deferred privacy-purge item this
  surfaced.
- **0092** — **the important one if this module ever looks broken again**:
  fixes a real bug found via live QA (not caught by pgTAP or the app's own
  mocked unit tests) where `sender_user_id` was `not null` but nothing ever
  set it — the app-layer insert never included it, and 0090 only stamped
  `read_at`/`read_by` (on UPDATE), not `sender_user_id` (on INSERT). Every
  real send failed RLS ("new row violates row-level security policy")
  until this migration added a BEFORE INSERT trigger that fills
  `sender_user_id` **only when NULL** (COALESCE, not an unconditional
  overwrite — a raw fixture/seed insert that already supplies a value
  passes through untouched; a forged non-NULL value from a real
  authenticated caller is rejected by RLS, not silently corrected).

App layer: `lib/workforce/staff-messages.ts` /
`staff-messages-input.ts` / `staff-messages-actions.ts` (new),
`manager/staff-messages-popup.tsx` (new, two-level thread-list→thread-view),
`staff/staff-mail-popup.tsx` (new, single-thread), `manager-dashboard-client.tsx`
/ `attention-panel.tsx` / `staff-dashboard-client.tsx` (wired in),
`daily-message-form.tsx` + `transport-message-row.module.css` (deleted).

**All 4 migrations are pushed to Supabase Cloud dev
(`pehcoenozjtsjdvjietj`)** — Founder-approved twice this session (0090/0091
together, then 0092 separately after it was found). `preview.oruwa.jp` and
this PR's own Vercel Preview both run against that same Cloud project (not
an ephemeral per-branch DB), confirmed by inspecting the auth cookie's
project ref.

## 3. Verification state

- Local: `tsc`/`eslint`/1262 unit tests (`npm test`, apps/web)/`build`/
  `db:reset`+`db:test` (repo root) — all green except the same 5
  pre-existing baseline pgTAP failures (`0002`/`0006`/`0008`/`0012`/`0023`)
  confirmed present even on a clean checkout with none of this branch's
  migrations applied. New pgTAP coverage: `0039_workforce_staff_messages.sql`
  (structure/RLS/guard-trigger/cross-tenant/sender-stamping), extended
  `0024_workforce_employee_permanent_delete.sql` (a `staff_messages`-only-
  history employee blocks Permanent Delete too).
- **Live chrome-devtools MCP QA, both directions, fully passed** on PR
  #444's Vercel Preview (after the 0092 fix + Cloud push): Staff A sent a
  message → Manager's mail chip badge appeared, folded into the panel
  total (9→10), thread list showed the correct sender/preview/timestamp,
  opening the thread marked it read (badge back to 9) → Manager replied →
  Staff's own "メール" entry-point button picked up the unread count
  ("メール 1") and showed the reply correctly bubble-aligned.
- CI (`typecheck / test / build / lint` + Vercel) green on the final commit.

## 4. Deferred / explicitly out of scope (not forgotten, not silently dropped)

- **Real privacy-purge cascade for `permanently_delete_employee`** — the
  Founder's stated long-term intent (0091's header only makes the existing
  block-on-history guard consistent, it does not implement this): a real
  "let go" purge should strip PII but **keep the employee's display name**
  attached to historical shift/attendance records (payroll/schedule history
  stays legible), and fully delete everything else including Mail threads.
  This has real Japan APPI/labor-record-retention legal weight the Founder
  explicitly flagged as needing careful design, not improvisation. Full
  detail in the `project_permanent_delete_privacy_purge_future` memory —
  **read that before touching `permanently_delete_employee` again.**
- **Reply/compose is Manager-side only for now in terms of UI depth** — the
  schema is fully bidirectional (by design, so no second migration is
  needed later), and Manager can already reply from the popup (shipped,
  live-QA'd). What's NOT built: nothing further — Staff can also compose
  freely into their own thread. This module is complete as scoped, not a
  partial delivery.
- **Per-message Delete** — deliberately not built (Archive only). If a
  future session is asked to add it, the schema/RLS/guard-trigger already
  support it (`deleted_at`, `wf_staff_messages_self_update`/
  `_manage_update` already allow it) — only the UI action + wiring is
  missing, same pattern as `handleArchive`/`archiveStaffMessageAction`.

## 5. State as of this handoff

**PR #444 is MERGED** — squash-merged into `dev` by the Founder directly via
the GitHub UI (commit `af5193f`, 2026-08-25 21:34 UTC), after all
verification was green and live chrome-devtools MCP QA passed both
directions (§3). I had attempted `gh pr merge 444 --squash --delete-branch`
myself first; that specific tool call was declined in the permission UI —
not a rejection of the merge decision (the Founder had already said "и в
дев мержи"), just a preference to do the actual click themselves. The
module is live on `dev`, Cloud dev DB already has all 4 migrations (§2), and
`preview.oruwa.jp` should reflect it on its next deploy from `dev` (not
independently verified post-merge — a fresh session picking this up should
do a quick sanity check there before assuming it, same as any other
post-merge state).

The local `feat/staff-manager-mail` branch was left in this session's
working directory; delete it locally (`git branch -d feat/staff-manager-mail`
after `git checkout dev`) if a fresh session finds it stale/confusing — the
remote branch was already deleted by the squash-merge.

## 6. Verification commands (apps/web + repo root)

```
cd apps/web && npx tsc --noEmit && npx eslint . && npm test && npm run build
cd .. && npm run db:reset && npm run db:test   # local only
npm run db:migrate                              # Cloud push -- NEVER without fresh explicit Founder approval, even for a small follow-up fix
```
