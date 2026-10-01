Archived verbatim from `docs/ai/current-task.md` §5, as it stood 2026-09-21
through 2026-10-01, before being replaced by the 2026-10-01 Founder
Acceptance QA1/QA2 update. Kept for history only — do not treat as current.

---

## 5. Current stage and exact next gate

**As of 2026-09-21** (checked against git; `dev` includes PR #536, #537, #539):

- **Full Integrated Acceptance (Phase 4) is CLOSED WITH GAPS.** Report:
  `docs/ai/CAFE_V2_2_FULL_INTEGRATED_ACCEPTANCE_REPORT_2026-09-21.md`.
- **Start a new session from `docs/ai/SESSION_HANDOFF_2026-09-22.md`** (consolidated
  state, plan, tooling notes, bootstrap prompt).
- **UPDATE 2026-09-22: Mission 10.5 is CLOSED. Founder Technical Freeze readiness:
  PASS.** The Founder merged PR #541 and applied `0122` to Cloud DEV; verified
  live (Staff reads 0 rows from `api.workforce_staff_manage`, Manager
  read/write ok, a new Issue at 03:04 JST got 営業日 2026-09-22, Data API exposes
  only `public`, `graphql_public`, `api`). The next and final Cafe v2.2 mission is
  Founder Acceptance (not started); the Technical Freeze itself is the
  Founder's decision. The two-step text below is historical for this mission.
- **Mission 10.5 Technical Freeze Closure was PARTIAL, blocked by a Founder gate (2026-09-21).**
  Report: `docs/ai/CAFE_V2_2_TECHNICAL_FREEZE_CLOSURE_REPORT_2026-09-21.md`;
  handoff: `docs/ai/SESSION_HANDOFF_2026-09-21-MISSION10-5.md`. Done and merged:
  PR #539 (individual hourly rate in the Manager staff form on the existing
  `hourly_wage_yen`, DEBT-052 wage/notes erase fixed, estimated labour cost never
  counts a missing rate as 0 yen; live-verified with two different rates).
- **Two Founder steps remain (RED / input):** (1) merge PR #541 and apply
  migration `0122` to Cloud DEV (Issues `business_date` in the location
  timezone, Inventory module gate restored on Purchases writes, and DEBT-062:
  `api.workforce_staff_manage` was readable by Staff, exposing coworkers' wage);
  (2) DEBT-061 for Cloud DEV is VERIFIED PASS (2026-09-21: only `public`,
  `graphql_public`, `api` exposed); the Production project is still to be
  probed (T-PROD). Do not enter real wages before `0122` is applied.
- **Cafe v2.2 is NOT declared CLOSED.** Founder Technical Freeze readiness becomes
  PASS after those two steps; Commercial Release remains a separate Founder
  decision (DEBT-053 copy/allergen wording, DEBT-001 to DEBT-004 demo data,
  DEBT-035/036/043 production path, DEBT-049 second tenant). Next and final
  Cafe v2.2 mission: Founder Acceptance (not started).
- Production and `main` are untouched and separately gated.
