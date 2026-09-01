# ORUWA Master State

| Field | Value |
|---|---|
| Checkpoint | #1 |
| Date | 2026-09-01 |
| Repository | `tantik/line-business-os` |
| Verified baseline | `dev` HEAD `ffc4b2e`; `origin/dev` == local `dev`; working tree clean; CI green |
| Cloud DEV | `line-business-os-dev` / `pehcoenozjtsjdvjietj` |
| Production | `jsgmmsdkuptdsxtcxhsv` — **separate project, effectively empty, untouched** |
| Governed by | `docs/foundation/core-laws-and-product-dna.md` (supreme), then `docs/foundation/platform-foundation-roadmap.md` (engineering order), then `docs/strategy/oruwa-master-roadmap.md` (phase sequence) |

> **Purpose.** One-read recovery of "what ORUWA is, what has actually been
> built, what decisions bind, what is unfinished, what happens next." Not a
> changelog. When this file and an older document disagree, this file's
> **§C (stale sources)** wins for the facts it lists; the normative docs above
> win for principles.

---

## 1. What ORUWA Is

- **One multi-tenant SaaS platform** for Japanese SMBs — not a collection of
  apps, not a per-client codebase. One repo, one Vercel project, one shared
  Supabase/PostgreSQL database.
- **Scale model:** `ONE SaaS → shared Platform Foundation → reusable domain
  capabilities → vertical products/packages → tenants → locations`.
  A new client is a **new tenant** (configuration + seed), never a code copy.
  Target: 100–300+ tenants per successful vertical, multiple verticals on the
  same Core.
- **Vertical product = a composition** of several reusable capabilities
  (Cafe = Workforce + Inventory + Purchases + Recipes/Knowledge + …). A vertical
  is never a single module and never an isolated project.
- **LINE** is the intended primary customer channel (messaging, LIFF login).
  The web application is usable **independently of LINE** — LINE is a channel,
  not a dependency.
- **Japan-first** (language, UX, workflows) without architectural isolation
  from future markets.

---

## 2. Binding Product / Architecture Principles

Currently enforced or actively upheld (subset of Core Laws + Platform Foundation):

- **One platform, many verticals.** No tenant-specific fork; differences are
  configuration / reusable capability / shared module (Core Law 11).
- **Tenant is a security boundary.** Every business table has
  `tenant_id uuid not null`; `location_id uuid` where data belongs to a
  physical branch. Cross-tenant joins forbidden.
- **RLS is mandatory** — tenant isolation lives in the database. Every table
  gets an RLS policy in the same migration.
- **`tenant_id` is derived from the authenticated user's membership**, never
  from the request body.
- **No privileged key in the browser.** `apps/web` holds only the public
  low-privilege key (`sb_publishable_*`) + RLS. The privileged
  `sb_secret_*` / service-role is server-only.
- **Two-layer authorization:** `core.has_permission[_in_tenant](...)` in code
  **and** RLS in the database; `SECURITY DEFINER` `api.*` RPCs re-verify
  permission themselves.
- **Module access is backend-enforced:** `core.has_module_access(tenant, module)`
  is ANDed with permission on every tenant-facing path for the gated product
  schemas; a missing/OFF module fails closed and preserves historical data.
- **PII encryption + blind index** for email/phone/address/customer name/
  employee name/LINE user id (`*_encrypted` + `*_hash`).
- **Audit every mutation** (`writeAudit` / `audit.audit_logs`).
- **AI proposes → human approves → backend applies → audit** (Core Law 4/6).
- **Entitlements before conditional code**; **platform billing ≠ merchant
  payments** (separate domains — Core Law 11.4 / 11.5).
- **Migrations are append-only**; applied historical migrations are not edited.
- **Replaceable technology, stable product laws.**

---

## 3. Current Technical Architecture

### CURRENT (implemented)

- **Monorepo:** pnpm workspaces + Turbo.
  - `apps/web` — Next.js (App Router). The real product surface.
    **Deployed: Vercel Preview only** (`preview.oruwa.jp`).
  - `packages/*` — `core` (tenant context, RBAC, audit), `db` (Supabase client
    factories, crypto), `config` (env resolvers), `line` (messaging + webhook
    signature verify), `ai` (proposal pattern), `ui`, `workforce`, `booking`.
