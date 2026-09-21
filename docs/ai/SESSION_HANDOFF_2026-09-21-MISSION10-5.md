# SESSION_HANDOFF (2026-09-21) — Mission 10.5 Technical Freeze Closure: PARTIAL, waiting for the Founder

Durable handoff for a **fresh** session. Git, this file and `docs/ai/CAFE_V2_2_TECHNICAL_FREEZE_CLOSURE_REPORT_2026-09-21.md` are the source of truth. VERIFIED = confirmed by tool output on 2026-09-21.

## 1. Repository state (VERIFIED)

- `dev` at the time of writing includes #539 (`95e406c`) plus the docs PR carrying this file. No `main` or Production change.
- **PR #541 (RED, open, not merged):** `supabase/migrations/0122_issues_business_date_and_purchases_module_gate.sql` + `supabase/tests/0063_issues_business_date_purchases_gate_wage_permissions.sql`, branch `feature/migration-0122-clean`. Reviewed (DB/security PASS), local pgTAP 61 files / 1501 tests with only the DEBT-037 baseline failing, 0063 = 27/27. #540 was closed as superseded.
- Cloud DEV: `0000`–`0121` applied, `0122` not applied (read-only `supabase migration list`).
- Local: Docker Desktop and the local Supabase stack run; `0122` was applied by `psql` to the LOCAL DB only.
- Local stale branches from this session (harmless, cannot be deleted by the session): `feature/migration-0122-issues-date-purchases-gate`, `feature/migration-0122-issues-purchases`, `fix/*`, `docs/*` merged.

## 2. Exactly what is open

1. **Founder RED step:** merge #541, apply `0122` to Cloud DEV. Approval text, risk, rollback and pre-apply SQL checks are in report §3.
2. **DEBT-061** (needs Founder input): read-only check of Cloud Data API exposed schemas. Give the public URL and `sb_publishable_*` key in chat, or run the `curl` probe in report §7. Never read `.env` (blocked) and never print keys via the CLI.
3. After the apply, the session should verify live: Staff `select count(*) from api.workforce_staff_manage` is 0 (cannot be done from the browser, the Founder or a SQL session does it), an Issue created after 00:00 JST gets the local date, Inventory OFF blocks order/receive, and the Manager staff list/edit/wage still work.

## 3. Decisions taken this mission (for the record)

- Reuse the existing `workforce.employees.hourly_wage_yen`; no schema change for the wage.
- Tri-state parsing (absent = leave unchanged, blank = clear, value = set) for wage, notes, position, employment type; UPDATE carries only sent columns.
- Estimated labour cost definition unchanged (current-month completed clock pairs x each employee's own rate); missing rate shows "—" or a "N not included" note instead of 0 yen.
- The Staff-readable wage was found by independent review and reproduced locally; it is fixed in `0122` Part C, not in the app.

## 4. Tooling notes

- Reviewer subagents share the working tree and may detach HEAD or switch branches; re-check `git status -sb` after they finish and before committing.
- `cat >> file` on a branch that does not contain the file creates a partial file; use the Edit tool on the right branch.
- P0004 is `assert_failure` in PL/pgSQL: `WHEN OTHERS` does not catch it in pgTAP helpers, use `WHEN assert_failure`.
- The Staff own-shift cell for today does not open by design (needs a report or "!"), so a correction request for today cannot be started from it.

## 5. Read first

`AGENTS.md`, Operating Model v1.9.0, `docs/ai/current-task.md`, the debt register (section E), the Mission 10.5 report. Do not start Founder Acceptance, SaaS Hardening, the clean demo tenant or Production work without a fresh Founder prompt.

No secrets, passwords or keys are recorded in this file.
