# SESSION_HANDOFF (2026-10-07) — Shift Preferences recovery + email reminder, then full functional QA of every block except LINE

Continues Founder Acceptance (Mission 11), after `SESSION_HANDOFF_2026-10-06.md`.
VERIFIED = confirmed live in a real authenticated browser session (Manager
`manager@oruwa-cafe.test`, Staff A 田中 美咲, Staff C 鈴木 健太) on a PR Preview
or `preview.oruwa.jp`, against Cloud DEV data, unless stated otherwise.

## 1. Git state

- `dev` HEAD `ff1a9ce` after #559 (plus this docs PR). No migration in any PR
  of this session. `main` and Production untouched.
- PRs: #557 (Shift Preferences recovery + real email reminder; merged by the
  Founder before live QA finished), #558 (320px follow-up; merged by the
  Founder), #559 (full-QA fixes; merged via `scripts/ai-dev-merge.sh`).

## 2. Mission 1 — Shift Preferences recovery + email reminder (brief `CAFE_V2_2_SHIFT_PREFERENCES_RECOVERY_AND_EMAIL_REMINDER_BRIEF_2026-10-06.md`)

Status: **CLOSED WITH GAPS** — gap: a real reminder email was not delivered
(DEBT-073, Vercel env). Everything else VERIFIED.

| Defect | Root cause | Change | Verification |
|---|---|---|---|
| Staff "not working" day produced no row | modal had two states, filtered `null` before submit | three states: — (no row) / 休み (`is_unavailable`) / shift; parser enforces exactly one | live: 11/3=1, 11/4=休み, 11/5=2 saved and locked after reload |
| Manager 承認 was local state | `approvedRequestIds` useState | `markShiftPreferenceReviewed` writes `status` on the preference row (existing column), copy 確認済み | live: mark → close/reopen → reload → still ✓; un-mark persists too |
| Popup and Settings card counted the current month | `todayIso.slice(0,7)` | next month by default + 今月 toggle | live: "来月分 1/5名提出済み" |
| Reminder was a clipboard stub | stub | Resend REST send, address decrypted server-side only, outcomes sent / no_email / failed / not_configured, per-dialog idempotency key | live: preview text correct; `not_configured` shown honestly on both Previews → DEBT-073 |
| Off label clipped at 320px | ~20px day column | one-glyph 休 + corner ✓ badge | live: scrollWidth == clientWidth |

Auto Schedule (VERIFIED live, week 11/2–8): preferred shift honoured
(11/3 → 1, 11/5 → 2), 休み excluded (11/4 empty), no-preference day filled and
listed under 希望未提出のまま割り当て, drafts invisible to Staff, undo works.
Review status does not affect scheduling (source-guard test).

## 3. Mission 2 — full functional QA (Founder request 2026-10-07: "every block, real events, Manager ↔ Staff both ways")

