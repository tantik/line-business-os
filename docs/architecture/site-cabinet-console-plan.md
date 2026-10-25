# Site / Owner cabinet / Admin console — Phase A plan (2026-10-25)

Status: **PLAN** (Lead/CTO, Operating Model §9). No code, no migrations.
Implements the Founder decision of 2026-10-25
(`docs/ai/SESSION_HANDOFF_2026-10-25.md` §2): three surfaces, one monorepo,
one Supabase project per environment; billing on Stripe; the sales site is a
rebuild. Builds on `tenant-provisioning-plan-2026-10-18.md` (trial rules §8)
and `platform-packages-model.md` (plans ≠ packages).

Evidence markers: **VERIFIED** = read in this repo on 2026-10-25;
**DOC** = checked against the linked vendor page on 2026-10-25;
**UNCERTAIN** = not verified, must be checked at implementation.

## 1. The three surfaces

| Host | What | Who | Login | App |
|---|---|---|---|---|
| `oruwa.jp` | sales site, JA first (EN later), premium, sells | public | none | new `apps/site`, static export |
| `app.oruwa.jp` | the product + Owner cabinet at `/owner` | tenant users (Owner, Admin, Manager, Staff) | Supabase Auth (aal1) | existing `apps/web` |
| `admin.oruwa.jp` | ORUWA platform console | platform staff only | Supabase Auth + MFA (aal2) | new `apps/admin` |

Preview hosts (Cloud DEV): `preview.oruwa.jp` (app, exists), proposed
`admin-preview.oruwa.jp` (console); the site uses Vercel preview URLs.

## 2. What exists (VERIFIED)