- **Data / backend:** Supabase (PostgreSQL + Auth + Edge Functions).
  - **~109 migration files**, numbered through `0113` (`main`'s historical
    `0070`–`0073` are absent from the `dev` lineage — see §6); **52 pgTAP**
    test files.
  - Schemas: `core`, `audit`, `workforce`, `inventory`, `content`, `ai`,
    `operations`, `booking` (scaffold), plus the app-facing `api` facade.
  - **App write path (canonical):** Next.js Server Action → `api.*` facade
    view / `SECURITY DEFINER` RPC, called with the **caller's own JWT**, RLS +
    re-verified permission. `api` is the only PostgREST-exposed product schema
    besides `public`.
  - **Edge Functions:** `invite-employee` (**deployed** — Supabase Auth Admin
    for staff invites; requires `SUPABASE_SECRET_KEYS`/`SUPABASE_PUBLISHABLE_KEYS`);
    `liff-entry` (**not deployed**).
- **Auth:** Supabase Auth (email/password). Staff onboarding
  invite → email → password-setup → `api.accept_employee_invitation` is proven
  end-to-end. Transactional email via custom SMTP (Resend) on the Preview Auth
  project.

### FUTURE / PLANNED (exists as code but not the live path, or not built)

- `apps/api` (NestJS) — an **explicit local-only dev spike, never deployed**.
  The service-role write path described in
  `docs/architecture/overview.md` is **superseded** for the Cafe product by the
  `api.*` facade + `SECURITY DEFINER` RPC pattern above (see §C).
- `apps/worker` — job/reminder scaffold, **not deployed**.
- `/platform` or `/ops` internal admin namespace — reserved, not built.

---

## 4. Security Baseline

- Tenant isolation: `tenant_id` + RLS on every business table; two-layer
  authorization; `SECURITY DEFINER` RPCs re-check permission.
- Module-OFF security: `core.has_module_access` (0093) enforced on
  `workforce` / `inventory` / `booking` / `ai` / `purchases` (0094–0098,
  "Module Access Security Remediation", complete 2026-08-26).
- PII: AES-256-GCM column encryption + HMAC blind index; PII never logged;
  health/diagnostic payloads value-free.
- **Supabase API-key migration — COMPLETE for Cloud DEV (2026-09-01):**
  legacy JWT-based `anon` + `service_role` API keys **DISABLED**; the new
  `sb_publishable_*` / `sb_secret_*` model is **mandatory** — active code fails
  closed with no legacy fallback (`ACTIVE RUNTIME LEGACY FALLBACK = 0`).
  JWT signing keys untouched. Production untouched.
  Runbook: `docs/operations/supabase-secret-key-migration-runbook.md`.
- ESLint guard: `apps/web` may import only `@line-os/config/env/public`;
  reading a privileged key via `process.env` in app code fails lint.
- Known gap: `/dashboard/admin` has **no role/permission gate** (Defect A) —
  currently inert (RLS-scoped reads return empty, actions are disabled
  placeholders) but must be gated before any privileged action is wired there.

---

## 5. Environment / Deployment Model

| Environment | State |
|---|---|
| **Local** | `supabase start` + `pnpm dev`. Verified working; the default dev loop. |
| **Cloud DEV** (`pehcoenozjtsjdvjietj`) | Migrations applied through `0113`; new API-key model active; `invite-employee` deployed. Founder-run for all Cloud writes (agent is permission-denied from `db push`/`link`). |
| **Vercel Preview** (`preview.oruwa.jp`) | The live app surface. Authenticated Manager/Staff flows verified post API-key migration. |
| **Production** | **Does not exist.** No production Supabase data, no production Vercel target, `main` has no release. Merging `dev→main` and deploying to production are two separate, unstarted Founder gates. |

`.cursor/rules/*` + `docs/operations/env-inventory.md` hold the current
variable-name inventory. Secret values are never in the repo.

---

## 6. Platform Foundation State

