# Cafe v2 estimated earnings — Product and Architecture Review

Date: 2026-07-31
Status: approved implementation slice

## Product Review

Problem: staff cannot see a useful month-to-date operational estimate, and
managers cannot connect total labour cost to individual staff hours.

Now:

- staff: Worked this month, Hourly wage, Estimated earnings;
- manager: Estimated labour cost and a staff-name popover with worked hours,
  hourly wage, estimate, position, and active status;
- manager staff editor: optional hourly wage in whole JPY.

Later: overtime/night/holiday premiums, tax, insurance, transport,
deductions, payroll exports, and statutory payroll compliance.

Acceptance language is always `Estimated earnings / 概算給与`; never Salary
or payroll. Missing wage produces `—`, never an invented value.

## Architecture Review

- Forward-only migration `0048` adds nullable `hourly_wage_yen` to
  `workforce.employees` with a bounded whole-JPY check.
- Manager access is through the existing manager-only
  `api.workforce_staff_manage` security-invoker facade and RLS.
- Staff access is through the existing self-scoped
  `api.workforce_my_staff_profile` facade. The general staff directory does
  not expose wages.
- Worked hours are derived from completed attendance rows for the location's
  current calendar month, subtracting recorded break minutes.
- Estimated earnings are `round(worked hours * hourly wage)` and remain
  presentation-only; no payroll record is stored.
- No service-role frontend path, new permission, RLS weakening, or external
  dependency is introduced.

## Preview fixtures

Synthetic acceptance wages may be added to the existing `mame-to-cha`
acceptance tenant only. They must be deterministic, visibly non-production,
tenant-scoped, and removable by the existing fixture cleanup workflow. No
real employee compensation data is used.

## Rollback

Application rollback: revert the UI/service commit. Database rollback is
forward-only: stop using the nullable column; do not edit or delete an applied
migration. A later reviewed migration may remove it if the product decision is
reversed.
