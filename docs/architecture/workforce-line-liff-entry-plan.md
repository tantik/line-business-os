# Workforce LINE / LIFF Entry Plan

Status: **Design doc only. No LINE integration exists in this repo today,
no SQL migrations are created in Phase 1K, and no production database
behavior changes as part of this phase.** Phase 1L/1M will create new,
forward-only migrations after review, if and when this plan is implemented;
already-applied migrations are never edited.
Phase: 1K. Read with:
[`workforce-production-mvp-architecture.md`](./workforce-production-mvp-architecture.md),
[`workforce-data-model.md`](./workforce-data-model.md),
[`workforce-rls-security-plan.md`](./workforce-rls-security-plan.md),
`supabase/migrations/0004_line_registry.sql`,
[`../security/security-requirements.md`](../security/security-requirements.md) §4.

**This document is a plan for future work, not a description of anything
currently active.** No LIFF app, Rich Menu, or LINE Official Account
integration is implemented in this codebase today. `core.line_channels` and
`core.line_accounts` (from `0004_line_registry.sql`) are schema scaffolding
only — no code path currently writes to or reads from them for Workforce.

## 1. Goal

Let cafe staff and managers open the real, production Workforce app (Phase
1L) from LINE — the channel they already use daily — instead of a separately
bookmarked URL, while keeping LINE as a thin entry/notification layer over
the same tenant-scoped, RLS-protected data described in
[`workforce-data-model.md`](./workforce-data-model.md) and
[`workforce-rls-security-plan.md`](./workforce-rls-security-plan.md).

## 2. What LINE is used for

- **Entry point**: a Rich Menu button in a LINE Official Account that opens
  the Workforce app via LIFF (LINE Front-end Framework), so staff never need
  to install a separate app or remember a URL.
- **Identity linking**: associating a LINE user id with a specific
  `workforce.staff_profiles` row (via `staff_line_links`, or `core.
  line_accounts`, per `workforce-data-model.md` §`staff_line_links`), so the
  app can resolve "which tenant/location/staff member is this" without a
  separate password login.
- **Notification channel**: push messages for events a staff member or
  manager should notice promptly (e.g. a correction request decision), sent
  through the existing per-tenant `core.line_channels` config, once that
  path is actually built (Phase 1M or later, not this MVP).

## 3. What LINE is not used for yet

- LINE is **not** the database. Every real business fact (shifts, work
  reports, recipes, correction requests) lives in Postgres under `workforce`/
  `core`, exactly as described in
  [`workforce-data-model.md`](./workforce-data-model.md) — LINE never becomes
  a second source of truth, a shadow data source, or a workaround for RLS.
- LINE is **not** used for mass/broadcast messaging in this plan. No feature
  in this document sends a message to more than one recipient at a time
  (§13 makes this an explicit manual-approval boundary).
- LINE is **not** used to auto-approve or auto-execute sensitive actions
  (correction approval, shift decisions). A LINE notification may tell a
  manager "a correction request is waiting," but the approval action itself
  still happens in the authenticated app, subject to the same
  `workforce.correction.approve` permission and audit trail as any other
  entry point (per `workforce-rls-security-plan.md` §7, §11).
- LINE is **not** implemented anywhere in the current codebase. This
  document does not claim otherwise, and the existing `/demo/cafe*` demo
  routes have no LINE integration either (Phase 1J-2 closeout, confirmed).

## 4. Browser demo vs. production LINE entry

| | `/demo/cafe*` (today) | Production LINE entry (this plan) |
| --- | --- | --- |
| Access | Public URL, no login, no LINE | LIFF entry from a LINE Rich Menu, tied to a real tenant/staff identity |
| Data | Hardcoded mock arrays, local state | Real `workforce`/`core` tables, RLS-enforced |
| Identity | Client-side `CURRENT_STAFF_ID` constant | LINE user id linked to a real `staff_profiles` row via `staff_line_links` |
| Persistence | None (resets on reload) | Real, tenant/location-scoped, audited |
| Purpose | Sales demo / conversation starter | Actual daily staff/manager tool for a real client |

