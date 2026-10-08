# ORUWA roadmap: Cafe v2.2 closure → LINE → tenant provisioning → production (2026-10-08)

Founder-requested plan, combining the Founder's own sequence with a
ChatGPT-authored proposal. Prompt Review (Operating Model §18) by the Lead
Agent against the repository: **ACCEPT WITH AMENDMENTS** (amendments marked
**[A]**). This document orders the work; each stage still needs its own
Founder prompt to start. It does not replace `docs/strategy/oruwa-master-roadmap.md`;
it is the concrete next-phase order inside it.

## Invariant (Founder, binding)

A new client is a **new tenant inside the one ORUWA platform**, never a code
copy or a separate deployment. "Onboarding a client in 3–5 minutes" means
automated tenant provisioning, not a new project.

## Exit criteria for closing Cafe v2.2 (replaces "no debt at all")

"Zero debt" is not achievable for a real SaaS. Cafe v2.2 closes when:

- 0 P0, 0 P1 open;
- 0 known data-loss or security defects;
- 0 broken core workflows (every Manager↔Staff flow in the QA checklist works);
- 0 misleading active features (nothing that looks done but isn't);
- every remaining debt row is classified, has a trigger, and the Founder has
  explicitly accepted whether it blocks the commercial release.

## Stage 1 — finish Founder Acceptance QA3 (Founder)

- Checklist: `docs/ai/FOUNDER_QA3_CHECKLIST_2026-10-08.md`.
- Lead triages findings: fix now / debt row / not a defect. Founder Acceptance
  stays open until Stage 3 passes.

## Stage 2 — DEBT-074: the monthly auto-schedule actually runs

Repository fact: `apps/worker` is a long-running Node process (`croner`,
hourly `auto-schedule-monthly`, service-role client). It has **no deployment
target anywhere** — it has never run in the cloud.

**[A] Hosting options** (Founder decides; Lead recommends 1):

1. **Supabase scheduled Edge Function** (pg_cron → Edge Function every hour).
   Same vendor as the DB, the service key never leaves Supabase, no new
   account. Needs: port the job to an Edge Function (Deno), a migration that
   schedules it (Founder-applied, RED), function deploy (Founder-approved).
2. GitHub Actions scheduled workflow running the job hourly. Cheap and fast
   to set up, but the service key lives in GitHub secrets and scheduling can
   lag 5–15 min (acceptable: the job is idempotent).
3. A small always-on host (Railway/Fly/Render) for the existing worker as is.
   New vendor and monthly cost.

Not allowed: a Vercel Cron route inside `apps/web` running with the service
key (`service_role` must never be in `apps/web`, AGENTS.md rule 4).

Acceptance (from the ChatGPT proposal, kept): ON/OFF + day of month → the
run happens → exactly one draft set per (location, month) → a repeat run
creates no duplicates → Staff sees nothing → Manager reviews → publishes →
Staff sees. Plus: JST day boundaries, auto-create OFF, invalid settings,
already-generated month, error path, **[A] a visible run log** (who/when/
what result) so a silent failure is noticed, and multi-location /
multi-tenant scoping (needs Stage 4's second tenant for the live part;
covered by unit tests before that).

## Stage 3 — QA4: Cafe v2.2 Final Operational Simulation

Simulate about one working month on Cloud DEV across every block except
LINE (staff, preferences, auto-schedule, publish, changes, exchanges,
cancellations, corrections, attendance, rates and monthly-hour cap, labour
cost, Operations/HACCP incl. out-of-range, Issues/Handover, Inventory in all
units, Purchasing full lifecycle and repeated/impossible actions, Recipes
incl. price/missing price/incompatible unit/allergens/JA-EN and no automatic
stock deduction, Mail between two Staff, Attention and Weekly Review counts).

**[A] How a "month" is simulated honestly:** the app records clock-in/out and
task completion at real server time, so past days cannot be clicked into
existence. The simulation combines (a) real actions on the days the QA runs,
(b) past days created through the product's own paths (Manager past-shift
correction, Staff correction requests approved by the Manager), and, if the
Founder approves, (c) a seed script that writes a realistic past month to
Cloud DEV (a Cloud data write → Founder gate). QA4 needs Staff B active and
ideally 4–6 Staff accounts: **[A] Founder action** — Founder-owned mailbox
aliases (`+staffd`, `+staffe`, ...) to invite.

Then: final regression, independent general + DB/security + UX reviews,
pgTAP, CI, post-merge Preview smoke, Founder final review →
**Founder Acceptance PASS, Cafe v2.2 CLOSED.**

## Stage 4 — after v2.2 (in this order)

- **A. Notifications v1: LINE + email.** Start from the existing reminder,
  then schedule published/changed, issue/manager message. Per-recipient,
  never automatic broadcast (mass send stays a Founder gate). Needs the
  Founder's LINE Official Account + Messaging API channel.
