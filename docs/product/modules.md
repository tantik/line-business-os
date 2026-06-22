# Product Modules

All modules run inside the shared platform and are entitlement-gated via
`core.tenant_modules`.

## Workforce

Source reference: `tantik/cafe-shift` (UI/demo logic).

Capabilities: employees, shifts, shift requests, vacations/leave requests,
attendance, manager dashboard, employee mobile view, LINE notifications, cafe
demo, client template.

Routes:

- `/workforce`, `/workforce/manager`, `/workforce/shifts`
- Legacy redirects: `/shifts → /workforce/shifts`, `/manager → /workforce/manager`

Schema: `supabase/migrations/0009_workforce.sql`. Contracts: `@line-os/workforce`.

## Booking

Source reference: `tantik/line-app` (salon logic / LINE / Supabase concepts).

Capabilities: public booking, services, staff, business hours, blocked slots,
bookings, booking events, reminder jobs, LINE confirmation, LINE cancellation,
salon demo, client template.

Routes:

- `/booking`, `/booking/admin`, `/booking/new`

Schema: `supabase/migrations/0010_booking.sql`. Contracts: `@line-os/booking`.
Reminders: `apps/worker/src/jobs/booking-reminders.ts`.

## Planned

Logistics, CRM, Inventory, AI Assistant. Each follows the same pattern: own DB
schema, own package of typed contracts, `tenant_id`(+`location_id`), RLS, RBAC
permissions, audit, demo + client-template seed.
