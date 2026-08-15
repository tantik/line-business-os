# STAFF_ONBOARDING_INVITE_CALLBACK_DEFECT_IMPLEMENTATION_PLAN (2026-08-15)

Reviewed implementation plan for the fresh-user invitation onboarding defect
discovered during ORUWA Cafe v2.1 reference-tenant Staff B acceptance
(`docs/ai/ORUWA_CAFE_V2_1_REFERENCE_TENANT_REPORT_2026-08-14.md` §33-34,
Defect C). **Planning only — nothing in this document has been implemented,
deployed, or applied.** Staff B remains in its intentionally-left limbo
state and was not touched while writing this plan. No Supabase Auth
configuration, database data, or RLS was modified.

---

## 1. Verified root cause

A brand-new Staff invite goes through this exact chain:

1. Manager clicks "招待する" → `invite-employee` Edge Function calls
   `serviceClient.auth.admin.inviteUserByEmail(email, { redirectTo:
   '<SITE_URL>/auth/accept-invite?invitation_id=<id>' })`
   (`supabase/functions/invite-employee/index.ts:138,236-248`).
2. Supabase/Resend delivers the email. The recipient clicks it.
3. Supabase's hosted `/auth/v1/verify` endpoint resolves the token,
   **confirms the Auth user, issues session tokens**, and redirects to the
   app's callback URL — but appends the tokens as a **URL fragment**:
   `.../auth/accept-invite?invitation_id=...#access_token=...&refresh_token=...&type=invite`.
4. `apps/web/src/app/auth/accept-invite/route.ts` is a Next.js **server**
   Route Handler. It only reads `url.searchParams.get('code')` (a query
   param). A URL fragment is a client-only construct — **it is never sent
   to the server on the HTTP request line**, so `code` is always `null`
   here.
5. The route's own guard (`if (!code || !invitationId) return
   NextResponse.redirect('/sign-in?error=1')`) fires. The browser preserves
   the untouched fragment across that same-origin redirect (standard
   browser behavior when the `Location` header carries no fragment of its
   own) — producing the observed `/sign-in?error=1#access_token=...`.
6. `/sign-in` is a plain client-side email/password form; it never reads
   `location.hash`. The fragment is inert there. Chrome's saved-password
   autofill independently produced the "Invalid email or password" message
   seen in the screenshot — unrelated to the token itself.
7. Net effect: **the Auth identity is confirmed and a session was issued
   and then discarded**, while `workforce.employee_invitations` stays
   `pending` forever, because the app-level acceptance step
   (`setPasswordAndAcceptInvitation` → `api.accept_employee_invitation`)
   never ran.

This reproduced identically for both Staff A (masked initially by the
separate, now-fixed, Site URL misconfiguration) and Staff B (surfaced
directly once Site URL was corrected). Staff A's actual acceptance in this
session's earlier work happened **only** via a manual, out-of-band Admin API
password reset — the intended email-link → callback → password-setup path
has never once succeeded end-to-end in this repository.

---

## 2. Verified Supabase behavior/evidence (checked against the installed library, not assumed)

Installed versions confirmed from `apps/web/package.json` /
`node_modules/.pnpm`: `@supabase/supabase-js@2.108.2`,
`@supabase/auth-js@2.108.2`, `@supabase/ssr@0.5.2`.

- **`inviteUserByEmail` is explicitly, permanently incompatible with PKCE —
  this is documented in the installed library itself**, not an assumption:

  > `GoTrueAdminApi.js:97` — *"Note that PKCE is not supported when using
  > `inviteUserByEmail`. This is because the browser initiating the invite
  > is often different from the browser accepting the invite which makes it
  > difficult to provide the security guarantees required of the PKCE
  > flow."*

  PKCE fundamentally requires a `code_verifier` the *recipient's* browser
  generates and stores *before* the flow starts, to be matched against the
  `code` on return. An Admin-API-issued invite has no such browser session
  at issuance time, so Supabase cannot and does not use PKCE for it — this
  applies regardless of the calling application's own `flowType` setting.
  **This confirms the current `/auth/accept-invite/route.ts` design
  (PKCE-only `?code=` handling) can never work for this specific link type,
  by Supabase's own design, not due to any local misconfiguration.**

