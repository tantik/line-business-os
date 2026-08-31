# Supabase Legacy JWT API Keys → Current API Key Model — Migration Runbook

- Status: **Active — code compatibility layer for BOTH keys merged/​in-review;
  Cloud cutover steps not yet run.**
- Scope: **Cloud DEV only** (`line-business-os-dev` / `pehcoenozjtsjdvjietj`).
  **Production is a separate project (`jsgmmsdkuptdsxtcxhsv`) with its own
  independent keys and is NOT touched or considered migrated by this work.**
  Production must be audited and migrated independently, later.
- Trigger: a DEV `service_role` credential was displayed in a Claude session and
  is treated as exposed. Founder decision (2026-08): do **not** rotate the
  legacy JWT signing secret; instead migrate backend + app usage to the current
  API key model, then disable the exposed legacy keys once all dependents are
  off them.

This runbook covers **both** halves of the legacy→current key migration:

| Legacy (JWT) | Current (API key) | Privilege | Consumers |
|---|---|---|---|
| `anon` | `sb_publishable_*` | low — app key, RLS still applies | browser, SSR, middleware, Node user client, `invite-employee` user-scoped client, operator user clients |
| `service_role` | `sb_secret_*` | high — bypasses RLS, server-only | `invite-employee` Auth-Admin calls, operator `createServiceClient()` scripts |

> **Do NOT rotate the JWT signing secret. Do NOT touch production. Do NOT
> disable any legacy key until its "legacy consumers = 0" gate (§6) passes.**

## 0. Dependency map (from the Phase 1 inventory)