Critical path (per `platform-foundation-roadmap.md` §10):
`Entitlements → Module Registry → Shared Navigation/Settings → Notifications → Event Bus`.
Historically built on `main` (`0069`–`0073`, 2026-08-16), then re-expressed
forward-only into `dev` as `0106`–`0113` and applied to Cloud DEV (2026-08-29,
"Platform Foundation reconciliation, Option A").

| Capability | Status | Notes |
|---|---|---|
| Tenancy (`core.tenants`) | **IMPLEMENTED** | Security boundary. Stable. |
| Locations (`core.locations`) | **IMPLEMENTED** | Operational boundary. |
| Identity / Auth (`core.users`, Supabase Auth) | **IMPLEMENTED** | Single identity for tenant + platform staff. |
| Roles / Permissions / RBAC | **IMPLEMENTED** | `core.roles/permissions/role_assignments`; `module.entity.action` strings; two-layer (code + RLS). |
| Audit (`audit.audit_logs`) | **IMPLEMENTED** | Platform-level, not module-local. Reference pattern. |
| Module ON/OFF gate (`core.has_module_access`) | **IMPLEMENTED** | Enforced on 5 product schemas (0093–0098). |
| Entitlements / Plans engine | **PARTIAL** | `entitlement_plans`, `plan_default_limits`, `tenant_plans` (seeded, 4 tenants `standard/active`), `tenant_entitlement_limits`, `get/check_entitlement_limit()` exist (0106). **Not wired into `has_module_access`** — plan-lifecycle gating deliberately deferred. |
| Module Registry (`core.module_registry`) | **PARTIAL** | Metadata (version, lifecycle, min-plan, deps) + nav columns + `can_enable_module()` pre-check (0107). Runtime gate stays the simple `has_module_access`. **Not consumed by `apps/web`** (nav is still static). |
| Shared Settings (`core.tenant_settings` + `core.settings.manage`) | **PARTIAL** | Table + permission exist (0108). Not yet a used app contract. |
| Shared Navigation | **PARTIAL** | `apps/web` has a `(protected)` shell; not formalized as a platform contract, not registry-driven. |
| Notifications (`core.notifications` outbox) | **PARTIAL** | Append outbox table only (0109). **No dispatch worker, nothing sends.** LINE notifications, where they exist, are still module-local. |
| Event Bus (`core.events`) | **PARTIAL** | Append-only publish log + `publishEvent` helper (0110). **No consumer/subscription registry, no subscribers.** |
| Platform Billing | **PLANNED** | Not built. Depends on Entitlements. |
| Customer Portal | **PLANNED** | Not built. Depends on Billing + Entitlements. |
| Platform Admin / Ops Console | **PLANNED** | Route namespace reserved; not built. |
| AI Platform (cross-module) | **PARTIAL** | `ai.proposals` / `ai.prompt_logs` approval pattern only. |
| Integrations framework | **PLANNED / DEFERRED** | LINE registry is the single integration; generalizing now would be premature. |

**Summary:** the critical-path components are **structurally present on `dev`
and Cloud DEV**, but several are "table + policy exist, not wired into the
application." Phase 6 (Reconciliation) is substantially done; what remains is
**finish-wiring + verification**, not new schema construction.

---

## 7. ORUWA Cafe Current State

### Cafe v2.1 — CLOSED, Founder Acceptance PASS (2026-08-26)

Implemented capability groups (Manager + Staff, bilingual JA/EN, mobile):

- **Workforce:** staff management, shift types, weekly schedule, shift
  preferences, attendance / clock in-out, attendance corrections, shift
  requests, shift exchange (with manager decision + replacement assignment).
- **Inventory:** Daily Stock Check, item photos, shortage detection,
  permanent-delete with history-safety.
- **Purchases:** shortage → shopping list → "Bought" → inventory quantity
  update → requirement recompute (staleness-safe).
- **Recipes / Manuals:** CRUD, photos + lightbox, JA/EN auto-translation.
- **Staff ↔ Manager Mail:** two-way messaging (replaced the dead-end daily
  message card).
- **Needs Attention:** compact Manager action queue (corrections, exchanges,
  unavailable-conflicts, inventory shortage).