- **`apps/web`'s own Supabase clients do not set `flowType` anywhere**
  (`apps/web/src/lib/supabase/{client,server,middleware}.ts`), so they use
  the library default, **`'pkce'`**. This is why the app was built assuming
  every callback carries `?code=` — correct for user-initiated flows
  (magic link requested from the browser, OAuth), incompatible with
  Admin-API-issued invite/recovery links.

- **`GoTrueClient._getSessionFromURL` (`GoTrueClient.js:3167-3252`, the
  method behind the default `detectSessionInUrl: true` browser behavior)
  actively rejects a flow-type mismatch**: if the client's configured
  `flowType` is `'pkce'` and the URL is implicit-style (or vice versa), it
  throws (`AuthPKCEGrantCodeExchangeError` / `AuthImplicitGrantRedirectError`)
  rather than silently handling it. **Consequence for the plan below**:
  simply mounting the existing global browser client on the callback page
  and relying on its automatic `detectSessionInUrl` parsing would throw,
  not succeed — because that client is (correctly, for the rest of the app)
  configured for PKCE. Any client-side handling of the implicit fragment
  must call the lower-level `supabase.auth.setSession({ access_token,
  refresh_token })` directly (which does not perform this flow-type check),
  not rely on automatic detection, and must not change the global client's
  `flowType`.

- **A server-compatible, officially-documented alternative exists**:
  `admin.generateLink()`'s response includes a `hashed_token` field, and
  `verifyOtp()` accepts `{ token_hash: string; type: EmailOtpType }`
  (`type: 'invite'` is a valid, listed `EmailOtpType`,
  `types.d.ts:686-693`). The `verifyOtp` doc comment in the installed
  library states directly: *"The `TokenHash` is contained in the email
  templates ... You may wish to use the hash for the PKCE flow for Server
  Side Auth."* Unlike `access_token`/`refresh_token`, a `token_hash` is
  delivered as a **query parameter** (via a customized email template, see
  §4 below) — visible to a server Route Handler — and `verifyOtp` can be
  called from the existing SSR **server** client (`@/lib/supabase/server`),
  writing the resulting session straight into cookies via the same
  mechanism `exchangeCodeForSession` already uses. This requires **no**
  switch away from `inviteUserByEmail` (which already sends via the
  configured custom SMTP) — only a change to the **Invite email template's
  link target** in Supabase Auth settings, from the default
  `{{ .ConfirmationURL }}` to one embedding `{{ .TokenHash }}` as a query
  param.

- **Prior investigation already on record**: `admin.generateLink()` itself
  was evaluated and rejected in the original Staff Auth Provisioning design
  (`docs/ai/STAFF_AUTH_PROVISIONING_HANDOFF_2026-08-13.md` §3 Phase 3) —
  but for an unrelated reason that no longer applies: at that time this
  repo had no email-sending infrastructure, and `generateLink` does not
  send email itself. Custom SMTP (Resend) is now configured. This plan does
  **not** propose switching to `generateLink` as the send mechanism —
  `inviteUserByEmail` is kept as-is; only the associated email template's
  link format changes.

---

## 3. Recommended architecture

**Primary recommendation: Option A — server-side `token_hash` verification
via a customized Invite email template.** Documented as Option B below as a
no-Auth-template-change fallback, in case template edits are judged
higher-risk right now than a code change.

### Option A (recommended)

