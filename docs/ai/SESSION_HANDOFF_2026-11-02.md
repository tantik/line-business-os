# Session handoff 2026-11-02 — DEBT-135 closed (`/staff` 21 → 4 requests per view)

## 1. State

- `dev` has #673 (`api.staff_dashboard`, 0145). **0145 is on Cloud DEV** (`db push --linked`, verified: invoker, anon no execute, authenticated execute, `inventoryActiveItems` present).
- Review follow-ups from the 10-30B handoff §3.1 a–d done (own `inventoryActiveItems` part; accepted cap documented; 0084 isolation asserts with no-error checks and positive controls; `groupItemResponsesByInstance` reuse + `responsesForInstances`).
- Load script `errors: 30` was Git Bash rewriting `LOAD_PAGES=/staff` into a Windows path (ENOTFOUND). Pass pages without the leading `/` (`LOAD_PAGES=staff`); errors are now counted by reason.
- Debt register: DEBT-135 DONE; new DEBT-136 (receipts, Founder 2026-11-01), DEBT-137 (self-serve sign-up), DEBT-138 (demo schedule on deactivated employees).

## 2. Evidence

| Check | Result |
|---|---|
| pgTAP local | full suite 82 files / 2952 PASS; 0084 after the last asserts 145/145 |
| CI on #673 | typecheck/test/build/lint, pgTAP, Vercel — all pass |
| apps/web | tsc clean, `npm test` 1233/1233, eslint on changed files clean |
| oruwa-db-security-reviewer (round 2) | no blocker/major; 3 test-strictness minors fixed |
| Measure before (dev, 06:00 UTC) | 47 `/staff` views as staffa: 989 PostgREST = **21.0 / view**, avg 1.22 s |
| Measure after (07:41 UTC) | 44 views: 176 = **4.0 / view**, avg 1.42 s; RPC mean 444 ms (assignments ≈ 214 ms) |
| Background drift | +2 calls in 1 h — negligible |
| Live check preview.oruwa.jp | Manager on `/staff` + staffa (isolated devtools context): every popup has data, no error banner, no console error |

## 3. Founder remark — staff must see coworkers' shifts

Works in code (0059: active coworkers' published shifts are visible). On `oruwa-cafe` all assigned shifts belong to deactivated old fixtures, active QA staff have none → empty coworker grid. Proven live by inserting two published shifts for staffb/staffc (visible on staffa's grid at once), then deleting them. Data fix = DEBT-138.

## 4. Next (order)

1. DEBT-138 data fix if a Founder QA/demo on `oruwa-cafe` is near (small).
2. DEBT-128 (B-0) → DEBT-103 (b)(c) → 4D → production pack.
3. DEBT-136 (receipts) before the 飲食店プラン is closed for launch.
4. Commercial stages 4–5 with the Founder (legal drafts + site).