- **Staff auth provisioning:** invite → email → password → accept, proven E2E.

`preview.oruwa.jp` is the acceptance surface. Cafe Hardening / Deferred Debt
(P2/P3 from the Whole-Product Gate) remains a durable, non-blocking register.

### Cafe v2.2 (= master-roadmap Phase 3)

Phase 2 (Product Research) runs **externally with ChatGPT**. Only **WP1** is
scoped and authorized in-repo.

| WP | Scope source | Status (repo evidence) |
|---|---|---|
| **WP1 — Operations (+ Cafe HACCP presets)** | `docs/product/cafe-package-v2-2-wp1-operations-scope-2026-08-28.md` | **Backend IMPLEMENTED & merged & on Cloud DEV** (`0099`–`0105`): `operations` schema, checklist templates/items, task schedules/instances/item-responses/exceptions, effective-dated schedule versioning, template-retirement dating, 9 `api.operations_*` config RPCs, three-layer security, pgTAP-covered. Module registered **`beta`**. **Enabled for NO tenant. Module-ON Cloud smoke NOT performed. No Manager/Staff Operations UI. No Cafe HACCP preset content.** |
| **WP2 — Issues / Handover** | *no repo document* | **NEEDS FOUNDER DEFINITION.** Named only in the checkpoint-mission prompt. |
| **WP3 — Purchasing v2** | *no repo document* | **NEEDS FOUNDER DEFINITION.** (Purchases v1 shipped in v2.1.) |
| **WP4 — Recipe Intelligence Lite** | *no repo document* | **NEEDS FOUNDER DEFINITION.** |
| **WP5 — Owner / Manager Control Center** | *no repo document* | **NEEDS FOUNDER DEFINITION.** |

Approved conceptual scheduling priority (holds regardless of Phase 2):
**Manual Manager Assignment > Manager-locked preference > Employee preference
> Algorithmic fallback** — automation must never silently overwrite a manual
assignment.

---

## 8. Application Surfaces

| Surface | Route(s) | Status |
|---|---|---|
| Manager (canonical) | `/manager` | **IMPLEMENTED**, Founder-accepted |
| Staff (canonical) | `/staff` | **IMPLEMENTED**, Founder-accepted |
| Inventory / Purchases / Recipes | `/inventory`, `/purchases`, `/recipes` | **IMPLEMENTED** (popup + page) |
| Legacy workforce routes | `/dashboard/workforce/{manager,staff,recipes}` | redirect to canonical |
| Tenant admin (members) | `/dashboard/admin` | **PARTIAL** — thin member table, **NOT role-gated** (Defect A); inert placeholder |
| LINE LIFF login | `/liff-entry`, `/auth/liff-callback` | **PARTIAL** — code complete, Edge Function **not deployed**, feature not enabled |
| Preview / demo / marketing | `%5Fclient-preview/mame-to-cha/**`, `/mame-to-cha/**`, `/demo/cafe/**` | present; "Surface A" retain-vs-retire is an **open Founder decision** |
| Owner | — | not a distinct surface; "owner" is a role |
| ORUWA internal Admin | `/platform` \| `/ops` | **PLANNED**, not built |
| Production app | — | **does not exist** |

---

## 9. Integrations / Major Capabilities

| Capability | Status | Evidence |
|---|---|---|
| Workforce | **IMPLEMENTED** (Cafe) | §7 |
| Inventory | **IMPLEMENTED** (Cafe: Daily Stock Check + photos) | §7 |
| Purchases | **IMPLEMENTED** (Cafe) | §7 |
| Recipes / Knowledge | **IMPLEMENTED** (Cafe) | §7 |
| Operations | **BACKEND ONLY** — no UI, not enabled | §7 |
| Booking | **SCAFFOLD** | schema + `@line-os/booking` + `/booking` stub + reminder job; salon vertical not started |
| LINE Messaging API | **PARTIAL** | `@line-os/line` (messaging + webhook signature verify), `core.line_channels`; no deployed webhook consumer; not production-wired |
| LIFF | **PARTIAL** | code complete, not deployed / not enabled |
| Notifications (delivery) | **PARTIAL** | `core.notifications` outbox only; no dispatcher |
| Analytics | **NOT BUILT** | Manager has an estimated-labour-cost section; no analytics module |
| AI Customer Support / AI Sales Agent / RAG | **PLANNED** | roadmap Phases 11+; only the `ai.proposals` pattern exists |
| CRM | **PLANNED** | future module |
| Billing / subscriptions | **PLANNED** | `NEEDS VALIDATION` (provider, JP tax/invoice) |
| Email | **PARTIAL** | Supabase Auth transactional email only (invite/recovery, custom SMTP on Preview) |