- **B. Automated tenant provisioning** ("new client in 3–5 minutes"; the
  technical part should take seconds). One idempotent, resumable operation:
  tenant (unique slug, business name) → first location (timezone
  Asia/Tokyo, locale ja) → Owner invitation → roles/permissions → package
  Cafe → module entitlements → subscription/trial state → default schedule
  settings, shift types, Operations templates → provisioning status + audit
  row. It either completes or can be safely re-run; never half-created.
  **[A]** the repo already has a local-only onboarding CLI
  (`packages/db` onboarding commit/dry-run, local DB) — reuse its model, do
  not start from zero.
- **C. Provisioning test: 6 tenants** (standard, other location, minimal
  modules, two locations, failed/retried onboarding, full package): time to
  ready, isolation (Staff/Manager of A see nothing of B in schedule, wages,
  inventory, recipes, mail, issues), Owner access, defaults, deactivation and
  deletion (deletion Founder/admin-gated). This is also the live multi-tenant
  test (DEBT-049).
- **D. Clean demo tenant** created through the same provisioning (DEBT-004),
  replacing manual clean-up of `oruwa-cafe` (DEBT-001..003/059/067/080).
- **E. Japanese copy finalization**: native review, Copy Audit A items,
  確定/公開 terms (DEBT-082), allergen wording, sign-in screen, email
  templates (DEBT-083), LINE texts.
- **F. SaaS hardening**: audit completeness (DEBT-056/071), rate limits
  (reminder cooldown), error monitoring/alerting (worker, email, LINE,
  provisioning), backups and a tested restore, concurrency/idempotency
  review, security review.
- **G. Production readiness and release**: production Supabase + key
  migration (DEBT-036), Vercel production env (DEBT-035), Resend production
  domain, LINE production credentials, domain, monitoring, migration
  process, rollback plan, smoke tests; the `dev → main → production` path
  (DEBT-043). Merging to `main` and deploying are two separate Founder gates.
- **[A] H. Commercial prerequisites the plan did not list**: billing
  (subscription collection, e.g. Stripe — Founder decision), legal pages
  (privacy policy under APPI, 利用規約, 特定商取引法に基づく表記), a support
  channel and an incident process.

Then: first real Cafe customers → feedback/analytics → next vertical.

## Appendix — standard app screens that do not exist yet (Founder ask, 2026-10-08)

Checked against `apps/web/src/app/**/page.tsx` on `dev`. Grouped by when
they are needed. "QA4" = before Cafe v2.2 closes; "Provisioning" = with
tenant onboarding; "Release" = before the first paying customer.

| Screen | Why it matters | When |
|---|---|---|
| Invalid / expired invite-link page (JA/EN) | today a bad link shows "Invalid email or password" or silently opens the signed-in user's dashboard (DEBT-084) | QA4 |
| Self-service "forgot password" on the sign-in page | sign-in says "password reset ... not available yet"; today only a Manager can trigger recovery (and DEBT-085 must be fixed first) | QA4 |
| Japanese sign-in and error pages: 404 (`not-found`), unexpected error (`error`/`global-error`), access denied, with a link back to the user's own screen | there is no root `not-found`/`error` page; access denied is English (DEBT-053) | QA4 |
| My account (Staff and Manager): name, language, change password, sign out of other devices | there is no profile screen; language lives only in the header menu | QA4 |
| Store settings (Owner/Manager): business name, location name, address, timezone, business hours, logo | none exists (`core.settings.manage` has no screen); needed so a new tenant can fix its own data | Provisioning |
| Monthly attendance / payroll export (CSV or PDF per employee and month) | a real cafe pays wages from it; today only "copy monthly report" to the clipboard | QA4 (decide) |
| Owner onboarding wizard after provisioning (store → shift types → staff invites → modules) | "new client in 3–5 minutes" needs a guided first run | Provisioning |
| Admin console (ORUWA staff): tenants list, create/suspend tenant, provisioning status, retry | provisioning operations need a UI, not SQL | Provisioning |
| Notification settings (per user: email / LINE, which events) | needed once LINE + email notifications exist | LINE stage |
| Activity / audit log view (who changed what) | audit rows are missing today (DEBT-056/071); a view follows the data | Hardening |
| Billing / subscription (plan, trial, invoices, payment method) | collecting money | Release |
| Legal pages: プライバシーポリシー (APPI), 利用規約, 特定商取引法に基づく表記; consent on first sign-in | legal requirement in Japan for a paid service | Release |
| Help / contact support page and in-app link | customers need a way to reach support | Release |
| Account deletion / data export request (APPI requests) | privacy obligations; ties to DEBT-033 | Release |
