# Cafe Package v2.1 — Product Review

## Outcome

Cafe Package v2.1 is approved for implementation as a bounded operator-UX and
reliability release. It is not a tenant fork: every change must remain reusable
for another cafe tenant, while Preview supplies the temporary `MATCHA-tea`
brand through tenant configuration.

## Problem and users

Staff and managers can reach the core workflows, but several interactions are
slow, inconsistent, or expose the wrong composition on mobile. The release is
for cafe staff using a phone during a shift and managers maintaining schedules,
staff, recipes, and inventory.

## Now

- one-line tenant-branded header and compact mobile navigation;
- one compact manager attention centre;
- reliable week navigation and shift editing feedback;
- future-shift change/cancellation requests launched from the selected cell;
- correction submission closes and leaves a visible pending marker;
- scalable inventory counting and management for 100+ items;
- consistent modal staff/recipe management with the accepted required fields;
- server-validated recipe image upload with tenant-scoped storage;
- measured Settings mutation performance improvements;
- JA/EN help and labels for every changed surface;
- platform subscription lifecycle foundation: warning, freeze, archive, purge
  eligibility, audit, and a manager payment entry point.

## Later

- payment-provider checkout and billing webhooks;
- payroll, overtime, tax, insurance, transport, or deductions;
- automatic purchasing and supplier management;
- permanent purge execution in production before retention policy and restore
  rehearsal are accepted.

## Rejected

- hard-coding `MATCHA-tea` as the global Cafe product name;
- deleting a tenant from a browser timer;
- exposing raw email, LINE user ID, storage paths, or service-role access to the
  browser;
- a second shift-change data model beside the existing audited exchange model.

## Acceptance criteria

1. Staff and Recipes share the same mobile header; logo returns to Staff and the
   animated menu contains Recipes/Staff as appropriate and Log out.
2. Manager has no preview-top link and sees one compact attention centre.
3. Week changes render promptly without stale controls.
4. A future own shift opens a focused request dialog, requires a reason, and
   displays pending state on the originating cell after submit.
5. Past shifts are visually read-only; correction submission closes and marks
   the affected day pending.
6. Staff and recipe CRUD use consistent dialogs and preserve tenant/location,
   PII, audit, and permission boundaries.
7. Inventory remains usable at 30 and 100 items using search/filter, compact
   rows, sticky controls, and shortage-first ordering.
8. Relevant tests, build, local reset, pgTAP, authenticated Manager/Staff/
   Recipes Preview acceptance, and regression neighbours pass.