---

## 10. AI Development Operating Model

```
Founder
  → AI CTO / Lead (main chat) — repository is the source of truth
  → Engineer / Claude Code execution (feature branch)
  → Independent Reviewer (oruwa-reviewer / /code-review)
  → CI (typecheck · test · build · lint · Vercel)
  → autonomous DEV merge via scripts/ai-dev-merge.sh   (base=dev only)
  → Founder-controlled RED actions
```

- **Autonomous (AI CTO, no per-step Founder confirmation):** inspection,
  implementation inside an approved scope, tests, refactor, PR, CI, **merge
  into `dev`** once the DEV MERGE gate passes. Merges go **only** through
  `scripts/ai-dev-merge.sh` (re-verifies base=`dev`, OPEN, not-draft,
  MERGEABLE, CI all-pass; **refuses RED paths**). Raw `gh pr merge` is denied
  in `.claude/settings.json`.
- **Founder-controlled (RED):** `main`, production, production/RED-path DB
  migrations (`supabase/migrations/**`), secrets / env / key material,
  critical auth / RLS / tenant-isolation changes, destructive data or Git
  operations, mass external communication, billing execution, connecting
  critical integrations.
- **Routing:** repository/implementation truth → Claude; external / market /
  competitor / strategic research and product-scope selection → ChatGPT
  (Founder-led); product acceptance, UX preference, commercial and RED
  decisions → Founder. Do not use the Founder as CI / QA engineer / Git
  operator.
- **Founder-facing language:** **Russian** (machine-readable content excepted).

Canonical detail: `docs/ai/ORUWA_AI_ENGINEERING_OPERATING_MODEL.md`,
`docs/ai/oaes-project-profile.md`.

### Forecasting policy (binding)

For significant ORUWA work, estimates state **best case / working estimate /
risk range / assumptions & schedule risks** — the optimistic number is never
presented as the commitment. When scope, a security finding, architecture
work, or an external dependency changes materially, **recalculate the ETA
explicitly**. Do not reuse the retired "~8 weeks" figure.

### Architecture-selection principle (binding)

Prefer current, well-supported, secure, extensible solutions of reasonable
complexity; weigh future migration/rework cost. Do **not** take temporary
shortcuts that predictably need expensive replacement, and do **not** add
infrastructure or framework complexity merely because it is modern. For
fast-moving external tech/APIs, check current official documentation before
deciding.

---

## 11. Completed Major Foundations

Milestones that materially change future development speed:

1. **Core Platform** — tenancy, locations, identity, two-layer RBAC, audit,
   PII crypto, the `api.*` facade + `SECURITY DEFINER` RPC write pattern.
2. **Module Access Security** — backend-enforced module ON/OFF across all
   product schemas (data preserved when OFF).
3. **Platform Foundation critical path reconciled** into `dev` + applied to
   Cloud DEV (`0106`–`0113`): entitlements data model, module registry,
   `tenant_settings`, notifications outbox, event bus — structurally present.
4. **Cafe v2.1** — a complete, Founder-accepted vertical product.
5. **Operations module backend** (Cafe v2.2 WP1-A) — reusable operational
   execution layer, generic (no HACCP hardcoding).
6. **Supabase API-key migration** — off legacy JWT keys onto the current
   publishable/secret model, fail-closed, legacy fully removed.
7. **Staff auth provisioning** proven end-to-end.
8. **AI Development governance** — reviewer workflow + autonomous `dev` merge
   with a RED-path guard.

---

## 12. Open Technical Debt

**P1**

- `/dashboard/admin` has no role/permission route gate (Defect A). Block any
  privileged wiring there until fixed.
