# Cafe Package v2.1 — Founder Acceptance Audit

Live verification date: **2026-08-08 (Asia/Tokyo)**

Environment: **Preview only** (`https://preview.oruwa.jp`)

Roles: isolated Manager and Staff QA sessions
Decision scope: first paying customer readiness; not a code audit

## 1. Executive Summary

Cafe Package v2.1 is functional across its principal Manager, Staff, Recipes,
Inventory, localization, authentication-boundary, desktop, and Staff-mobile
surfaces, but it is **not ready for Founder Acceptance or a first paying
customer**.

Four release defects were confirmed live:

1. Manager sign-in returns the Manager account to the Staff route and shows
   `No staff profile found` instead of opening the Manager dashboard.
2. Staff can submit a working-hours correction with no times and no reason;
   the request is accepted and appears to Manager with `Details: -`.
3. Manager attendance-correction decisions execute immediately from Approve or
   Reject, without a confirmation boundary.
4. Settings uses `Delete` for a shift type but immediately deactivates it with
   no confirmation and no visible recovery path in the active list.

A cross-surface accessibility defect was also confirmed: Escape closes tested
dialogs but focus falls back to the document body instead of returning to the
trigger.

Final decision:

- **Engineering Complete: NO**
- **Founder Accepted: NO**
- **Commercial Ready: NO**
- **Ready for first paying customer: NO**

The NO decisions are caused only by the confirmed release defects above, not
by unverified or speculative improvements.

## 2. Founder Acceptance Score (0–100)

**67 / 100**

The product demonstrates a coherent operational shell, fast common modal
opening, reliable role denial, working JA/EN switching, usable Staff mobile
layouts, explicit Inventory validation, and correct permanent-delete
confirmation for a disposable Inventory item. The score is capped because the
primary Manager login journey fails and two high-impact workforce workflows
accept or apply unsafe actions without adequate validation/confirmation.

## 3. Confirmed Defects

### FA-01 — Manager login redirects to the Staff route

- **Severity:** P1
- **Module:** Authentication / role routing
- **Reproduction:** Open authenticated Manager dashboard; select Log out; sign
  in with the Preview Manager QA account.
- **Expected:** The Manager account opens `/mame-to-cha/manager`.
- **Actual:** Sign-in opens `/mame-to-cha` and displays `No staff profile
  found`. Direct navigation to `/mame-to-cha/manager` then succeeds.
- **Evidence:** LIVE VERIFIED. Logout took 0.6 s. The post-login page was the
  Staff route with the no-profile error; direct Manager-route load succeeded
  in 1.3 s. Console warnings/errors: none.
- **Likely root cause:** NOT VERIFIED. The observed behavior supports a missing
  role-aware post-login destination, but implementation was not inspected in
  this audit.
- **Suggested implementation direction:** Make the post-auth destination
  derive from the authenticated user's authorized product role and preserve a
  safe requested destination where appropriate.
- **Business impact:** A cafe owner following the normal logout/login journey
  cannot reach their dashboard without knowing and manually entering the
  Manager URL.

### FA-02 — Empty Staff correction request is accepted

- **Severity:** P1
- **Module:** Staff attendance correction
- **Reproduction:** As Staff, open the past shift for 2026-08-07; select
  `Request a correction`; leave actual clock-in, clock-out, break, and reason
  empty; select Submit.
- **Expected:** Submission is blocked with field-specific validation and the
  form remains open.
- **Actual:** The button shows `Submitting...`; the dialog closes; the shift
  receives a pending `!`; Manager receives a request with `Details: -`.
- **Evidence:** LIVE VERIFIED. The created QA request was subsequently rejected
  by Manager; no active pending request remained after reload. Console
  warnings/errors: none.
- **Likely root cause:** NOT VERIFIED. Both client and server acceptance rules
  require inspection during remediation.
- **Suggested implementation direction:** Require at least one meaningful time
  change and a non-blank reason; validate identically client-side and
  server-side; retain entered values on rejection.
- **Business impact:** Managers receive unactionable requests and can make
  attendance decisions without the data required for payroll-related review.

### FA-03 — Attendance decisions have no confirmation boundary

- **Severity:** P2
- **Module:** Manager attendance corrections
- **Reproduction:** Open `Attendance correction requests`; select Approve or
  Reject on a pending request.
- **Expected:** A confirmation states the employee, date, requested values, and
  decision before the mutation is applied.
- **Actual:** The mutation executes immediately. The tested approval completed
  and moved directly into Recent decisions; the cleanup rejection behaved the
  same way.
- **Evidence:** LIVE VERIFIED. Both decisions completed in approximately 2.2 s;
  no confirmation appeared and no console errors were recorded.