| # | Block | What was done live | Result |
|---|---|---|---|
| 1 | Sign-in, roles | Manager, Staff A, Staff C sign-in; Staff → `/manager` | PASS (Access denied page is English-only: DEBT-053; Staff B password failed: DEBT-079) |
| 2 | Weekly schedule | Manager assigned 10/7, 10/8, 10/9; changed 10/9 with the "already visible" confirm | PASS — Staff saw changes without reload (2.5s poll), weekly hours correct |
| 3 | Shift preferences | see §2 | PASS |
| 4 | Auto-create + publish | auto-create 11/2–8, publish week (new), Staff sees the week | PASS after #559 (publish was missing) |
| 5 | Exchange / change / cancel | Staff requested exchange for 10/8 → Manager nominated 佐藤 → approved | PASS — moved to 佐藤, Staff view updated live; past-dated requests now marked 期限切れ, Reject only |
| 6 | Attendance correction | Staff requested 07:00–12:00, break 15 for 10/6 → Manager approved | PASS — attendance applied, 承認済み shown to Staff |
| 7 | Clock in/out, transport, earnings | clock-in 15:02, transport ¥480 (autosave, persists), clock-out with break 0 | PASS — earnings now exact (was rounded, fixed in #559) |
| 8 | Mail | Staff → Manager → Staff | PASS — unread counts both sides; Staff badge now live (30s poll, #559) |
| 9 | Staff management | create QA employee (with wage), edit (wage kept), invite, revoke, permanent delete | PASS — invite email delivery to `+qa1007` not confirmed (Founder inbox) |
| 10 | Recipes | create published recipe linked to 牛乳 200 mL | PASS — Manager sees cost ¥60 + allergen 乳; Staff sees allergen, no cost, no edit; DeepL EN title |
| 11 | Inventory | Staff counted 牛乳 2 L → shortage | PASS (row updates ~5s after "saved": DEBT-077) |
| 12 | Purchasing | Staff ordered 8 L → Manager received 8 L | PASS — stock 10 L, who-did-it visible to Manager only |
| 13 | Operations / HACCP | Staff completed 日次清掃; Manager set fridge 0–5 °C; Staff saved 8/9 °C → exception → Manager resolved | PASS after #559 (Staff warning + localized exception with current value) |
| 14 | Issues & Handover | Staff reported important issue → Manager acknowledged → resolved | PASS (reporter shows role, not name: DEBT-075) |
| 15 | Attention panel | counts moved with every event above | PASS |
| 16 | Weekly Review | prev/current week numbers matched today's events | PASS (~1.1s open) |
| 17 | Settings | shift type add / deactivate / delete with confirms | PASS |
| 18 | EN, mobile, isolation | EN toggle, 320/375 Staff + Manager, Staff C sees only own Mail and cannot open others' shifts | PASS |
| — | Monthly auto-schedule worker | not observable | NOT TESTED → DEBT-074 |
| — | LINE | excluded by the Founder | — |

## 4. Coverage matrix (Operating Model §19)

| # | Dimension | Status |
|---|---|---|
| 1 | Tenant/location isolation | VERIFIED (Staff C isolation live; RLS read by the DB/security reviewer for every new read/write) |
| 2 | Roles | VERIFIED (Manager, Staff, Staff → /manager denied) |
| 3 | Live role QA | VERIFIED (real mutations as Manager and two Staff) |
| 4 | JA/EN | VERIFIED |
| 5 | Viewports | VERIFIED 320/375/1280; 768 NOT TESTED this round (DEBT-042 covers Staff 768/1440) |
| 6 | States | VERIFIED (pending, double click, not_configured, stale exchange, empty submit) |
| 7 | Data realism | VERIFIED; QA residue registered (DEBT-080) |
| 8 | A11y | partial — aria fixes shipped; full keyboard audit stays DEBT-009 |
| 9 | Performance | Weekly Review ~1.1s; no new heavy reads (Mail poll 30s, visible tab) |
| 10 | Design system | legacy theme files touched in place, no new legacy components (DEBT-011) |
| 11 | Security/privacy | VERIFIED by reviews; no PII in logs; audit rows still missing (DEBT-071/056) |
| 12 | Rollout | no migration; no RLS change |
| 13 | Extension impact | email sender and publish are tenant-agnostic |
| 14 | Neighbours | Weekly Review "unresolved requests" now drops reviewed preferences (intended) |
| 15 | Docs | this file, `current-task.md` §5, debt register DEBT-069..082 |

## 5. Founder actions needed

1. **Vercel**: make `RESEND_API_KEY` available to the **Preview** runtime of
   project `line-business-os-web` (check environment scope is not limited to
   one branch, exact name, then redeploy). Then ask the Lead to re-run the
   reminder send on `preview.oruwa.jp` (DEBT-073).
2. Check inbox `konstantin.a.chvykov+qa1007@gmail.com` for the Supabase invite
   sent 2026-10-07 15:4x JST (answers DEBT-072 too).
3. Staff B password (DEBT-079).
4. Decide QA residue clean-up / seeded demo tenant (DEBT-080 with DEBT-004).

## 6. Next

Return the Founder to the QA3 checkpoint. Do not start v2.3 LINE, SaaS
Hardening or the demo tenant without a fresh Founder prompt.