The demo stays exactly as it is (per the production architecture doc §14);
this plan describes a separate, later, authenticated surface that happens to
also be reachable from LINE.

## 5. LINE Official Account concept

Each tenant (cafe client) that wants LINE entry has its own LINE Official
Account, with channel credentials stored in `core.line_channels`
(`channel_id`, `channel_secret_encrypted`, `channel_access_token_encrypted`,
`liff_id`), scoped by `tenant_id` and optionally `location_id` — this table
already exists from `0004_line_registry.sql` and needs no schema change for
this plan. Setting up a tenant's LINE Official Account (creating it in the
LINE Developers console, obtaining channel credentials) is a manual,
per-client onboarding step, not something this platform automates.

## 6. Rich Menu concept

A Rich Menu is the fixed-image menu LINE shows under a chat with an Official
Account. Following the constraint already documented in the Phase 1J-2
closeout (production plan §7): **two buttons only** — 勤務アプリ (Workforce
app) and レシピ (Recipes) — kept deliberately simple rather than trying to
surface every feature as a separate button. Rich Menu content/images are a
per-tenant configuration concern (each cafe's branding), set up manually
during client onboarding, not generated dynamically by the platform in this
MVP.

## 7. LIFF/Web App entry concept

- A LIFF app is a web app (the same `apps/web` Workforce routes from the
  production architecture doc §14) opened inside LINE's in-app browser via
  a `liff_id` registered against the tenant's LINE channel.
- On open, the LIFF SDK provides a LINE user id (via `liff.getProfile()` or
  the ID token) to the app, which is then exchanged, server-side, for the
  linked `staff_profiles` identity (§8) — never trusted as a bare identity
  claim without server-side verification.
- The same authenticated Workforce routes work identically whether opened
  via LIFF (inside LINE) or directly in a normal browser (e.g. a manager
  using a laptop) — LIFF is an entry wrapper, not a separate app surface.

## 8. Staff identity linking flow

Conceptual flow, not final implementation:

1. A staff member taps the Rich Menu's 勤務アプリ button.
2. LIFF opens the Workforce app inside LINE, providing a LINE ID token.
3. `apps/api` verifies the ID token against LINE's servers (or via the LIFF
   SDK's server-side verification flow) and extracts the LINE user id.
4. `apps/api` looks up `staff_line_links` (or `core.line_accounts`, per the
   data model doc's open decision) by the blind-index hash of that LINE user
   id, scoped to the tenant the Rich Menu/LIFF app belongs to.
5. **If a link exists**: resolve to the linked `staff_profiles` row,
   establish an app session for that identity, proceed into the app.
6. **If no link exists yet** (first-time open): the staff member is guided
   through a manager-initiated or self-service linking step (e.g. entering a
   one-time code a manager gave them, or a manager approving a pending link
   request) — never an automatic, unverified self-link, since that would let
   anyone claim to be any staff member. Exact UX is an implementation
   decision for Phase 1M, not fixed here.
7. Once linked, `staff_line_links`/`core.line_accounts` stores the
   encrypted LINE user id + blind-index hash (per
   `workforce-rls-security-plan.md` §13) for future opens.

## 9. Tenant/location routing

- The LIFF app's `liff_id` is registered against one `core.line_channels`
  row, which carries `tenant_id` (and optionally `location_id`). Opening the
  app via that Rich Menu therefore already identifies which tenant the
  request belongs to before any staff-identity lookup happens.
- If a tenant has multiple locations sharing one LINE Official Account, the
  staff member's linked `staff_profiles.location_id` (or an explicit
  location-selection step, if a channel spans locations) determines which
  location's data they see — following the same location-isolation rules as
  direct web access (`workforce-rls-security-plan.md` §5).
- No cross-tenant routing exists or is planned: a LIFF app tied to tenant A's
  channel can never resolve into tenant B's data, because the tenant id
  comes from the channel configuration itself, not from anything the client
  supplies.

## 10. Security concerns

- LINE ID token verification must happen server-side (`apps/api`), never
  trusting a client-supplied "this is LINE user X" claim without
  cryptographic verification — analogous to the existing webhook signature
  requirement in `security-requirements.md` §4, even though this is a
  frontend entry flow rather than a webhook.
- LINE user ids are personal data: stored encrypted + blind-indexed
  (`workforce-rls-security-plan.md` §13), never logged in plaintext, never
  joined across tenants.
- The staff-identity-linking step (§8) is the highest-risk part of this
  entire plan — an unverified self-link would let anyone claim any staff
  member's identity and see their shift/work-report data. It must require
  either manager-side approval or a one-time verification code, never a bare
  "type your name" self-link.
- Channel secrets/access tokens (`core.line_channels`) are encrypted at
  rest and used only server-side (`apps/api`), matching the existing PII/
  secret-handling posture — never sent to `apps/web`.
- Rich Menu images/content, being per-tenant branding, are not
  security-sensitive themselves, but the Rich Menu configuration
  (which `liff_id` it opens) must be verified to point at the correct
  tenant's LIFF app during setup, so a copy-paste error during onboarding
  can't route one tenant's Rich Menu into another tenant's app instance.

## 11. MVP implementation plan

Sequenced after the base Workforce MVP (production architecture doc §15)
is proven over direct authenticated web access — this is Phase 1M, not part
of the phase-3/4 slices:

1. Manual LINE Official Account setup for the first pilot client (console
   work, not code).
2. `core.line_channels` row created for that tenant (already supported by
   existing schema).
3. Minimal LIFF entry route in `apps/web` that accepts a LINE ID token and
   calls an `apps/api` verification endpoint.
4. Staff identity linking flow (§8) — manager-approved or one-time-code
   based, whichever is simpler to implement safely first.
5. Rich Menu with the two-button constraint (§6), configured manually
   per-tenant during onboarding.
6. RLS/permission verification pass for the LIFF entry path specifically
   (own-tenant, cross-tenant, anon, no-JWT — same pattern as
   `workforce-rls-security-plan.md` §12), since this introduces a new
   identity-resolution code path that the direct-web-login flow doesn't
   have.

## 12. Later enhancements

- Push notifications for correction-request decisions, shift-assignment
  publication, or 要確認 alerts reaching a manager — one-to-one messages
  only, sent through `core.line_channels`' access token, never broadcast.
- Recipe access directly from the Rich Menu's レシピ button, reusing the
  same authenticated recipe read surface as the manager/staff app (not a
  separate public recipe view — the demo's public `/demo/cafe/recipes`
  stays the sales artifact, per the production architecture doc §9).
- Multi-location Rich Menu routing, if a tenant's staff work across more
  than one location and need to pick which one at entry time.
- LINE-based re-linking/unlinking flow for staff turnover (a departing staff
  member's LINE link should be revocable by a manager).

## 13. What requires manual approval

Per this platform's existing highest-risk constraints
(`CLAUDE.md`), the following are never automated by this plan and always
require explicit human approval before happening:

- Creating or configuring a tenant's real LINE Official Account and Rich
  Menu (console-level, per-client, manual).
- Enabling the LIFF entry path for a specific tenant in production.
- Any mass or broadcast LINE messaging capability — explicitly excluded
  from this plan entirely, not just deferred.
- Any correction-request approval, shift decision, or other sensitive
  business action — LINE may notify that something is waiting, but a human
  manager performs the actual approval in-app, every time (per
  `workforce-rls-security-plan.md` §7, §11).
- Linking a staff member's LINE identity for the first time — requires
  manager-side confirmation or a verified one-time code (§8, §10), never an
  automatic self-link.