- `main` ↔ `dev` divergence is unreconciled (`main` still carries historical
  `0069`–`0073`; `dev` is authoritative). Release governance
  (`dev → main → production`) is **undefined**. Must be resolved before the
  first production release.

**P2**

- Platform Foundation "present but not wired": entitlements not enforced at the
  module gate; module registry not driving navigation; notifications outbox
  has no dispatcher; event bus has no consumers.
- Operations module unproven on Cloud (module-ON smoke never run) and has no
  Manager/Staff UI; no Cafe HACCP preset content.
- **ENV Cleanup & Consolidation** — not started.
- Cafe Hardening / Deferred Debt register (P2/P3 from the Whole-Product Gate).
- Delete deprecated `packages/db/scripts/mame-to-cha-cloud-*` + `MAME_TO_CHA_*`
  (retired pilot tooling; kept only as historical).

**P3**

- Stale normative-adjacent docs describe an early/superseded state and mislead
  a fresh reader: `PROJECT_BRIEF.md` §11–17, `docs/product/modules.md`,
  `docs/architecture/overview.md` (request-flow + "anon key"), `AGENTS.md`
  read-order §10–12, several `docs/phase-1*.md`. See §C.
- Three Platform-Foundation-reconciliation P3s (inputs for a future Operations
  config write-path / limit-view UI).
- "Surface A" (`mame-to-cha` preview tree) retain-vs-retire — Founder decision.
- Native Japanese copy review (`I18N-JA-1`) — needs a native speaker.

---

## 13. Commercial Readiness

| Level | Verdict |
|---|---|
| **TECHNICALLY IMPLEMENTED** | ✅ Cafe v2.1 (its accepted scope). Operations backend. |
| **DEMO READY** | ✅ Cafe on `preview.oruwa.jp` with realistic reference data. |
| **PILOT READY** | ⚠️ **Approaching, not confirmed.** Needs: a stable environment that is not "Preview", the Operations/HACCP piece if promised, and a real onboarding rehearsal. No pilot has run. |
| **SELLABLE** | ❌ No billing, no self-serve provisioning, no Customer Portal, no ORUWA Admin, no production environment, no real customer validation. |
| **PRODUCTION READY** | ❌ `main`/release governance undefined; production project empty; no operational tooling. |

**Commercial honesty (Core Law 14):** do not claim beyond
"available with limitations / pilot". Do not make a public "one-hour
onboarding" claim before a successful rehearsal.

---

## 14. Roadmap From This Checkpoint

Master roadmap phase pointer: **Phase 1 (Cafe v2.1 Completion) is effectively
CLOSED.** The repo sits between Phase 1 and the continuation of Phase 3 (Cafe
v2.2 WP1-A). Phase 6 (Platform Foundation Reconciliation) is **substantially
done** — it collapses to "finish wiring + verify".

Founder's stated near-term direction (this session), to be sequenced by the
Founder/CTO:

1. **Master State Checkpoint #1** — this document.
2. **ENV Cleanup & Consolidation** — env vars/docs sprawl.
3. **Deprecated Mame To Cha cleanup** — delete `mame-to-cha-cloud-*` +
   `MAME_TO_CHA_*`.
4. **Continue / finish Cafe v2.2** — Operations Cloud module-ON smoke →
   Manager/Staff Operations UI → Cafe HACCP presets; then WP2–WP5 **once
   defined**.
5. **Full Cafe v2.2 Acceptance** (master-roadmap Phase 4).
6. **SaaS Hardening** (Phase 5) — security/architecture/reliability/performance
   audit; finish-wiring the Foundation Services.
7. **Tenant Provisioning + Clean Tenant Acceptance** (Phases 7–8) — the
   "new tenant with zero code change" test (`go-to-market-roadmap.md` §7).
8. **Commercial Infrastructure** (Phase 9) — Demo, Customer Portal, ORUWA
   Admin, Billing.
9. **Go-to-Market + AI Sales + Real Commercial Validation** (Phases 10–12).
10. **Product #2 Research → Development** (Phases 13–14).