- **Likely root cause:** NOT VERIFIED.
- **Suggested implementation direction:** Reuse the shared confirmation modal;
  show decision-specific copy and return focus to the originating button after
  cancel/close.
- **Business impact:** A single accidental click can approve or reject an
  attendance change, creating operational and payroll reconciliation work.

### FA-04 — Shift-type `Delete` immediately performs a hidden deactivation

- **Severity:** P2
- **Module:** Manager Settings / shift types
- **Reproduction:** Create a disposable shift type; select `Delete` on its row.
- **Expected:** The UI names the real operation (`Deactivate`), explains its
  effect, requests confirmation, and exposes a clear reactivation path.
- **Actual:** The row disappears after one click and `Saved.` is shown. No
  confirmation appears. The record is deactivated rather than permanently
  deleted and is not available in the visible active list for recovery.
- **Evidence:** LIVE VERIFIED with `QA-INVALID (10:00-14:00)`. The fixture was
  removed from the active UI in about 2.2 s; it remains as a deactivated
  Preview record. Console warnings/errors: none.
- **Likely root cause:** NOT VERIFIED.
- **Suggested implementation direction:** Rename the action to Deactivate, add
  explicit confirmation with schedule impact, and expose a Deactivated view
  with Reactivate.
- **Business impact:** Owners can unintentionally remove a reusable shift type
  and cannot discover how to restore it.

### FA-05 — Dialog focus is not restored after Escape

- **Severity:** P2
- **Module:** Shared modal accessibility
- **Reproduction:** Open Staff Work-status Help or the Manager staff
  deactivation confirmation; press Escape from the dialog.
- **Expected:** The dialog closes and focus returns to the control that opened
  it.
- **Actual:** The dialog closes, but `document.activeElement` becomes `BODY`.
- **Evidence:** LIVE VERIFIED on two separate dialog types and both Staff and
  Manager surfaces.
- **Likely root cause:** NOT VERIFIED.
- **Suggested implementation direction:** Capture the opener before display and
  restore focus after every close path, including Escape, backdrop, Cancel,
  and close button.
- **Business impact:** Keyboard and assistive-technology users lose their place
  and must restart navigation through the page.

## 4. Production Polish

### PP-01 — Improve the mobile Recipes rail affordance

On a 390 × 844 Staff viewport the recipe-card rail is usable and the page has
no horizontal document overflow, but it exposes a persistent native horizontal
scrollbar and a partially clipped next card. A snap-aligned rail with a subtle
edge affordance would objectively improve discoverability and touch control
without changing the information architecture. This is not a release blocker.

No other Production Polish item met the audit's evidence threshold.

## 5. Performance Findings

- Manager authenticated reload: **2.0 s**.
- Staff sign-in: **2.1 s** on first isolated login; **1.5 s** on relogin.
- Staff authenticated reload after cleanup: **1.1 s**.
- Manager direct-route recovery after the login-routing failure: **1.3 s**.
- Staff logout: **0.6 s**.
- Manager/Staff common panels (Staff management, Recipes, Inventory):
  approximately **0.3 s** to visible UI.
- Staff recipe detail switch: **0.3 s**.
- Staff next-week navigation: **3.1 s** in the measured run.
- Inventory invalid-input feedback: **0.3 s**.
- Inventory permanent delete: **2.2 s**, with visible confirmation and correct
  removal.
- Attendance decision mutations: approximately **2.2 s**.
- Recipe edit form became usable after about **2 s** in the observed run.

No reproducible freeze, console error, or image-load failure was confirmed.
The 3.1 s week transition and approximately 2 s edit/mutation waits are
measured observations, not standalone defects, because this audit did not
repeat them enough to establish reproducibility.

## 6. Accessibility Findings

- **FAIL:** FA-05 confirms missing focus restoration after Escape.
- **PASS:** Tested dialogs expose dialog semantics and visible Close/Cancel
  controls; Escape closes non-destructive dialogs.
- **PASS:** Tested forms expose associated labels; native required-field
  validation moved focus to the first missing Staff field.
- **PASS:** Staff mobile and desktop pages had no horizontal document overflow.
- **NOT VERIFIED:** Full screen-reader announcement quality, complete tab order,
  automated WCAG contrast ratios, reduced-motion behavior, and every focus
  trap across all dialogs.

## 7. UX Findings

- Manager and Staff primary dashboards are visually coherent and use
  consistent cards, typography, status colors, spacing, and help affordances.
- JA/EN switching worked live with no console errors. Manager EN → JA → EN and
  Staff JA → EN both updated visible navigation and operational labels.
- Staff Recipes desktop and mobile list/detail interaction worked; EN content
  and explicit `JA original` fallback were displayed correctly.
