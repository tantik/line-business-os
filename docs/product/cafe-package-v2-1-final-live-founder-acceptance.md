# Cafe Package v2.1 — Final Live Founder Acceptance

**Date:** 2026-08-10

**Environment:** authenticated `https://preview.oruwa.jp` only

**Release baseline:** `dev` at `62a850d866ff1ef537062f9a7202e37e73bd71af` (PR #201 merged)

**Decision:** **FAIL**

This is a live, role-isolated regression of the five Founder Acceptance fixes
and the bounded Cafe v2.1 final smoke. It is not a production audit, a full RLS
audit, or a Commercial Release declaration.

## 1. EXECUTIVE RESULT

**Overall: FAIL**

FA-01, FA-02, and FA-04 passed live. FA-03 failed because an approved
attendance correction was recorded as `Approved` but did not update the
attendance record. FA-05 failed because focus was not restored after the
Manager confirmation Cancel path. The mandatory Manager 390×844 gate is also
blocked: the browser capability accepted the override call, but measured
`window.innerWidth × window.innerHeight` remained 1280×720, so no desktop
evidence is being presented as mobile evidence.

No P0, tenant leak, auth bypass, secret exposure, or unintended destructive
impact was observed.

## 2. FA REGRESSION MATRIX

| ID | Result | Live evidence |
|---|---|---|
| FA-01 | **PASS** | Manager logout followed by normal sign-in returned automatically to `/mame-to-cha/manager` in 1.61 s. Staff normal login returned to `/mame-to-cha`. Staff direct Manager entry was denied; Manager direct Staff entry failed closed with `No staff profile found`. |
| FA-02 | **PASS** | A empty, B whitespace reason, C no meaningful change, D changed time without reason, and E 15:00→10:00 were rejected with the dialog and values retained. F 07:05→15:05 with a real reason created one meaningful pending request visible to Manager. No active QA pending request remained after decisions. |
| FA-03 | **FAIL** | Reject showed confirmation before mutation; Cancel preserved the pending request; Confirm produced one terminal Rejected result and persisted after refresh. Approve also confirmed and persisted as Approved, but the Staff work record still showed no clock-in/out after refresh. Confirmation showed employee/date/reason but omitted the requested 07:05–15:05 values. |
| FA-04 | **PASS** | `QA-FA04-20260810-A` used Deactivate, not Delete. Cancel preserved active state; Confirm persisted inactive; inactive was absent from assignment and visible in Deactivated. Reactivate restored the same single record and, after refresh, assignment availability. Final lifecycle state is Deactivated. |
| FA-05 | **FAIL** | Staff Help Escape and Close returned focus to the opener and Tab continued to Clock in. Manager confirmation did not move focus into the dialog, and Cancel left `document.activeElement` on `BODY` rather than the Deactivate opener. |

## 3. FINAL SMOKE COVERAGE

| Surface | Result | Evidence |
|---|---|---|
| Manager | **FAIL** | Login, dashboard, attention, schedule, Today/Prev/Next, Manage Staff Add/Edit, Recipes, Inventory, Settings, JA/EN, and logout opened/worked; attendance approval and confirmation focus defects remain. |
| Staff | **PASS** | Login, reload persistence, canonical route, schedule/week navigation, Recipes/detail, Inventory, Help, correction validation, JA/EN, and logout were exercised. No Manager-only controls were exposed. |
| Recipes | **PASS** | Manager list/edit validation and archive confirmation worked; Staff list/detail and JA-original fallback were visible. Image loading state reappeared on quick reopen but content remained available. |
| Inventory | **PASS** | Manager list/edit and native negative constraints; Staff six-item count UI, shortage/sufficient/not-counted states, and negative native rejection were observed without committing data. |
| Settings | **PASS** | Shift type lifecycle and persistence passed. |
| Auth/Role | **PASS** | Isolated simultaneous Manager/Staff sessions, canonical redirects, cross-role fail-closed behavior, and logout were confirmed. This is not a full RLS audit. |
| JA/EN | **PASS** | Both roles changed locale; Staff Recipes displayed the explicit JA-original fallback where English content was unavailable. |
| Mobile | **BLOCKED** | Actual 390×844 could not be proven; measured viewport remained 1280×720 after the override. |
| Performance | **FAIL** | Staff week navigation median was 3.03 s and repeatedly reached/exceeded the 3 s ordinary-interaction threshold. |
| Console | **PASS** | No warning/error entries were returned for the observed Manager and Staff paths. |
| Network | **NOT VERIFIED** | The available browser tooling did not expose a complete request ledger, so 4xx/5xx, duplicate mutations, and >5 s request coverage cannot be claimed. |

## 4. NEW CONFIRMED DEFECTS

### FR-01 — Approved correction does not update attendance

- **Severity:** P1
- **Evidence:** LIVE VERIFIED
- **Reproduction:** Staff submits 2026-08-07 correction 07:05–15:05; Manager opens the pending request, confirms Approve; Staff refreshes the work record.
- **Expected:** one approved mutation updates clock-in/out to the requested values.
- **Actual:** Manager history shows Approved, but Staff still shows `Clock-in —` and `Clock-out —`.
- **Business impact:** Manager believes payroll/time evidence was corrected when the underlying record was not changed.
- **Release blocking:** YES

### FR-02 — Attendance confirmation omits requested time values

- **Severity:** P1
- **Evidence:** LIVE VERIFIED
- **Reproduction:** Open Approve or Reject confirmation for the 07:05–15:05 request.
- **Expected:** employee, date/shift, requested values/details, and decision are visible before mutation.
- **Actual:** employee, date, reason, and decision are shown; 07:05–15:05 is absent.
- **Business impact:** Manager cannot safely verify the material change being approved or rejected.
- **Release blocking:** YES

### FR-03 — Manager confirmation Cancel loses opener focus

- **Severity:** P1
- **Evidence:** LIVE VERIFIED
- **Reproduction:** Focus/click a Shift type Deactivate action, then Cancel its confirmation.
- **Expected:** focus returns to the Deactivate opener and Tab continues logically.
- **Actual:** `document.activeElement` becomes `BODY`; opening the dialog also leaves focus on the background opener rather than moving it into the alert dialog.
- **Business impact:** keyboard users lose their place after a high-impact confirmation.
- **Release blocking:** YES

### FR-04 — Staff week navigation remains at the UX threshold

- **Severity:** P2
- **Evidence:** LIVE VERIFIED
- **Reproduction:** alternate Prev/Next on the authenticated Staff schedule three times.
- **Expected:** ordinary navigation completes below 3 s with responsive feedback.
- **Actual:** 2.749 s, 3.030 s, and 3.033 s; median 3.030 s.
- **Business impact:** routine schedule browsing feels delayed.
- **Release blocking:** NO by itself

## 5. PERFORMANCE RESULTS

Measurements include browser automation overhead and are user-perceived wall
times, not server-only timings.

| Interaction | Runs | Median / range | Result |
|---|---:|---:|---|
| Manager reload | 3 | 2.09 s / 1.75–2.61 s | PASS |
| Staff reload | 3 | 1.76 s / 1.72–1.80 s | PASS |
| Staff week navigation | 3 | 3.03 s / 2.75–3.03 s | FAIL |
| Manager week Next / Prev | 2 | 0.71 s / 0.55–0.87 s | PASS |
| Manage Staff open | 1 | 0.48 s | Observed |
| Manage Recipes initial open | 1 | 0.45 s plus image loading | Observed |
| Manage Recipes reopen | 3 | 0.66 s control response; first full wait 2.50 s | PASS with loading note |
| Inventory open | 1 | 0.44 s | Observed |
| Valid correction submit | 1 | 5.65 s wall time | Slow, pending feedback was present |
| Reject terminal action | 1 | approximately 4.1 s until final UI state | Slow, buttons/confirmation disabled while pending |
| Approve terminal action | 1 | 4.50 s | Slow and functionally failed (FR-01) |
| Manager logout | 1 | 1.20 s | PASS |
| Staff logout | 1 | 4.68 s | Slow single observation |

## 6. MOBILE RESULT

**Manager 390×844: BLOCKED.**

The explicit viewport capability call completed, but live measurement returned
`innerWidth=1280`, `innerHeight=720`, `clientWidth=1265`. A new browser tab
produced the same values. The resulting desktop screenshot is deliberately not
used as mobile evidence. Manager dashboard, schedule, Staff/Recipes/Inventory
modals, Settings, and confirmation at actual 390×844 therefore remain
unverified. Staff mobile is also not claimed.

## 7. CONSOLE / NETWORK RESULT

- **Console:** PASS for observed paths. Final Manager and Staff warning/error
  collections were empty; no uncaught or hydration error was observed.
- **Network full audit:** NOT VERIFIED. The tool did not expose a complete
  Network request ledger, so absence of duplicate requests, unexplained 4xx/5xx,
  media refetches, and >5 s requests is not asserted.

## 8. QA FIXTURE / ROLLBACK REPORT

| Fixture | Purpose | Final state | Rollback/result |
|---|---|---|---|
| Attendance request, 2026-08-07, reason `QA FA-02 no meaningful change`, requested clock-in 07:01 | Reject branch and confirmation regression | Terminal Rejected | Removed from pending through normal Manager Reject; persisted after refresh. |
| Attendance request, 2026-08-07, reason `QA-FA02-20260810 valid correction`, 07:05–15:05 | Valid submission and Approve branch | Terminal Approved, attendance unchanged | Removed from pending through normal Manager Approve. Terminal history remains by product design; FR-01 records the failed application. |
| Shift type `QA-FA04-20260810-A` | Deactivate/reactivate lifecycle | Deactivated | Final Deactivate used normal product confirmation; absent from new assignment choices and retained in Deactivated view. |

No SQL, Supabase Studio write, migration, direct Cloud DB cleanup, Production
write, or `/demo` route was used. No active QA attendance request remains.

## 9. FINAL FOUNDER DECISION

- **Engineering Complete: NO** — FR-01, FR-02, and FR-03 are live P1 release blockers; actual Manager mobile is also not proven.
- **Founder Accepted: NO** — FA-03 and FA-05 failed and the mandatory 390×844 gate is blocked.
- **Commercial Ready: NO** — technical Founder Acceptance is not granted; separate commercial gates are also outside this audit.
- **Ready for first paying customer: NO** — approving attendance can falsely report success without updating worked time, and the mandatory mobile owner workflow is unverified.

Exact next gate: fix FR-01 through FR-03 in independently testable batches,
then rerun targeted FA-03/FA-05 plus actual Manager and Staff 390×844. Do not
repeat FA-01, FA-02, or FA-04 unless the fix impact matrix touches those areas.