**FOUNDER/CTO DECISION REQUIRED:** the exact ordering of items 2–4 (ENV Cleanup
vs Mame cleanup vs Operations Cloud smoke vs Operations UI vs starting the
Foundation finish-wiring). Repo evidence does not fix this. No phase beyond the
current one is authorized to start without a distinct Founder go-ahead.
**No dates.**

---

## 15. Product #2 Rule

Product #2 is **NOT** a new standalone SaaS codebase. It is:

```
Vertical Blueprint  +  Reuse / Gap Analysis against Platform Foundation
   +  existing Platform Foundation  +  new reusable capabilities only where necessary
```

It must reuse tenants / auth / roles / permissions / audit / notifications /
billing / provisioning / shared modules — a new vertical should primarily
require new **vertical-specific** capabilities, not a rebuilt platform
(master-roadmap Phase 14; Core Law 11; `platform-foundation-roadmap.md` §11).
**Reuse ratio is a decision criterion** for Product #2 scope.

---

## 16. Founder Decisions Currently Binding

- `dev` is the authoritative lineage; `main` reconciliation is a separate
  future task; release governance not yet decided.
- Autonomous DEV merge via `scripts/ai-dev-merge.sh`; `main` / production /
  RED = Founder-only.
- Founder-facing language = Russian.
- Master roadmap (2026-08-25) sequences **Cafe v2.2 before Platform Foundation
  Reconciliation**, superseding `current-task.md` §2.4's earlier ordering.
- **WP1 Operations authorized** (only WP1; only via a separate implementation
  prompt — that prompt was given, WP1-A backend is done). No other v2.2 work
  authorized.
- Operations = a **generic reusable module**; Cafe HACCP = **presets on top**.
  No `haccp` module code, no HACCP capability check, no capability-framework
  redesign in WP1. Photo/evidence **not** in the WP1 MVP.
- Scheduling priority: Manual > locked preference > employee preference >
  algorithm.
- Supabase: **no JWT signing-secret rotation; Production untouched;** Cloud DEV
  legacy `anon`/`service_role` API keys disabled; new key model mandatory.
- Platform subscription billing and merchant payments are **separate domains**.
- No public "one-hour onboarding" claim before a real rehearsal.
- Do not extend the `MAME_TO_CHA_*` convention; it is deprecated.
- Staff identity: one Auth user → at most one `workforce.employees` row **per
  tenant**; changing an employee's contact email must never mutate their Auth
  login email; existing-Auth-user invites send no email (in-app banner accept);
  no LINE Login in staff-auth scope.

---

## 17. Risks / Unknowns

| Risk | Impact | Current mitigation | Resolve by |
|---|---|---|---|
| `main` ↔ `dev` divergence + undefined release path | First production release needs a dedicated reconciliation; `db pull`/`diff` noisy on 5 migration numbers | Documented; `dev` declared authoritative | Before Phase 9 / first sale |
| Foundation Services "present but not wired" | A 2nd vertical or Billing will hit half-built pieces | Phases 5–6 (finish-wiring + verify) | Before Product #2 / Billing |
| Operations unproven on Cloud + no UI | Cafe v2.2 not deliverable | Backend pgTAP-covered; smoke runbook exists | Cafe v2.2 continuation |
| No production env / billing / provisioning | Cannot onboard a paying customer | Roadmap Phases 7–9 | Before real commercial validation |
| WP2–WP5 undefined | Roadmap item 4 cannot be planned | Named only in a prompt | Founder defines scope |
| Browser-QA tooling varies per session | Final Integrated QA may fall back to Founder-screenshot loop | Screenshot loop proven workable | Check at Phase 1 step 4 / hardening start |
| `/dashboard/admin` ungated (Defect A) | Defense-in-depth gap if a privileged action is added | Inert today (RLS-scoped, disabled placeholders) | Before wiring any admin action |
| Native JP copy not reviewed (`I18N-JA-1`) | Product polish / credibility | English-safe fallback copy in place | Before commercial launch |

---

## 18. Exact Current Position

