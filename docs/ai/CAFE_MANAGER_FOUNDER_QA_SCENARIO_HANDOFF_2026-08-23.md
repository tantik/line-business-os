# Founder QA Scenario — Handoff (2026-08-23)

Mission: **ORUWA Cafe Founder QA Scenario** (Founder-directed 2026-08-23,
between Manager Final Completion Phase A and Phase B). This handoff covers
that mission: **DONE, dataset persistent, Phase B still NOT STARTED**.

Read this file first if continuing Manager Final Completion work. Read
`docs/ai/CAFE_MANAGER_FINAL_COMPLETION_HANDOFF_2026-08-23.md` too — Phase B
(full CRUD/workflow/reactivity/performance QA) is still the next mission,
scoped there, and this session did not start it.

## 1. What this session did

Prepared a persistent, realistic Founder QA dataset on the `oruwa-cafe`
reference tenant (`72b81b2f-9ba5-4a4a-a296-02e32d4682b8`, location
`4bad308e-f8d3-4c20-a158-b6eb3bafa71b`), Preview project
`pehcoenozjtsjdvjietj` / `line-business-os-dev`,
`https://preview.oruwa.jp/manager` + `/staff`.

**Mechanism: real UI (Manager + Staff), not the DB fixture script** — see §2
for why. Everything below is now live, persistent data (not removed):

- **Staff**: 5 active employees. 佐藤陽介, 田中美咲, 鈴木健太 pre-existed.
  Added 山田花子 (`staffId e6ce2f65-e0f4-49e2-b5e2-02ba9911982e`, NOT
  SUBMITTED preferences by design) and 高橋直人 (assigned a real Shift
  Type 2 coverage shift on Thu 2026-08-27, also NOT SUBMITTED).
- **Weekly Schedule**: current week (08-17–08-23) and next week
  (08-24–08-30) both already had a realistic mix of predefined/custom
  shifts, empty cells, shortage, unavailable-conflict — pre-existing, not
  touched beyond the one new assignment above.
- **Shift Preferences**: was 3/3 submitted with no colored shift-type chip
  anywhere (Phase A's known gap). Now 3/5 submitted (2 new employees
  correctly NOT_SUBMITTED). Attempted a real shift-type preference via
  田中美咲's real Staff login (`konstantin.a.chvykov@gmail.com` — credentials
  already documented in `CAFE_MANAGER_PARITY_MISSION_COMPLETE_HANDOFF_2026-08-19.md`
  §5) — this **surfaced a product bug**, see §3.
- **Inventory**: was 5 items (one junk-named `test5`). Now 9: renamed
  `test5` → 氷（製氷機用）(now an exact-at-reorder-point boundary case),
  and added 紅茶葉（アールグレイ）(near-minimum), キャラメルシロップ
  (above-target), 蓋（Lサイズ）, グラニュー糖 (both normal OK). Shortage
  math verified live: shortage flags when `actual ≤ reorder_point`;
  displayed deficit = `target − actual`.
- **Recipes/Manuals**: was 6 (4 junk-named `test2`–`test5`, 2 real:
  カフェラテ, 抹茶ラテ). Renamed all 4 junk ones to realistic content:
  エスプレッソマシンの清掃手順, レジ締め手順 (both 手順書), アイスコーヒー,
  抹茶と黒蜜のクリームフラペチーノ（季節限定メニュー）(both レシピ,
  short/long title and instruction variety).
- **Needs Attention** (8 total: 2 corrections, 1 exchange, 2
  unavailable-conflict, 3 inventory shortage), **Attendance corrections**,
  **Shift Exchange** — all pre-existed live before this session, not
  created by it. Likely from `oruwa-cafe-fixture-write.ts` (WP-10) run by
  an operator with Cloud credentials at some earlier point — not
  reproduced or re-verified as coming from that tool specifically.

Mobile 390px and JA/EN toggle spot-checked live — no horizontal overflow,
chrome translates correctly (staff/recipe names stay Japanese content, as
expected).

## 2. Why UI, not the fixture script — credential gap (still open)