```
Manager invite (unchanged: inviteUserByEmail, same Edge Function)
  → Supabase Auth email, sent via existing custom SMTP (unchanged)
    → link format changes: instead of {{ .ConfirmationURL }}, the Invite
      template links to
      {{ .SiteURL }}/auth/accept-invite?token_hash={{ .TokenHash }}&type=invite&invitation_id=<embedded via redirectTo/RedirectTo template var>
  → ORUWA callback (route.ts): reads token_hash + type from QUERY STRING
    (server-visible), calls supabase.auth.verifyOtp({ token_hash, type })
    using the existing SSR SERVER client — session is written to cookies
    server-side, exactly like exchangeCodeForSession already does
  → authenticated browser session (cookie-based, already working machinery)
  → mandatory password setup (SetPasswordForm — UNCHANGED)
  → api.accept_employee_invitation (UNCHANGED, already correct)
  → tenant/workforce access (UNCHANGED)
```

Only the callback route and the Invite (and, for consistency, Recovery —
see §8) email templates change. No token ever appears in the browser URL
bar/history at any point. `?code=` handling is kept alongside as a no-cost
fallback (see §7).

### Option B (fallback, no Auth template change)

```
Manager invite (unchanged)
  → Supabase Auth email (unchanged, default {{ .ConfirmationURL }})
    → redirect carries tokens in the URL FRAGMENT (Supabase's
      inviteUserByEmail default — cannot be changed without also touching
      the template, so this is the "as-is" delivery format)
  → ORUWA callback becomes a CLIENT-rendered page (not a server Route
    Handler) that, on mount:
      1. reads access_token/refresh_token/type from window.location.hash
      2. calls the BROWSER Supabase client's supabase.auth.setSession({
         access_token, refresh_token }) directly (NOT detectSessionInUrl —
         see §2's flow-type-mismatch finding; setSession bypasses that
         check and works regardless of the client's configured flowType)
      3. immediately clears the fragment from the visible URL
         (window.history.replaceState) so the tokens do not linger in the
         address bar
      4. reads invitation_id from the (untouched) query string, forwards to
         /auth/accept-invite/set-password?invitation_id=... exactly as today
  → mandatory password setup (SetPasswordForm — UNCHANGED)
  → api.accept_employee_invitation (UNCHANGED)
  → tenant/workforce access (UNCHANGED)
```

`@supabase/ssr`'s `createBrowserClient` stores sessions in cookies
(confirmed: `apps/web/src/lib/supabase/client.ts` doc comment, "the session
is stored in cookies and stays in sync with the server client +
middleware"), so a client-established session via `setSession()` becomes
visible to the server on the very next request — `set-password/page.tsx`
and `setPasswordAndAcceptInvitation` need **no changes** under this option
either.

### Why A over B

Option A never places live `access_token`/`refresh_token` values in the
browser's address bar or history at all — only a single-use, short-lived
`token_hash` that is meaningless without a server-side exchange, and that
exchange happens before the browser ever renders anything. Option B
necessarily exposes the real bearer tokens in the URL (even if cleared
within one render cycle) — see §6's security analysis. A is the
Supabase-recommended "Server-Side Auth" pattern for this exact class of
problem per the library's own documentation comment. B remains fully valid
and is the right choice **if** an Auth email-template edit is considered
out of scope for this fix cycle.

---

## 4. Files to change (Option A — recommended path)

| File | Change |
|---|---|
| Supabase Auth → Email Templates → **Invite user** (Studio config, Preview project only) | Change link target from default `{{ .ConfirmationURL }}` to `{{ .SiteURL }}/auth/accept-invite?token_hash={{ .TokenHash }}&type=invite&invitation_id=...` (exact `invitation_id` embedding mechanism — via `{{ .RedirectTo }}` already carrying it, since `redirectTo` is already set by the Edge Function per-invite — to be finalized during implementation, not blind-copy-pasted here). **Auth configuration change — requires the same explicit approval class as the Site URL fix, applied by the Founder, not by an agent.** |
| `apps/web/src/app/auth/accept-invite/route.ts` | Add a `token_hash`/`type` branch: if present, call `supabase.auth.verifyOtp({ token_hash, type: type as EmailOtpType })` via the existing server client; on success, proceed to the same `set-password` redirect as the `code` branch; on failure, same `sign-in?error=1` fallback. Keep the existing `code` branch unchanged (§7). |
| `apps/web/src/app/auth/accept-invite/route.test.ts` (new) | Route-handler tests — see §9. |
| No changes needed to: `set-password/page.tsx`, `SetPasswordForm.tsx`, `invitation-actions.ts`, `invitations.ts`, `invite-employee` Edge Function, any RLS/migration, `api.accept_employee_invitation`. |

If Option B is chosen instead: `apps/web/src/app/auth/accept-invite/route.ts`
stays as a thin fallback for any future PKCE-compatible flow; a new client
component (e.g. `apps/web/src/app/auth/accept-invite/ImplicitCallbackClient.tsx`)
is added and the route's server logic is restructured so the implicit case
renders that client component instead of redirecting away immediately (a
Next.js server component can still read the `invitation_id` query param and
pass it down as a prop; only the token itself needs client-side handling).

---

## 5. Evaluation of each item requested

- **Client-side implicit-token handling + `setSession()`** — viable (Option
  B), verified compatible with `@supabase/ssr`'s cookie-syncing behavior,
  but exposes real bearer tokens in the URL/history, however briefly.
- **Server-side `token_hash`/`verifyOtp` pattern** — viable and preferred
  (Option A), confirmed supported by the installed library and explicitly
  called out in its own docs as the intended pattern for "Server Side
  Auth." Requires an email-template edit.
- **`generateLink` for a safer callback architecture** — not needed as the
  *sending* mechanism (`inviteUserByEmail` already works and already uses
  custom SMTP); the useful part of `generateLink`'s design (the
  `hashed_token`/`token_hash` concept) is achievable by editing the
  existing Invite template's link target without switching APIs.