| Consumer | Legacy uses | After migration |
|---|---|---|
| `apps/web` browser / SSR / middleware | `NEXT_PUBLIC_SUPABASE_ANON_KEY` (+ RLS) | central resolver prefers `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, falls back to `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| `apps/web` health / invitations / liff-entry callers | same, via `requirePublicSupabaseEnv()` | same central resolver (one code path) |
| CI / GitHub Actions | nothing — no Supabase key passed | no change |
| `packages/db` `createUserClient()` (used by `apps/api`) | `SUPABASE_ANON_KEY` via `serverEnv()` | `serverEnv().supabaseUserKey` — `SUPABASE_PUBLISHABLE_KEY` preferred, `SUPABASE_ANON_KEY` fallback |
| `packages/db` `createServiceClient()` (`seed`, `oruwa-cafe-fixture`) | `SUPABASE_SERVICE_ROLE_KEY` via `serverEnv()` | `serverEnv().supabasePrivilegedKey` — `SUPABASE_SECRET_KEY` preferred, legacy fallback |
| `apps/api` / `apps/worker` deployed | not deployed anywhere (no deploy config in repo) | code compatible; nothing to deploy |
| Edge `invite-employee` privileged calls | `SUPABASE_SERVICE_ROLE_KEY` (auto-injected) | `_shared/supabase-secret-key.ts` → `SUPABASE_SECRET_KEYS["default"]`, legacy fallback |
| Edge `invite-employee` user-scoped client | `SUPABASE_ANON_KEY` (auto-injected) alongside caller JWT | `_shared/supabase-publishable-key.ts` → `SUPABASE_PUBLISHABLE_KEYS["default"]`, legacy `SUPABASE_ANON_KEY` fallback (RLS unchanged) |
| Edge `liff-entry` | `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_ANON_KEY` (auto-injected) | **not deployed; deferred LINE/LIFF work; not in scope.** `verify_jwt = false` unchanged. |
| Local Supabase (`supabase start`) | universal local-dev demo JWTs (non-secret) | **not migrated** — not real credentials |
| `packages/db/scripts/mame-to-cha-cloud-*` (`MAME_TO_CHA_*`) | legacy `MAME_TO_CHA_CLOUD_SUPABASE_SERVICE_ROLE_KEY` | **NOT migrated** — deprecated historical pilot tooling, not current ORUWA architecture (Founder, 2026-08). Not referenced by CI or any runtime (only unit tests, with fake clients). Do not add new `MAME_TO_CHA_*` vars. Candidate for deletion in a separate cleanup PR. |
| Vercel env (`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, Prod+Preview) | historical | **not changed by the code phase.** Preview gets `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` added in §2; Production is separate. |

## 1. Phase 1 — code compatibility (this PR / the one before it)

**No keys, no Cloud, no Vercel, no deploy. Dual support so the cutover can be
incremental and reversible.**

- **Low-privilege key — web** (`@line-os/config/env/public`): the public schema
  accepts **either** `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (preferred) **or**
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` (temporary fallback). At least one — a
  value-free config error otherwise. `parsePublicEnv()` exposes
  `supabasePublishableKey` + `supabasePublishableKeySource`
  (`publishable` | `legacy_anon`). `apps/web/src/lib/supabase/env.ts` is the one
  place that feeds it `process.env`; browser client, server client, middleware,
  health probe, invitations caller and the LIFF caller all consume that single
  resolved `{ url, key, keySource }`.
- **Low-privilege key — Node** (`@line-os/config/env`): `serverEnv()` accepts
  **either** `SUPABASE_PUBLISHABLE_KEY` (preferred) **or** `SUPABASE_ANON_KEY`
  (fallback); at least one. `serverEnv().supabaseUserKey` resolves it,
  `supabaseUserKeySource` records which. `packages/db`'s `createUserClient()`
  uses `supabaseUserKey` — sent **alongside** the caller's `accessToken`, which
  stays the identity context; RLS unchanged. It never uses a privileged key.
- **Precedence lives once** in `resolveLowPrivilegeSupabaseKey`
  (`packages/config/src/env.public.ts` — no secret, no `.default()`), shared by
  the public schema and the server schema (`./env.ts` re-imports it) so the
  fallback logic cannot drift between clients.
- **Privileged key — Node** (unchanged from the earlier PR): `serverEnv()`
  accepts `SUPABASE_SECRET_KEY` (preferred) or `SUPABASE_SERVICE_ROLE_KEY`
  (fallback); `serverEnv().supabasePrivilegedKey` /
  `supabasePrivilegedKeySource`. `createServiceClient()` reads it. **Not
  changed by the low-privilege PR.**
- **Edge Functions** (unchanged from the earlier PR):
  `_shared/supabase-secret-key.ts` (privileged) and
  `_shared/supabase-publishable-key.ts` (user-scoped) resolvers — read the
  JSON `SUPABASE_*_KEYS` env, use `"default"`, fall back to the legacy env var,
  fail closed, never log the value. `invite-employee` uses both; `liff-entry`
  uses the secret-key resolver only. **No Edge change in the low-privilege
  web/Node PR.**
- **Operator tooling**: `oruwa-cafe-fixture-write.ts` signs in with
  `serverEnv().supabaseUserKey`; `generate-recipe-translations.ts` rides the
  web resolver (`requirePublicSupabaseEnv()`); `seed.ts` uses only
  `createServiceClient()` (no low-privilege key needed — the shared schema's
  "at least one low-privilege key" requirement is a minimal contract, not a new
  dependency). `mame-to-cha-cloud-*` deliberately untouched.
- **Guards**: the ESLint `no-restricted-syntax` guard blocks `process.env`
  reads of the **privileged** keys (`SUPABASE_SERVICE_ROLE_KEY` /
  `SUPABASE_SECRET_KEY` / `SUPABASE_SECRET_KEYS`) in app code; the
  low-privilege publishable key is intentionally **not** guarded (it is an app
  key). `apps/web` may import only `@line-os/config/env/public`.
- **Tracked config**: `.env.example`, `turbo.json`,
  `supabase/functions/.env.example` document the new preferred vars with
  placeholders; legacy `anon` vars marked temporary fallback.

**Legacy support is NOT removed in Phase 1.**

## 2. Phase 2 — Preview publishable-key cutover (Vercel Preview only)

> `[verify]` every dashboard action against the current Supabase / Vercel UI.

1. `[verify]` Supabase dashboard → project `pehcoenozjtsjdvjietj` → Project
   Settings → API Keys → confirm a **Publishable key** (`sb_publishable_*`)
   exists (create if not). Publishable keys are not secret, but still capture
   the value into the password manager rather than a terminal / chat.
2. In **Vercel → the `apps/web` project → Settings → Environment Variables**,
   add `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = <sb_publishable_*>` scoped to
   **Preview only**. **Do not touch** the existing
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `NEXT_PUBLIC_SUPABASE_URL` (Prod+Preview) —
   they remain as the rollback fallback.
3. Redeploy the Preview branch. The central resolver now returns
   `keySource = 'publishable'` on Preview; Production still uses `legacy_anon`.

## 3. Phase 3 — Preview acceptance

- **Preview `/api/health`** → `200` `{app/config/supabase: ok}`.
- **App login** on Preview → succeeds; a protected dashboard page renders real
  tenant-scoped data (browser publishable + RLS path).
- **`invite-employee`** on a DEV smoke tenant → succeeds (its own resolver,
  already Cloud-verified — this just confirms nothing regressed).
- **Tenant isolation spot check** — a Manager on tenant A cannot read tenant B
  data on Preview (RLS still the boundary with the publishable key).
- **Browser bundle** → DevTools / deployed `_next/static` shows only the
  publishable key; **no** `sb_secret_`, no `service_role`, no 3-part JWT with a
  privileged role.
- Founder sign-off recorded before Phase 4.

## 4. Phase 4 — operator cutover

- In the repo-root gitignored **`.env`** (the generic ORUWA operator secret
  store — see `.env.example`, `docs/operations/env-inventory.md`): set
  `SUPABASE_PUBLISHABLE_KEY=<sb_publishable_*>` and
  `SUPABASE_SECRET_KEY=<sb_secret_*>` alongside the other Cloud DEV values.
  Leave `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` in place as
  untriggered rollback fallbacks.
- **Verify the privileged key — dedicated READ-ONLY smoke**
  (`packages/db/scripts/secret-key-smoke-cli.ts`): consumes only `SUPABASE_URL`
  + `SUPABASE_SECRET_KEY`, one privileged read-only Auth-Admin call
  (`getUserById` on the all-zero UUID), prints one token. Value-free supply via
  a gitignored `packages/db/.env.secret-key-smoke.local`; run
  `node --import tsx --env-file=packages/db/.env.secret-key-smoke.local packages/db/scripts/secret-key-smoke-cli.ts`;
  expect `SECRET_KEY_SMOKE_OK`; delete the env file; `git status` clean.
- **Verify the low-privilege key**: run one operator user-client path with
  **only** `SUPABASE_PUBLISHABLE_KEY` set (no `SUPABASE_ANON_KEY`) —
  e.g. `oruwa-cafe-fixture-write.ts` **dry run** (no `--confirm-apply`) — and
  confirm `supabaseUserKeySource` resolves `publishable` and the sign-in +
  read succeed. **No Cloud writes, no seed, no real invitations.**
- `pnpm exec supabase migration list --linked` (read-only) as a second check.

## 5. Phase 5 — Edge Functions on the new resolvers

6. Merge the Phase 1 code to `dev`.
7. `[verify]` Set the DEV project's Edge Function secret **`SUPABASE_SECRET_KEYS`**
   to `{"default":"<new-secret-key>"}` (Supabase dashboard → Edge Functions →
   Secrets, or `supabase secrets set` — Founder-run). `SUPABASE_PUBLISHABLE_KEYS`
   is auto-injected by the platform; `[verify]` a `"default"` entry exists.
8. `[verify]` Deploy `supabase functions deploy invite-employee` from `dev`
   (Founder-run). **Do NOT deploy `liff-entry`.**
9. Confirm from the function logs:
   `invite-employee.privileged_key_source = secret_keys_default` and
   `invite-employee.publishable_key_source = publishable_keys_default`.
   *(As of 2026-08, Cloud DEV already reports both — re-confirm after any
   redeploy.)*

## 6. Legacy consumers = 0 gate

Do **not** proceed to §7 until **all** of these hold for Cloud DEV:

- Preview redeployed with `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; acceptance
  (§3) passed and Founder-signed.
- Operator `.env` on `SUPABASE_PUBLISHABLE_KEY` + `SUPABASE_SECRET_KEY`; both
  smokes (§4) green.
- `invite-employee` redeployed; logs show `secret_keys_default` +
  `publishable_keys_default` (§5.9).
- A fresh static scan (§ "Legacy inventory", below) shows **zero** ACTIVE
  DIRECT LEGACY references — only TEMPORARY FALLBACK / TEST / DOC /
  DEPRECATED-MAME-TO-CHA remain.
- Vercel **Production** still intentionally on the legacy `anon` key (that is a
  separate, later migration — not a blocker for disabling DEV keys, because DEV
  and Prod are separate projects with separate keys).

## 7. Phase 7 — Founder-controlled DEV legacy JWT disable

**Founder action only. Irreversible-ish (see §8).** Only after §6 fully passes:

- `[verify]` In the DEV project's dashboard, disable/revoke the **legacy
  `anon` key** and the **legacy `service_role` key** (NOT the JWT signing
  secret). If the platform only offers a JWT signing-secret roll (which also
  invalidates any remaining JWT-based key), **STOP and escalate** — that is a
  wider operation than this closeout authorises.
- Remove `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` from the operator
  `.env` and from the DEV Edge Function secrets.

## 8. Phase 8 — post-disable acceptance

Re-run §3 **and** §4 with the legacy keys gone. Everything must work purely on
`sb_publishable_*` / `sb_secret_*`:

- Preview `/api/health` `200`; login; tenant-scoped render; tenant isolation.
- `invite-employee` on a DEV smoke tenant.
- Both operator smokes.
- Browser bundle clean.
- `supabase projects list` shows Production (`jsgmmsdkuptdsxtcxhsv`) unchanged;
  no production deploy triggered.

## 9. Rollback

- **Phase 2 fails**: delete `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` from Vercel
  Preview and redeploy — the resolver reverts to `legacy_anon`.
- **Phase 4 fails**: clear `SUPABASE_PUBLISHABLE_KEY` / `SUPABASE_SECRET_KEY`
  from the operator `.env`, keep the legacy vars — resolvers fall back with no
  other change.
- **Phase 5 fails**: unset/clear `SUPABASE_SECRET_KEYS` (or fix its JSON) — the
  Edge resolvers revert to the legacy env vars; redeploy.
- **Phase 7 is the only hard-to-reverse step.** Do not do it until §3/§4 have
  passed twice and the new keys have baked. If it is done and something breaks,
  create fresh `sb_publishable_*` / `sb_secret_*` keys rather than trying to
  un-disable.

## 10. Phase 9 — cleanup (later, separate PRs)

- A follow-up PR removes the legacy branch from
  `resolveLowPrivilegeSupabaseKey` and `resolveSupabaseSecretKey` /
  `resolveSupabasePublishableKey`, makes `SUPABASE_PUBLISHABLE_KEY` /
  `SUPABASE_SECRET_KEY` (and their `NEXT_PUBLIC_` / `_KEYS` forms) required,
  drops the legacy vars from the schemas, `.env.example`, `turbo.json`, and
  tightens the ESLint guard message. Only after Cloud DEV has run clean on the
  new keys for a sensible bake period.
- **Separately**: delete the deprecated
  `packages/db/scripts/mame-to-cha-cloud-*` tooling + `MAME_TO_CHA_*` env vars.
- **Production** (`jsgmmsdkuptdsxtcxhsv`): its own independent audit + migration
  + cutover + acceptance, tracked separately. **Not covered here and not
  implied by any DEV phase above.**

## Legacy inventory — classification after the code phase

Re-run a repo-wide search for `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`,
`SUPABASE_PUBLISHABLE_KEYS`, `SUPABASE_SECRET_KEYS` and classify each hit:

- **ACTIVE DIRECT LEGACY** — a current ORUWA runtime/tooling path that reads a
  legacy var with no publishable/secret preference in front of it. **Must be 0**
  after the code phase.
- **TEMPORARY FALLBACK** — the `?? legacy` branch inside a resolver, or a legacy
  var in `.env.example` / `turbo.json` marked temporary. Expected; removed in
  §10.
- **TEST** — fixtures / unit tests exercising the fallback or asserting
  value-free errors.
- **DOC** — this runbook, `docs/operations/env-inventory.md`, ADRs.
- **DEPRECATED / HISTORICAL** — `mame-to-cha-cloud-*` + `MAME_TO_CHA_*`. Not
  migrated by design.

## Explicit non-goals

- **No JWT signing-secret rotation.**
- **No production project change** — Production is separate and not migrated by
  this work.
- **No `db push` / `migration repair` / RLS / migration / permission change.**
- **No `verify_jwt` change** (`invite-employee` stays `true`, `liff-entry`
  stays `false`).
- **No `liff-entry` deploy.**
- **No removal of legacy support before §6** (that is §10).