`packages/db/scripts/oruwa-cafe-fixture-write.ts` (WP-10, PRs #337/#339) is
the existing idempotent mechanism for QA rows needing service-role bypass
(corrections/exchange/unavailable-conflict/inventory-shortage-item). It
**could not run from this session**: `SUPABASE_SERVICE_ROLE_KEY`,
`SUPABASE_URL` (non-public), `DATABASE_URL`, and `ORUWA_CAFE_MANAGER_PASSWORD`
are not present in any repo `.env*` file (only `NEXT_PUBLIC_*`/anon values
are). A prior session or the Founder must have run it manually with
credentials supplied outside the repo. Anything a future session wants to
add via that script will hit the same wall unless the operator supplies
those env vars for that session.

Chrome DevTools MCP's default (non-isolated) launch also failed
("browser already running") even though no OS process actually held that
profile — worked around with `new_page({ url, isolatedContext: '<name>' })`,
then `select_page`/`navigate_page` on the default-context page (uid=1) to
reach the already-authenticated Manager session. Use the same pattern if
this recurs.

## 3. Product bug found (NOT fixed — Phase B scope, not this mission's)

**Shift preference submission does not link to the real Shift Type.**
Live-reproduced: signed in as 田中美咲 (real Staff account), submitted a
preference for 2026-08-24 selecting the existing "2 (07:00-17:00)" option
in the normal `<select>`. The submitted-preferences list then showed the
raw value `CUSTOM_1787307319277` instead of a reference to Shift Type 2.
In the Manager's Shift Preferences popup, that same cell renders as a
plain grey "2" — no color, doesn't match the shift-type legend. This is
exactly the `CUSTOM_*`/internal-code leak the original mission brief (this
same day, the Founder QA Scenario instructions) warned about. Reproduced
through the fully official flow, not a tooling artifact. **Classify as a
P0/P1 candidate for Phase B** — likely the preference-submission action
always mints a fresh custom shift-type id instead of writing the selected
tenant `shift_type_id`. Not investigated further (no code read, no fix) —
this mission's scope was data, not product bugs.

## 4. Repeatability

Nothing here is a script — it's real rows created by hand through the
product's own Manager/Staff UI, so there is no "rerun" for what this
session added. If Phase B or a later QA pass needs *more* of this kind of
data (more staff, more inventory items, more recipes), repeat the same UI
steps, or — if Cloud credentials are available in that session — extend
`oruwa-cafe-fixture-write.ts` for the service-role-only rows (preferences
with a real `shift_type_id`, in particular, given the bug in §3 makes the
UI path currently produce broken data for that one case).

## 5. What NOT done this session

- Did not start Phase B (full CRUD/workflow/reactivity/performance QA) —
  see `CAFE_MANAGER_FINAL_COMPLETION_HANDOFF_2026-08-23.md` §2 for its
  scope.
- Did not fix the §3 product bug.
- Did not touch git/PR/CI — no repository changes were needed (UI-only
  session).
- Did not resolve the missing-Cloud-credentials gap (§2) — flagged, not
  fixed; likely needs a Founder decision on how a session gets scoped,
  time-limited service-role access when it genuinely needs one.

## 6. Bootstrap prompt for the next session

*"Read `docs/ai/CAFE_MANAGER_FOUNDER_QA_SCENARIO_HANDOFF_2026-08-23.md`
first (Founder QA Scenario dataset, done), then
`docs/ai/CAFE_MANAGER_FINAL_COMPLETION_HANDOFF_2026-08-23.md` (Phase A done,
Phase B scope). Execute Phase B: full Manager CRUD/workflow QA per that
handoff's §2 — the QA dataset needed to exercise it (staff, schedule,
preferences, inventory, recipes, Needs Attention) is now live on
`preview.oruwa.jp`. Also independently verify and, if confirmed, fix the
shift-type-preference-submission bug documented in this handoff's §3
(P0/P1 candidate) as part of Phase B's ordinary bug-fix authority. Work
autonomously per the standing DEV MERGE authority; escalate only at genuine
RED boundaries."*