- **Keeping `?code=` as a fallback** — yes, keep it (§7): free to retain,
  covers any future PKCE-compatible flow (e.g. if `email` sign-in ever adds
  browser-initiated magic links), zero cost to correctness for the invite
  path.
- **Security implications of tokens in URL fragments** — real but bounded:
  fragments are never sent over the wire to any server (not logged by
  Vercel/Next.js server logs, not sent to analytics via normal navigation),
  but they do persist in browser history, `Referer` is not an issue
  (fragments are dropped from `Referer` by browsers), and any third-party
  script running on the landing page *could* read `location.hash` — a
  narrower attack surface than a leaked query-string token but not zero.
  Option A avoids this category of risk entirely by never exposing the
  live token pair to the browser URL.
- **Token cleanup from browser history/address bar** — required if Option B
  is chosen (`window.history.replaceState` immediately after
  `setSession()`, before any further render); not applicable to Option A
  (token_hash is consumed server-side before any page renders, and even the
  `token_hash` itself is single-use and expires quickly, only ever visible
  in Option A's redirect chain, not the final rendered URL post-`verifyOtp`).
- **Replay/expired-link/error handling** — already partly handled:
  `workforce.employee_invitations.expires_at` (7-day ORUWA-side window,
  independent of Supabase's own token TTL) and `api.accept_employee_invitation`'s
  existing expiry/already-accepted/wrong-user checks are unaffected by this
  fix and continue to be the authoritative gate. What's missing today: the
  callback route currently has only one generic failure path
  (`/sign-in?error=1`) for every failure category (expired token, wrong
  type, network error, already-consumed token). Recommend (implementation
  detail, not scope-creep) distinguishing at minimum "link expired/already
  used" from "unexpected error" in the redirect, so `/sign-in` can show a
  clearer message than a bare login form with no context.
- **Interruption recovery (browser closed after Auth confirmation, before
  password setup/app-level acceptance)** — this is exactly Defect C's
  limbo state, and **this plan's callback fix does not by itself resolve
  it** — it only prevents *new* invites from landing in that limbo state
  due to the fragment/PKCE mismatch. A user who closes the tab mid-flow
  under the *fixed* system would still end up "Auth-confirmed, no password,
  invitation pending," just for an ordinary interruption reason instead of
  a systemic redirect bug. Recommend as a **separate**, explicitly-scoped
  follow-up (not bundled into this fix): either (a) a real self-service
  "forgot password" flow (`/sign-in` currently states outright "password
  reset... not available yet"), which would let any such user recover
  themselves, or (b) Manager-side detection ("この人はメール確認済みですが未設定です" /
  "confirmed but never completed setup") with a manager-triggered, audited
  recovery action that performs the same Admin-API password-reset used
  manually in this session, formalized as a real, logged product action
  instead of an ad hoc operator step. Recommend (a) as the more durable fix
  since it also removes the operator dependency entirely; out of scope for
  this specific PKCE/fragment fix.
- **Resend behavior for a confirmed Auth user who never completed password
  setup** — root-caused in the original report (Defect C): `invite-employee`'s
  `resolveTargetUser()` treats any already-registered/confirmed email as the
  "existing ORUWA member" case (Founder decision 8) and deliberately sends
  no email, assuming the person has another way to reach an authenticated
  session. That assumption is correct for a genuine existing member,
  **wrong** for a first-time hire stuck in this specific limbo. This plan's
  fix does not change that branch's logic (out of scope here — it's a
  distinct decision-8 policy question, not the fragment/PKCE bug), but the
  interruption-recovery follow-up above (item just prior) is the correct
  place to also revisit whether "already confirmed but never
  password-set" should be distinguished from "already onboarded elsewhere"
  in that branch.
- **Existing ORUWA users invited to a second tenant** — verified
  unaffected by this fix. That path never goes through `/auth/accept-invite`
  at all: `invite-employee`'s existing-user branch sends **no** email
  (Founder decision 8) and instead relies entirely on
  `PendingInvitationBanner` + `AcceptInvitationButton`, which operate on the
  caller's **already-live, already-password-protected** session via
  `api.accept_employee_invitation` directly — no token/callback/redirect of
  any kind is involved. Neither Option A nor B touches that code path. (Its
  own separate, previously-identified issue — Defect B, over-broad RLS
  visibility on the "pending invitation" query — is intentionally untouched
  by this plan; it is a different bug, already tracked, out of scope here.)

---

## 6. Security analysis

- **No `service_role` in browser/frontend**: unaffected. `verifyOtp` (Option
  A) and `setSession` (Option B) both use the anon-key SSR/browser client
  already in use everywhere else in `apps/web`; `service_role` remains
  exclusive to the Edge Function, unchanged.
- **No RLS weakening**: no RLS policy is touched by either option.
- **No accepting an invitation merely because `invitation_id` is known**:
  unaffected — `api.accept_employee_invitation` (unchanged) independently
  requires a valid `core.current_user_id()` session and checks
  `target_user_id = caller` before any binding write; knowing an
  `invitation_id` alone (visible in the URL query string either way) has
  never been sufficient and remains insufficient after this fix.
- **Canonical RPC continues validating caller against `target_user_id`**:
  unchanged, not modified by this plan under either option.
- **No auth tokens in application logs**: Option A's `token_hash` is
  distinct from the live `access_token`/`refresh_token` — it is a
  single-use verification value, not a bearer credential; even so, care
  must be taken in implementation not to log the full query string
  server-side (standard Next.js/Vercel request logs may capture the URL
  path+query by default — worth confirming logging config does not persist
  this at implementation time). Option B's real bearer tokens must never be
  logged, sent to any analytics/error-reporting integration, or included in
  server-side console output — implementation must audit for any global
  error handler that might capture `window.location.href`.
- **No tokens persisted in repository files**: this plan itself contains no
  real token values, consistent with this session's handling throughout
  (all prior token/password material was scratchpad-only, never committed).
- **Tenant isolation preserved**: unaffected — the fix operates entirely
  before tenant context is established; `requireTenantContext()` and all
  downstream tenant-scoping logic are untouched.
- **No destructive Auth/DB operations**: neither option deletes or
  recreates any Auth user or DB row; Option A's template edit is additive
  (a link-format change, reversible by reverting the template text); Option
  B is pure application code.

---

## 7. Rollback plan

- **Option A**: the email-template edit is a single text-field change in
  Supabase Studio (Preview project only) — reversible in seconds by
  restoring the default `{{ .ConfirmationURL }}` content, no data migration
  involved. The route-handler code change is additive (a new `else if`
  branch); reverting is a single-file revert with no schema/data
  dependency. The two changes are independent and can each be rolled back
  without the other.
- **Option B**: pure application code (new client component + route
  restructuring); reverting is a standard git revert, no config/data
  dependency at all.
- **Either option**: because `?code=` handling is kept as a live fallback
  (§3/§5), a partial rollback (template reverted, code not yet reverted, or
  vice versa) degrades gracefully back to today's known state — new invites
  would resume landing in the pre-existing limbo (Defect C's current
  behavior), not a worse or different failure mode. No in-flight
  invitations are put at risk by rollback: `workforce.employee_invitations`
  rows and their 7-day expiry are entirely independent of which callback
  mechanism eventually accepts them.
- **Staff B specifically**: not affected by either rollback path — it stays
  exactly in its current limbo state until a deliberate, separate recovery
  action (Admin API password reset, same as Staff A, or a future
  self-service recovery flow) is explicitly authorized.

---

## 8. Effect on existing-user invitations

None. As established in §5, the existing-ORUWA-member-invited-to-a-second-tenant
path never uses `/auth/accept-invite`, `code`, `token_hash`, or any
token-bearing redirect — it is driven entirely by the in-app
`PendingInvitationBanner` against an already-authenticated session. This
fix is scoped to the **new-user** invite/recovery email-link path only. (If
Recovery links are also updated to use `token_hash` templates for
consistency — recommended, since Recovery has the identical
`inviteUserByEmail`-class incompatibility with PKCE for the same structural
reason — that is a natural follow-on, not a prerequisite, and does not
change this conclusion: no self-service recovery flow exists yet at all,
per Defect C.)

---

## 9. Test plan

**Existing coverage** (verified by inspection): `apps/web/src/lib/workforce/invitations.test.ts`
covers the `lib/workforce/invitations.ts` client-call layer
(`inviteOrResendWorkforceEmployee`, `acceptWorkforceEmployeeInvitation`,
list/revoke) at the HTTP/RPC-mock level. **No test currently exists** for
`apps/web/src/app/auth/accept-invite/route.ts`, `set-password/page.tsx`, or
`SetPasswordForm.tsx` — this callback path has had zero regression coverage
this entire time, which is how this defect went undetected through the
prior implementation and two acceptance sessions.

Required new/updated tests (implementation task, not run here):

1. **`accept-invite/route.test.ts`** (new) — Route Handler unit tests
   mocking the SSR server client:
   - `code` present, valid → `exchangeCodeForSession` called, redirects to
     `set-password?invitation_id=...` (regression guard for the existing,
     previously-untested PKCE path).
   - `code` present, `exchangeCodeForSession` errors → redirects to
     `/sign-in?error=1`.
   - (Option A) `token_hash` + `type=invite` present, valid → `verifyOtp`
     called with exactly those params, redirects to
     `set-password?invitation_id=...`.
   - (Option A) `token_hash` present, `verifyOtp` errors (expired/replayed
     token) → redirects to an error state (distinguishing expired-vs-generic
     if that improvement from §5 is implemented).
   - Neither `code` nor `token_hash`/`invitation_id` present → redirects to
     `/sign-in?error=1` (existing behavior, currently unguarded by any
     test).
   - Confirms the handler never logs or re-exposes the raw token value in
     its own response/redirect target.
2. **(Option B only) client-callback component test** — source-text-based
   per this repo's established `.tsx` client-component test convention
   (e.g. `staff-form.test.ts`'s pattern): asserts the component calls
   `setSession` with hash-derived values, calls
   `window.history.replaceState` before any further render, and never
   renders the raw token into the DOM.
3. **Regression for existing-user (decision 8) path**: extend
   `invitations.test.ts` or add a focused test asserting
   `PendingInvitationBanner`/`acceptWorkforceEmployeeInvitation` behavior is
   unchanged by this fix (no new dependency introduced on the callback
   route for that path) — a guard against accidentally coupling the two
   flows during implementation.
4. **pgTAP**: none required — no schema/RLS/RPC changes are proposed by
   this plan (§6/§4 confirm `api.accept_employee_invitation` and its RLS
   are untouched). The existing `supabase/tests/0032_workforce_employee_invitations.sql`
   suite remains the authoritative coverage for the acceptance RPC itself
   and needs no modification.
5. **Manual Preview smoke test** (post-implementation, pre-sign-off): a
   real invite → real email → real click, observed end-to-end without any
   manual Admin API recovery step — this is the actual acceptance bar for
   calling the defect fixed, and maps directly to §10 below.

---

## 10. Whether Staff B can be reused as the final real acceptance test after implementation

**Not as-is.** Staff B's current Auth identity (`4c4fd933-...`) already has
`confirmed_at`/`last_sign_in_at` set from the broken click and its invite
token is already spent — replaying that specific invitation would exercise
the *recovery* path (same limbo Staff A was recovered from), not a clean
first-time flow, and so would not prove the callback fix itself works for a
genuine new user.

Recommended sequencing once this plan is implemented and approved:

1. **Fix verification (new identity)**: create one fresh disposable test
   employee/email (not Staff A or B) and run the real invite → email →
   click → password-setup → acceptance flow end-to-end with zero manual
   Admin API intervention. This is the actual proof the fix works.
2. **Staff B recovery (separate, explicit decision)**: only after (1)
   passes, decide whether to (a) recover Staff B via the same manual
   Admin-API password-reset already used for Staff A (fastest, but repeats
   the documented workaround rather than proving the fixed flow), or (b)
   revoke Staff B's current invitation and issue a clean new one against
   the now-fixed callback (slower, but this *would* double as a second real
   confirmation of the fix, and avoids leaving a manually-recovered account
   as reference data). Recommend (b) if time permits, since it yields
   strictly stronger acceptance evidence and keeps ORUWA Cafe's reference
   data free of any manually-patched identities.

No action on Staff B is taken by this plan itself — this section is a
recommendation for the Founder's next explicit instruction, not an action
taken.

---

## Summary for review

```
ROOT_CAUSE = VERIFIED (installed auth-js 2.108.2 source + doc comments confirm inviteUserByEmail is structurally incompatible with PKCE; app's accept-invite route only handles PKCE's ?code=)
RECOMMENDED_ARCHITECTURE = Option A: server-side token_hash/verifyOtp via customized Invite (and Recovery) email template, keep ?code= as free fallback
FALLBACK_ARCHITECTURE = Option B: client-side setSession() from URL fragment + immediate history cleanup, no Auth template change needed
FILES_TO_CHANGE = apps/web/src/app/auth/accept-invite/route.ts (+ new route.test.ts); Supabase Auth Invite email template (Option A only, Preview project, Founder-applied)
SECURITY_ANALYSIS = no service_role exposure change, no RLS change, no DB/migration change, api.accept_employee_invitation's target_user_id check remains the binding authority under both options
ROLLBACK = independently revertible (template text revert; git revert for code); ?code= fallback means partial rollback degrades to today's known (not worse) behavior
EXISTING_USER_INVITE_PATH = unaffected (never touches this callback route at all)
INTERRUPTED_ONBOARDING_RECOVERY = NOT solved by this plan alone; recommend a separate follow-up (self-service password reset, or a formal Manager-triggered recovery action) — tracked as a continuation of Defect C, not closed here
STAFF_B_REUSABLE_AS_IS = NO — recommend a fresh disposable identity to verify the fix, then a separate explicit decision on Staff B (manual recovery vs. clean re-invite)
IMPLEMENTATION_STATUS = NOT STARTED — plan only, stopped here for Founder review per instruction
```