```
LAST CLOSED:
  Supabase Cloud DEV API-key migration — legacy anon/service_role API keys
  DISABLED; new sb_publishable_*/sb_secret_* model mandatory; legacy fallbacks
  removed from active code (PR #477, dev ffc4b2e, 2026-09-01).
  ACTIVE ORUWA RUNTIME LEGACY FALLBACK = 0.

CURRENT:
  Master State Checkpoint #1 (this document). Repo on dev ffc4b2e, clean,
  CI-green. Cafe v2.1 CLOSED (Founder PASS). Operations WP1-A backend merged +
  on Cloud DEV, module 'beta', enabled for NO tenant, no UI. Platform
  Foundation critical path structurally reconciled onto dev + Cloud DEV
  (several pieces "table exists, not wired").

NEXT (Founder selects the order):
  ENV Cleanup & Consolidation  |  deprecated Mame To Cha cleanup  |
  Cafe v2.2 continuation (Operations Cloud module-ON smoke → Manager/Staff
  Operations UI → Cafe HACCP presets)  |  SaaS Hardening.
  Master roadmap suggests: finish Cafe v2.2 → Phase 4 acceptance → Phase 5
  hardening.

BLOCKERS:
  None blocking this checkpoint or dev development.
  For "take a paying customer": no production environment, no billing, no
  provisioning, no Customer Portal, main/release governance undefined.

DO NOT START YET (each needs an explicit Founder prompt):
  Cafe v2.2 WP2–WP5 (undefined), Product #2 research, Platform Billing,
  Customer Portal, ORUWA internal Admin, production deploy, dev→main merge,
  any new vertical.
```

---

## Appendix C — Stale / Conflicting Sources Found (2026-09-01 audit)

MEMORY.md and dated handoffs are historical evidence only. Conflicts resolved
in favour of current code / Cloud DEV state / Founder-verified baseline:

| Topic | Stale source | Current truth |
|---|---|---|
| Supabase API keys | `AGENTS.md` §"Non-negotiable" 4, `PROJECT_BRIEF.md` §9, `docs/architecture/overview.md` ("anon key + RLS"), `docs/operations/env-inventory.md` (pre-Phase-9 rows) | `apps/web` uses the **publishable** key; legacy keys disabled; new model mandatory (§4). Runbook is current. |
| Project phase | `PROJECT_BRIEF.md` §11–17 ("Phase 1C planning underway", "migrations 0000–0012", "no product features") | 109 migrations; Cafe v2.1 shipped & accepted; Operations backend shipped (§7). |
| App request flow | `docs/architecture/overview.md` §"Request flow" (Browser → NestJS `apps/api` → service-role write) | Canonical path is Server Action → `api.*` facade / `SECURITY DEFINER` RPC under the caller's JWT (§3). `apps/api` is an undeployed dev spike. |
| Module list / routes | `docs/product/modules.md` (Inventory "Planned"; routes `/workforce/manager`) | Inventory/Purchases/Recipes/Mail/Operations exist; canonical routes are `/manager`, `/staff` (§7–8). |
| current-task.md §5 "next gate" | dated 2026-08-29, "PR #468 in flight", secret-key Phases A–E "not started" | That whole migration closed 2026-09-01 (§4, §18). |
| Cafe v2.2 authorization | Older `current-task.md` pointers ("no v2.2 work authorized") | WP1 authorized 2026-08-28; WP1-A backend merged (§7). |
| Platform Foundation existence | 2026-08-23 triage ("`main` carries it, `dev` never received it") | Superseded by the 2026-08-29 reconciliation — `0106`–`0113` on `dev` + Cloud DEV (§6). |
| Cafe Commercial Launch ordering | `current-task.md` §2.4 "Sequence" (Platform Foundation before v2.2) | `oruwa-master-roadmap.md` (Founder-approved) places v2.2 first. |

Do **not** fix these in the same task that produced this checkpoint — they are
recorded as P3 debt (§12). The normative documents
(`core-laws-and-product-dna.md`, `platform-foundation-roadmap.md`,
`oruwa-master-roadmap.md`, `oaes-project-profile.md`,
`ORUWA_AI_ENGINEERING_OPERATING_MODEL.md`, `security-requirements.md`,
`docs/adr/*`) were **not** found stale and remain authoritative.