| Piece | Where | Note |
|---|---|---|
| Console page `/admin/tenants` (list, create, retry provisioning) | `apps/web/src/app/(protected)/admin/tenants/` | lives inside the product app today; 404 for non-staff |
| Staff gate | `core.users.is_platform_staff` (0002), `core.is_platform_staff()` (0006), `api.is_platform_staff()` (0134), self-promotion blocked by trigger (0012) | one boolean, no staff roles, no MFA check |
| **Platform-staff bypass in RLS helpers** | `core.is_member_of()` and `core.has_permission()` start with `core.is_platform_staff() or …` (0006, 0022) | any staff session — even aal1, even on `app.oruwa.jp` — reads and writes **every tenant's data incl. PII** through PostgREST. Conflicts with "no tenant PII by default" (§6) |
| Module gate | `core.has_module_access(tenant, module)` (0093): pure `tenant_modules.is_enabled`, no staff bypass; header reserves "a future Entitlement layer inside this function body" | billing hooks in here (§8.5) |
| Plans | `core.entitlement_plans` (`trial`, `standard`, `custom`), `core.tenant_plans` (status enum `trial/active/past_due/suspended/canceled`, `trial_ends_at`, `suspended_at`), limits tables (0106) | no billing wiring; staff-only writes |
| Packages | `core.packages`, `core.package_modules`, `core.tenant_packages`, `core.set_tenant_package` (0129) | modules come from packages, not from Stripe |
| Billing permission | `core.billing.manage` (0008); `tenant_admin` = every permission except billing (0008, 0140) | the Owner cabinet's billing gate already exists |
| Audit | `audit.audit_logs` (0005): `tenant_id not null` | platform-level events (console sign-in, cross-tenant list) cannot be stored there |
| Session cookies | `apps/web/src/lib/supabase/{middleware,server,client}.ts`: `@supabase/ssr`, **no `domain` option** | cookies are host-only already — good |
| Auth config (local) | `supabase/config.toml`: `site_url`/`additional_redirect_urls` = localhost; **no `[auth.mfa]` section** | Cloud allow-list holds `preview.oruwa.jp` (DEBT-088 notes); PR-preview hosts are not on it |
| Next.js | `apps/web` on `next ^15` with `middleware.ts` | Next 16 renamed middleware → `proxy.ts` ([Next.js docs](https://nextjs.org/docs/app/api-reference/file-conventions/proxy)); new apps start on the current major |
| Hosting | Vercel (Hobby now; Pro at the first paying client, AGENTS.md "Scale and cost") | no `vercel.json` in the repo |

## 3. Decision: three Vercel projects from one monorepo

```
monorepo (pnpm workspaces)
  apps/site   → Vercel project "oruwa-site"  → oruwa.jp (+ www → apex)
  apps/web    → Vercel project "oruwa-app"   → app.oruwa.jp, preview.oruwa.jp
  apps/admin  → Vercel project "oruwa-admin" → admin.oruwa.jp, admin-preview.oruwa.jp
  packages/*  shared: ui, tokens, core, db, config (+ new auth helper package)
one Supabase project per environment (Cloud DEV now, production later)
```

Alternatives for `app.` vs `admin.`:

| Option | For | Against |
|---|---|---|
| A. One Next.js app, routing by `Host` in `proxy.ts` (rewrite `admin.oruwa.jp/*` → `/_admin/*`) | one build, one deploy, no code move | console code and routes ship inside the customer app; a routing bug exposes `/_admin` on `app.`; one CSP for both; any app deploy redeploys the console; a compromise of one is a compromise of both |
| **B. Separate `apps/admin` (recommended)** | console routes physically absent from `app.oruwa.jp`; own CSP (no third-party scripts at all), own env, own release pace; separate origin by construction; smaller attack surface | a second Next.js app to keep up to date; auth helpers must move to a shared package |

Recommendation **B**. The console has a different user group, a different
assurance level (aal2) and different security headers. It changes slowly.
Vercel deploys several projects from one repo (one Root Directory per
project) and skips projects a commit did not touch
([Vercel monorepos](https://vercel.com/docs/monorepos), DOC). Vercel Pro
pricing is per seat, not per project (UNCERTAIN, check before Pro). The
existing `/admin/tenants` moves to `apps/admin` in Phase B. After that,
`app.oruwa.jp/admin/*` returns 404.

`apps/site` is static (`output: 'export'`), so it needs no server runtime and
no Supabase keys. Its "ログイン" link goes to `https://app.oruwa.jp/sign-in`.

## 4. Auth and session separation

| Rule | How | Source |
|---|---|---|
| No cookie shared across subdomains | never set `Domain` on auth cookies; host-only cookies for `app.` and `admin.` are two separate jars even with the same name `sb-<ref>-auth-token` | [OWASP Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html) ("leave Domain unset"), DOC; repo VERIFIED (no domain set) |
| Signing in on `app.` does not sign you in on `admin.` | follows from host-only cookies; the console has its own sign-in page | — |
| Separate identities | platform staff use a dedicated staff account, never their tenant Owner account; enforce "a platform-staff user has no tenant membership" in the DB | Lead decision (least privilege) |
| SameSite | `Lax` minimum on `app.` (needed for email links); `Strict` on `admin.` (UNCERTAIN whether `@supabase/ssr` lets us override per app without breaking the callback; test in Phase B) | OWASP, DOC |
| HttpOnly | `@supabase/ssr` cookies are readable by JS by default (UNCERTAIN for the current version), so XSS = session theft → strict CSP on both apps, nonce-based on `admin.` | OWASP |
| CSRF | Server Actions are POST-only and Next.js rejects them when `Origin` ≠ `Host` ([Next.js data security](https://nextjs.org/docs/app/guides/data-security), DOC); do **not** add `admin.` to `serverActions.allowedOrigins` of `apps/web` or the reverse; Route Handlers that mutate check `Origin` themselves; the Stripe webhook is exempt (signature instead) | DOC |
| Re-check inside every action | page gates do not protect Server Actions; each action and each RPC re-checks staff role + aal2 | Next.js data security, DOC |
| Console session lifetime | idle 30 min, absolute 8 h, enforced **in the console** (signed `admin_session_started_at` marker, same pattern as the 15-minute reset marker in DEBT-088). Supabase's own time-box / inactivity timeout is Pro-only ([Supabase sessions](https://supabase.com/docs/guides/auth/sessions), DOC); turn it on once on Pro | OWASP (idle/absolute), DOC |
| Step-up for dangerous actions | delete/suspend tenant, break-glass, staff role change: fresh TOTP within the last 5 min (like [GitHub sudo mode](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/sudo-mode), 2 h, and [GitLab Admin Mode](https://docs.gitlab.com/administration/settings/sign_in_restrictions/), re-auth for the admin area), DOC | — |
| Session renewal on privilege change | MFA verification issues a new session (aal2 token); sign-out everywhere on staff role revoke | OWASP |

### 4.1 Supabase redirect allow-list (Cloud DEV now, production later)

Supabase sends users only to URLs on the allow-list. It recommends exact
paths in production, with `**` only for development
([Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls), DOC).

| Environment | Site URL | Additional redirect URLs |
|---|---|---|
| Cloud DEV | `https://preview.oruwa.jp` (as today) | `https://preview.oruwa.jp/auth/**`, `https://admin-preview.oruwa.jp/auth/**`, `http://localhost:3000/**`, `http://localhost:3001/**` |
| Production | `https://app.oruwa.jp` | `https://app.oruwa.jp/auth/accept-invite`, `https://app.oruwa.jp/auth/callback`, `https://admin.oruwa.jp/auth/callback` (exact paths; final list from the routes at implementation) |

- Every Auth call passes an explicit `redirectTo` built from the app's own
  origin. A console password reset must land on `admin.`, not on the Site URL.
- Email templates (invite, reset) use `{{ .RedirectTo }}`. Today they assume
  the app host. Check each template when `admin.` is added (UNCERTAIN: which
  templates hardcode the host).
- `oruwa.jp` is **not** on the list (no auth there).

## 5. Owner cabinet (`app.oruwa.jp/owner`)

A section of the product, not a separate site. Visible to `tenant_owner` only
(gate = `core.billing.manage`, which `tenant_admin` lacks — VERIFIED).

| Page | Content | Data |
|---|---|---|
| `/owner` | plan, status (trial: N days left / active / past_due), next charge date, CTA | `core.tenant_plans` + `billing.subscriptions` via `api.my_billing_summary()` |
| `/owner/billing` | 「お支払い方法・請求書」 → Stripe Customer Portal (invoices, receipts, card, cancel) | portal session from an Edge Function (§8.3) |
| `/owner/plan` | modules included in the package, add-ons later | `core.tenant_packages`, `core.tenant_modules` |
| `/owner/profile` | business name, store list, contact for ORUWA | existing tenant/location settings |
| `/owner/members` | counts and roles, link to the existing staff screens (no new member UI) | existing RPCs |

The Customer Portal provides invoices, payment-method updates, cancellation,
billing details, tax IDs and a Japanese UI. Portal sessions are short-lived.
The portal cannot be shown in an iframe
([Customer portal](https://docs.stripe.com/customer-management), DOC). So we
build no invoice UI and store no card data.

## 6. Console security model (`admin.oruwa.jp`)

### 6.1 Staff roles

| Role | Can |
|---|---|
| `platform_owner` (Founder) | everything below + staff management + break-glass + tenant suspend/delete |
| `platform_support` | tenant list/status, provisioning create/retry, resend Owner invite, view billing status; no PII, no break-glass |
| `platform_readonly` (later, e.g. accountant) | billing/usage numbers only |

Store as `core.platform_staff(user_id pk, role, is_active, created_by, created_at)`.
Keep `core.users.is_platform_staff` as a derived flag for the existing code
until the move is done. The role names already exist in `core.roles`
(0008), but `core.role_assignments` is tenant-scoped (UNCERTAIN whether
`tenant_id` is nullable; check before reuse).

### 6.2 Data access

- The console reads and writes only through `api.platform_*` RPCs
  (`SECURITY DEFINER`, `revoke all from public, anon`). Each RPC checks
  (1) an active staff role, (2) `coalesce(auth.jwt()->>'aal','aal1') = 'aal2'`,
  and (3) the role allows this action. Then it writes one platform audit row.
  The aal claim is the documented MFA gate
  ([Supabase MFA](https://supabase.com/docs/guides/auth/auth-mfa), DOC).
- **Prerequisite (Phase B-0):** remove the platform-staff short-circuit from
  `core.is_member_of` and `core.has_permission`. Otherwise every RLS policy
  stays open to any staff JWT at aal1. 15 migrations reference
  `is_platform_staff()`, and every policy that depends on the bypass needs an
  explicit replacement or an `api.platform_*` RPC. This is a high-risk
  migration: DB/security review is mandatory, plus pgTAP that a staff JWT
  sees zero tenant rows. This matches 0093's stated intent for module access:
  staff access is "a future, separately-designed, explicit/audited
  capability, not an automatic bypass".
- **No tenant PII by default.** Console RPCs return tenant id, slug, business
  name, package, plan/billing status, counts, provisioning state and usage.
  They never return employee names, emails, phones, LINE ids, shift contents
  or the Owner's email (the provisioning row already holds no PII — 4B-1).
- **Break-glass** (support incident only): `api.platform_break_glass_open(tenant_id, reason, minutes ≤ 60)`
  for `platform_owner` with a fresh step-up. It creates a time-boxed grant
  row, and the RLS read path honours only active grants. Each read during the
  grant is audited. It is read-only and expires automatically. The Founder
  mailbox gets a notice. The terms and privacy policy must state that ORUWA
  support may access tenant data for support with a log (Founder legal input, §10).
- **Audit:** new `audit.platform_audit_logs(id, actor_id, actor_role, aal, action, target_tenant_id null, target_entity, target_id, reason, metadata, ip, user_agent, created_at)`,
  append-only (insert-only grant, no update/delete, trigger guard), kept at
  least 1 year (UNCERTAIN: legal minimum; Founder/advisor). The log covers
  console sign-in, MFA enroll/verify/fail, every RPC call, break-glass
  open/close and staff changes. Writes that touch a tenant also go to that
  tenant's `audit.audit_logs` (actor_kind `platform`).
- **Headers:** CSP without third-party origins, `frame-ancestors 'none'`,
  `X-Robots-Tag: noindex`, no analytics. Optional IP allow-list on Vercel's
  firewall once on Pro (UNCERTAIN: plan availability).
- **MFA:** TOTP (authenticator app) is required. Enrol on first console
  sign-in, before any page loads. Phone MFA is optional (UNCERTAIN: whether
  it costs extra). Each staff member keeps two factors (e.g. phone app +
  backup device), and the recovery runbook is written before go-live.

### 6.3 What moves into the console (Phase B scope)

Tenant list/search (DEBT-113 d pagination), provisioning create/retry (from
`apps/web`), tenant status (plan, billing, last activity, usage per tenant —
DEBT-097), suspend/resume (Founder gate in production), resend Owner invite.
Later: billing overview (MRR, past_due list), break-glass, staff management.

## 7. Domains, DNS, Vercel

| Record | Value | Note |
|---|---|---|
| `oruwa.jp` (apex) | `A` to the IP Vercel shows on the domain card | [Vercel: add a domain](https://vercel.com/docs/domains/working-with-domains/add-a-domain), DOC |
| `www.oruwa.jp` | `CNAME` (project value) → redirect to apex | same |
| `app.oruwa.jp`, `admin.oruwa.jp`, `admin-preview.oruwa.jp` | `CNAME` to the project-specific value | subdomains use CNAME (DOC) |
| existing mail records (`auth.oruwa.jp`, `notifications.oruwa.jp` for Resend, MX) | **unchanged** | change only A/CNAME. Do not move nameservers without copying MX/TXT first (Vercel warns about this, DOC) |

- UNCERTAIN: where `oruwa.jp` points today. The old site has a Sakura deploy
  workflow (`D:\Dev\oruwa-web\oruwa-web\.github\workflows\deploy-sakura.yml`).
  Moving the apex to Vercel is a production DNS change, so it needs a Founder
  gate.
- Vercel Hobby is non-commercial (AGENTS.md). The site, app and console all
  move to Pro at the first paying client. Until then the site can stay on a
  preview URL.

## 8. Billing (Stripe Billing)

### 8.1 Model

- One Stripe Customer + one Subscription per tenant. ORUWA stores no card
  data. Sign-up goes through Stripe Checkout (`mode=subscription`). Account
  management goes through the Customer Portal.
- **The webhook is the source of truth:** Stripe → `billing.webhook_events` →
  `billing.subscriptions` → `core.tenant_plans.status` → access
  (`core.has_module_access` + write gate). The app never sets paid state from
  a redirect (`success_url`).
- **Trial lives in ORUWA, not in Stripe** (recommendation). Provisioning
  already sets `core.tenant_plans` to `trial` with `trial_ends_at` = +30 days,
  no card (Founder 2026-10-19). Stripe objects are created only when the
  Owner clicks 「お申し込み」. If that is before the trial ends, Checkout sets
  `subscription_data.trial_end` = the remaining ORUWA trial, so the first
  charge is on day 31. Reasons: no Stripe objects for tenants that never
  convert; no spam risk from free card-less trials (Stripe's own warning,
  [free trials](https://docs.stripe.com/billing/subscriptions/trials/free-trials), DOC);
  and the portal cannot *update* subscriptions with trial offers, only cancel
  them ([portal limits](https://docs.stripe.com/customer-management), DOC).
  The alternative is a Stripe trial without card, with
  `trial_settings.end_behavior.missing_payment_method=pause` (same page). It
  is kept for self-serve sign-up later.

### 8.2 Data model draft (`billing` schema; every table has `tenant_id`, RLS on, writes by service role only)

| Table | Columns (draft) | Notes |
|---|---|---|
| `billing.customers` | `tenant_id` pk → core.tenants, `stripe_customer_id` unique, `livemode`, `created_at` | no email/name/address here: they live in Stripe (fewer PII copies) |
| `billing.prices` | `stripe_price_id` pk, `plan_code` → `core.entitlement_plans`, `interval` (`month`/`year`), `currency` (`jpy`), `unit_amount` (tax incl., display), `is_active`, `livemode` | maps Stripe prices to ORUWA plans; global catalog, no `tenant_id` (like `core.entitlement_plans`) |
| `billing.subscriptions` | `tenant_id` unique, `stripe_subscription_id` unique, `stripe_customer_id`, `stripe_price_id` → billing.prices, `status` (Stripe's: `trialing/active/past_due/unpaid/canceled/incomplete/incomplete_expired/paused`), `current_period_end`, `cancel_at`, `trial_end`, `past_due_since`, `grace_until`, `last_event_id`, `last_event_at`, `updated_at` | one row per tenant; updated only by the webhook processor |
| `billing.webhook_events` | `stripe_event_id` pk, `type`, `livemode`, `object_id`, `tenant_id` null, `received_at`, `processed_at`, `status` (`received/processed/ignored/failed`), `attempts`, `error_code` | idempotency: `insert … on conflict do nothing`, then process. Stripe can deliver an event twice and in any order; it recommends logging processed event ids ([webhooks](https://docs.stripe.com/webhooks), DOC). No full payload (may contain billing PII) |
| `billing.invoices` (optional, not at launch) | `stripe_invoice_id` pk, `tenant_id`, `number`, `status`, `amount_due`, `amount_paid`, `currency`, `period_start/end`, `hosted_invoice_url`, `created_at` | only if the console needs MRR/past_due lists without calling Stripe |

### 8.3 Server pieces (all server-only; AGENTS.md rule 4 keeps the service role and the Stripe secret out of `apps/web`)

| Piece | Kind | Does |
|---|---|---|
| `stripe-webhook` | Edge Function, `verify_jwt=false` | verifies `Stripe-Signature` on the raw body (5-minute tolerance), inserts the event id, returns 2xx fast. Then it re-fetches the subscription from the API (ordering-safe) and calls `billing.apply_subscription_state(...)`. Signature + raw body + quick 2xx per [Stripe webhooks](https://docs.stripe.com/webhooks), DOC |
| `billing-checkout` | Edge Function, `verify_jwt=true` | caller must hold `core.billing.manage` in its tenant. Creates the customer if missing (`metadata.tenant_id`) and a Checkout Session, returns the URL |
| `billing-portal` | Edge Function, `verify_jwt=true` | same check. Creates a portal session with `return_url=https://app.oruwa.jp/owner/billing` ([integrate portal](https://docs.stripe.com/customer-management/integrate-customer-portal), DOC) |
| `billing.apply_subscription_state` | SQL, `SECURITY DEFINER`, service role only | maps Stripe status → `core.tenant_plans`; writes `audit.audit_logs` |

Events to subscribe to (minimum): `checkout.session.completed`,
`customer.subscription.created|updated|deleted|paused|resumed`,
`customer.subscription.trial_will_end`, `invoice.paid`,
`invoice.payment_failed`, `invoice.payment_action_required`,
`charge.dispute.created`, `charge.refunded`
([subscription webhooks](https://docs.stripe.com/billing/subscriptions/webhooks), DOC).

### 8.4 Status mapping and grace

| Stripe | ORUWA `core.tenant_plans.status` | Access |
|---|---|---|
| (no subscription, ORUWA trial running) | `trial` | full |
| ORUWA trial ended, no subscription | `suspended` (reason `trial_ended`) | **read-only 7 days**, then sign-in closed; data kept 90 days (Founder 2026-10-19) |
| `trialing`, `active` | `active` | full |
| `past_due` and `now() < grace_until` | `past_due` | full + banner to the Owner (grace, default 14 days — Founder input; Stripe Smart Retries runs meanwhile) |
| `past_due` after grace, `unpaid` | `suspended` (reason `payment`) | read-only, Owner can still open billing |
| `canceled` | `canceled` | read-only 7 days → closed → purge after 90 days |
| `incomplete`, `incomplete_expired` | unchanged | first payment never succeeded: no access change |

Stripe's Dashboard setting decides what happens after the last retry
(cancel / unpaid / stay past_due). Choose **cancel** so the state machine
stays simple (same webhook page, DOC).

### 8.5 Access enforcement (the hard part)

- Reads: `core.has_module_access` gets the plan layer its header reserves.
  It returns false when the plan status is closed (after the read-only window).
- **Read-only needs a write gate.** Today `has_module_access` is one boolean
  used by read *and* write policies. Read-only therefore needs a new
  `core.tenant_can_write(tenant)` in every write policy and every mutating
  RPC. This is a large mechanical migration. VERIFY in Phase D: list all write
  paths first, then estimate. It is the main D risk.
- Stripe Entitlements (Features on Products,
  `entitlements.active_entitlement_summary.updated`,
  [entitlements](https://docs.stripe.com/billing/entitlements), DOC) is
  **not used at launch**. Modules come from ORUWA packages (0129), and one
  plan unlocks the package. Revisit when add-on modules are sold.

### 8.6 Tiers draft

| | Launch (Founder 2026-10-19) | Later |
|---|---|---|
| Plans | **one plan**, all Cafe modules, no staff/location limits; monthly (+ yearly with discount, open) | add-on modules, second package, per-location pricing |
| Stripe | 1 Product, 1–2 Prices (JPY, month/year) | more Products/Prices; maybe Entitlements |
| Trial | 30 days, no card (ORUWA-side) | Stripe-side trial for self-serve |
| Display | tax-included total price (税込) | — |

**Conflict to resolve (Founder):** `D:\Dev\ORUWA-Sales-Kit-1\02-Sales-System\content\commercial-source-of-truth.md`
lists three Cafe tiers with setup fees (Start ¥14,800/mo + ¥148,000;
Operations ¥29,800/mo + ¥298,000; Multi-site ¥49,800〜) and a paid pilot of
¥99,000. That contradicts "one plan, free 30-day trial, no card". Setup fees
would be one-off Prices on the first invoice (Checkout `line_items` with a
one-time price — UNCERTAIN combined with `trial_end`; test in D).

### 8.7 Japan specifics

- Invoices: Stripe invoices can serve as 適格請求書 once the registration
  number (登録番号, "JP TRN") is set. Stripe does not fill every required
  field automatically
  ([Stripe JP invoices](https://stripe.com/guides/best-practices-for-setting-up-invoicies-in-japan), DOC).
  The Founder supplies the number. A tax advisor confirms the invoice layout.
- 特定商取引法に基づく表記: required items include legal name, address,
  phone, email, head of operations, fees, cancellation/returns, delivery,
  payment methods and timing, and price incl. consumption tax. Link the page
  from the site footer and register it in Stripe so Checkout shows it
  ([Stripe commerce disclosure](https://support.stripe.com/questions/how-to-create-and-display-a-commerce-disclosure-page), DOC).
  The final confirmation screen must show quantity, price, payment, period
  and cancellation terms
  ([消費者庁 特定商取引法ガイド 通信販売](https://www.no-trouble.caa.go.jp/what/mailorder/), DOC).
  UNCERTAIN: how much of this applies to B2B-only sales. Decide with an
  advisor; publishing the page is needed for Stripe review anyway.
- Privacy policy under the APPI
  ([個人情報保護委員会](https://www.ppc.go.jp/personalinfo/), DOC):
  processors (Supabase, Vercel, Stripe, Resend, LINE), foreign transfer
  (data regions), support access with logs (§6.2), retention 90 days.

## 9. Phasing (each phase = PRs with their own review + live check)

| Phase | Content | Gate |
|---|---|---|
| **A** | this plan + `docs/product/oruwa-web-reuse-review.md` | Lead (Founder reads) |
| **B-0** | migration: remove the staff bypass from `is_member_of`/`has_permission`; `core.platform_staff`; `audit.platform_audit_logs`; aal2 check helper; pgTAP (staff JWT sees no tenant rows; aal1 staff gets `insufficient_privilege` on `api.platform_*`) | DB/security PASS, Cloud DEV apply |
| **B** | `apps/admin` (Next current major, shared auth package), MFA enrol/verify, idle/absolute timeout, step-up; move `/admin/tenants`; tenant status + usage; `admin-preview.oruwa.jp` + allow-list | security + UX + general review; live QA on admin-preview with TOTP |
| **C** | `/owner` cabinet (summary, plan, profile, members) without payments; billing page shows "準備中" | UX/i18n review, live QA as an Owner (`oruwa.jp+owner1`) |
| **D** | `billing` schema, 3 Edge Functions, status mapping, write gate (§8.5), Stripe **test mode** end-to-end (trial → checkout → paid → failed card → grace → suspended → paid again → canceled), with Stripe test clocks | DB/security PASS; Lead live test in test mode; **production keys = Founder gate** |
| **E** (parallel with B–D) | `apps/site`: reference analysis → structure → copy → real screenshots from the clean demo tenant (4D) → build | UX review, Lighthouse, live check on the preview URL |
| **F** | legal pages (特商法, privacy, terms) JA; native JA review of site + cabinet + emails; DNS apex switch; Stripe live mode | **Founder gate** (legal texts, production DNS, live payments) |

Order per handoff 2026-10-25: 4C → 4D → production pack → native JA review →
this phase. Phase A may be written during 4C (done here).

## 10. Founder inputs (one list)

1. **Stripe account** (business JP, owner identity, bank account): test keys
   first; live keys only at F.
2. **Prices**: monthly price (tax incl.), yearly yes/no and discount; setup
   fee yes/no; paid pilot yes/no. This resolves the Sales Kit conflict in §8.6.
3. **Grace period** on failed payment (proposal 14 days) and the
   after-retries behaviour (proposal: cancel).
4. **Legal texts**: 特定商取引法に基づく表記 (legal name, address, phone,
   responsible person; whether to disclose on request), privacy policy, terms
   of service (support access with log, 90-day retention, cancellation,
   refunds). Professional review recommended.
5. **適格請求書発行事業者 登録番号** (if registered) and a tax advisor's OK on
   the invoice layout.
6. **Reference sites** for the sales site: 3–5 sites the Founder likes, each
   with a line on why.
7. **DNS access** for `oruwa.jp` (registrar / current host) and the decision
   to move the apex from Sakura to Vercel (or keep Sakura for the static site).
8. **Customer-facing plan name** (open since 2026-10-19).
9. **Support address** `support@oruwa.jp` before production (DEBT-113 a).
10. **Brand/trademark check** for "ORUWA" (Sales Kit brand note says it is
    unverified).

## 11. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Removing the staff bypass breaks hidden dependencies (seed scripts, pgTAP, smoke tools, the 0135 list) | console or tooling stops working | B-0 first, with a full pgTAP run and a list of every `is_platform_staff()` call site before the change |
| Read-only write gate touches every write path | big migration, regressions | D starts with an inventory; pgTAP per module; live QA on a suspended test tenant |
| Webhook missed or delayed (Edge Function cold start, outage) | wrong access state | idempotent table + Stripe retries for 3 days (DOC) + a daily reconcile job (list subscriptions → compare) |
| Owner pays but the webhook fails | paid customer locked out | grace defaults to access; console alert on `failed` events; reconcile job |
| MFA lockout of the only `platform_owner` | no console | two factors per staff, documented recovery via Supabase dashboard (production = Founder) |
| Console session stolen (XSS) | cross-tenant actions | strict CSP, no third-party JS, aal2 + step-up, short sessions, audit |
| Legal pages incomplete | Stripe review fails, consumer-law exposure | F gate; professional review |
| Hobby plan used commercially | ToS breach | Pro at the first paying client (AGENTS.md) |
| `oruwa.jp` DNS move breaks mail | lost auth/reminder emails | change only A/CNAME; keep MX/TXT; check Resend domain status after |
| Generated images on the site without clear rights | brand/legal | see the reuse review §4; prefer real product screenshots |

## 12. Sources (checked 2026-10-25)

- Stripe: [subscription webhooks](https://docs.stripe.com/billing/subscriptions/webhooks) · [webhooks best practices](https://docs.stripe.com/webhooks) · [Customer portal](https://docs.stripe.com/customer-management) · [integrate portal](https://docs.stripe.com/customer-management/integrate-customer-portal) · [free trials](https://docs.stripe.com/billing/subscriptions/trials/free-trials) · [entitlements](https://docs.stripe.com/billing/entitlements) · [build subscriptions](https://docs.stripe.com/billing/subscriptions/build-subscriptions) · [commerce disclosure (JP)](https://support.stripe.com/questions/how-to-create-and-display-a-commerce-disclosure-page) · [JP invoices](https://stripe.com/guides/best-practices-for-setting-up-invoicies-in-japan)
- Supabase: [MFA / aal](https://supabase.com/docs/guides/auth/auth-mfa) · [sessions](https://supabase.com/docs/guides/auth/sessions) · [redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)
- Vercel / Next.js: [monorepos](https://vercel.com/docs/monorepos) · [add a domain](https://vercel.com/docs/domains/working-with-domains/add-a-domain) · [proxy (ex-middleware)](https://nextjs.org/docs/app/api-reference/file-conventions/proxy) · [data security / Server Actions CSRF](https://nextjs.org/docs/app/guides/data-security)
- Security: [OWASP Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html) · [GitHub sudo mode](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/sudo-mode) · [GitLab Admin Mode](https://docs.gitlab.com/administration/settings/sign_in_restrictions/)
- Japan: [消費者庁 特定商取引法ガイド 通信販売](https://www.no-trouble.caa.go.jp/what/mailorder/) · [個人情報保護委員会](https://www.ppc.go.jp/personalinfo/)
- Not verified: how Linear, Vercel or Stripe internally separate their own
  staff consoles is not publicly documented in a citable form. GitHub sudo
  mode and GitLab Admin Mode are used as the documented analogues instead.