- Staff Inventory clearly distinguished shortage, sufficient, and not-counted
  states. A negative Ice value produced the specific message
  `Ice: Please check your input.` without saving.
- Manager schedule invalid times produced `Please check your input.` and kept
  the editor open.
- Schedule publish, staff deactivation, recipe archive, and Inventory permanent
  delete exposed accurate confirmation copy when tested without committing the
  protected actions.
- Staff mobile at 390 × 844 was usable; Only me reduced the schedule to one
  row and the page had no horizontal document overflow.
- **NOT VERIFIED:** Manager responsive/mobile behavior. The available external
  Manager browser did not apply the requested mobile viewport, so desktop
  evidence was not misreported as mobile evidence.
- **NOT VERIFIED:** Clock-in, break, clock-out, successful stock-count creation,
  successful recipe creation/edit persistence, schedule auto-create, and
  schedule publish. These actions would leave additional operational history
  or materially alter shared Preview fixtures and were not needed to confirm
  the release blockers.

## 8. Security Concerns (only confirmed)

No security defect was confirmed.

- Staff direct navigation to `/mame-to-cha/manager` returned `Access denied`
  in 1.8 s and rendered no Manager data.
- Manager direct navigation to the Staff route returned `No staff profile
  found` in 1.8 s and rendered no Staff data.
- No browser console warnings/errors were recorded on the tested authenticated
  Manager, Staff, Recipes, Inventory, login, logout, or denial paths.
- **NOT VERIFIED:** Complete Network request inspection, cross-tenant testing,
  RLS policy behavior, secret exposure analysis, and mutation audit-log
  completeness. They were outside this live product audit and are not claimed
  as PASS.

## 9. Final Release Blockers

1. Fix and live-regress FA-01 Manager post-login routing.
2. Fix and live-regress FA-02 empty correction acceptance on both client and
   server boundaries.
3. Add and live-regress the FA-03 attendance-decision confirmation.
4. Correct FA-04 shift-type action semantics, confirmation, and recovery.
5. Fix the shared FA-05 focus-return behavior and run targeted keyboard
   regression.
6. Re-run Manager mobile acceptance in a browser that demonstrably applies the
   target viewport.

Until all six gates pass:

- **Engineering Complete: NO**
- **Founder Accepted: NO**
- **Commercial Ready: NO**
- **Ready for first paying customer: NO**

## 10. Claude Code Implementation Plan

### Batch 1 — Role-aware Manager login destination

- Reproduce FA-01 from logout through login.
- Trace only the post-login destination and authorization outcome.
- Implement role-aware safe redirect behavior without weakening server-side
  Manager/Staff denial.
- Add behavioral tests for Manager, Staff, unauthorized, and preserved safe
  destination cases.
- Independent gate: auth tests, typecheck, lint, build, Preview Server Action
  verification, live Manager logout/login, and both cross-role URL denials.

### Batch 2 — Attendance-correction input contract

- Define one shared correction validity contract: meaningful time change plus
  non-blank reason, valid time ordering, and valid break duration.
- Enforce it in both the Staff form and the server mutation boundary.
- Preserve user input and show field-specific feedback on rejection.
- Add tests proving empty/whitespace/no-change submissions fail and a valid
  correction succeeds.
- Independent gate: automated tests plus disposable Staff submit → Manager
  review → terminal cleanup in Preview.

### Batch 3 — High-impact Manager confirmations

- Add decision-specific confirmation for attendance Approve/Reject with staff,
  date, requested values, and consequence.
- Rename shift-type Delete to Deactivate, add confirmation, expose Deactivated
  filtering, and add Reactivate.
- Preserve existing permission, tenant, location, and audit boundaries.
- Independent gate: cancel causes no mutation; confirm mutates once; refresh
  persists; reactivation restores the shift type.

### Batch 4 — Shared modal focus restoration

- Fix the shared modal close lifecycle so every close path restores the exact
  opener.
- Add keyboard behavioral coverage for Escape, Cancel, close button, nested
  confirmations, and opener removal fallback.
- Independent gate: automated focus assertions plus manual Staff Help and
  Manager confirmation keyboard smoke.

### Batch 5 — Release regression and Founder re-audit

- Run typecheck, tests, build, lint, and Preview Server Action verification.
- Run isolated Manager/Staff authentication and role-boundary regression.
- Re-run all five defect reproductions and prove each expected result.
- Re-run Manager at 390 × 844 and desktop, Staff desktop/mobile, Recipes,
  Inventory validation, JA/EN, Console, and targeted Network inspection.
- Record every fixture and rollback state.
- Only after full PASS request a new Founder Acceptance decision; do not call
  technical acceptance a Commercial Release automatically.
