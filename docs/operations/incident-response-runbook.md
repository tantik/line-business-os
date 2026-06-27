# Incident Response Runbook (MVP)

- Status: Active (MVP / first real clients)
- Phase: 1H Stage 1B — Health Check / Monitoring / Incident Response Foundation
- Scope: Detection + triage + decision flow. This runbook defines how we notice
  an incident and decide what to do. Backup/restore policy lives in
  `docs/operations/backup-dr-runbook.md`; this document is the detection and
  decision layer that makes the RTO meaningful.

> Recovery model is **alert-first / manual-approval-first**. There is no
> automatic rollback, no automatic restart, and no automatic restore. A human
> reads the signals and decides.

## 1. Purpose

Detect and respond to incidents fast enough to meet the **~20–40 minute RTO**
(see backup-DR runbook §1). A daily backup is not enough on its own: if nobody
knows the product is down, the clock to recovery never starts. Fast detection is
what makes the RTO target achievable.

## 2. Health signal

The app exposes a public, unauthenticated, read-only endpoint:

```
GET /api/health
```

- `200` with `{"status":"ok",...}` — app + public config present + Supabase Auth
  health probe reachable.
- `200` with `{"status":"degraded",...}` — reserved for optional future
  dependencies; core is still healthy.
- `503` with `{"status":"unhealthy",...}` — public config missing, or the
  Supabase/Auth health probe is unreachable.

The response contains coarse dependency **names + states only**
(`checks.app`, `checks.config`, `checks.supabase`). It never contains secrets,
URLs, database connection strings, JWTs, tenant ids, or user ids.

## 3. Detection (configure later — not implemented in this stage)

External uptime monitoring is **documented now, configured later**. Do NOT wire
an external monitoring service as part of this stage.

When set up (e.g. UptimeRobot, Better Stack, or Checkly):

- **Target:** `https://<prod-web-domain>/api/health` over HTTPS.
- **Interval:** every **1–5 minutes** (free tiers are typically 5 min; tighten to
  1 min when a paid tier is justified).
- **Failure rule:** alert after **2 consecutive failed checks** to avoid paging
  on a single transient blip.
- **Optional keyword check:** match `"status":"ok"` so a `200 degraded` can still
  alert if desired.
- **Alert target:** **email first**. LINE/Slack come later (LINE integration is
  out of scope now).
- **Owner:** a named on-call person (same person as the rollback/restore owner in
  the backup-DR pre-client checklist).

## 4. Triage flow

When an alert fires (or a user reports a problem), in order:

1. **Check `/api/health`.** Read `status` and `checks`:
   - `config: "missing"` → environment/secret problem → see §5.4.
   - `supabase: "unreachable"` → Supabase outage or network → see §5.2.
   - All `ok` but users still report errors → see §5.5.
2. **Check Vercel** — recent deployments and runtime logs. Did a deploy land
   immediately before the symptom started?
3. **Check Supabase** — the Supabase status page and the project health in the
   dashboard.
4. **Decide:** rollback vs wait vs restore vs env recovery (§5).

## 5. Scenarios and decisions

### 5.1 Bad app deploy

Symptom: app broke right after a deploy; database is healthy.

- Action: **Vercel rollback** to the previous known-good deployment.
- Do **not** touch the database. This is the fastest, no-data-loss recovery.
- After rollback: verify sign-in + dashboard + `/api/health` → `ok`. Record what
  shipped and why it failed.

### 5.2 Supabase / provider outage

Symptom: Supabase status is degraded; our deployment is unchanged
(`supabase: "unreachable"` while config is `ok`).

- Action: **wait and communicate.** Rolling back our app or restoring the DB does
  **not** fix a provider outage.
- Monitor provider recovery; re-check `/api/health` until it returns `ok`.
- Do **not** restore the database for a provider outage.

### 5.3 Data loss / corruption

Symptom: data is deleted, corrupted, or wrong; code and deploy are fine.

- Action: **restore from the latest good daily backup** per backup-DR runbook
  §4.2 / §6 (restore-in-place to meet RTO). Accept RPO ≤ 24h.
- Restrict writes first if feasible to prevent further damage.
- After restore: re-verify tenant isolation (RLS must still hold) and communicate
  the RPO impact.

### 5.4 Lost env / secrets

Symptom: `config: "missing"`, or auth/config broke after an env change.

- Action: **restore values** from the password manager / provider dashboard using
  `docs/operations/env-inventory.md` (names only live in Git), then redeploy.
- Never restore secret values from chat logs, screenshots, or unencrypted notes.

### 5.5 Health OK but users report errors

Symptom: `/api/health` returns `ok` but users hit errors.

- Action: inspect **app logs** (Vercel runtime logs) and **recent changes**
  (latest deploy diff, recent migrations applied to the environment).
- The health endpoint only proves process + config + Supabase reachability; it
  does not exercise product features. Treat a feature-level bug as a deploy issue
  (§5.1) if it correlates with a recent deploy.

### 5.6 Onboarding (Phase 1H Stage 3c-4b — local-only committed onboarding)

- **Committed onboarding is LOCAL only and strictly gated.** The onboarding CLI
  runs either a local dry-run transaction (always rolled back) or, when **all**
  confirmation gates pass (`--commit --yes --i-understand-this-writes-local-db
  --target local --backup-artifact <path>`), a **local committed transaction**
  (`packages/db/scripts/onboard-commit.ts`, the only file with `COMMIT`). It can
  never touch Supabase Cloud, and a non-local `DATABASE_URL` fails before
  connecting.
- **A fresh encrypted backup must exist and pass the artifact gate _before_ a
  committed run.** Onboarding never auto-runs a backup. Recovery for a local
  committed run is a local **`supabase db reset`** or a **restore** of the
  pre-onboarding backup artifact — local only, never a Cloud restore.
- **Idempotency limits blast radius.** A re-run on an already-onboarded tenant
  changes nothing and `ROLLBACK`s as a no-op (no `COMMIT`, no audit rows), so a
  retry of a fully-completed run is safe.
- **If the owner cannot see their tenant after a local commit** (the dashboard
  shows an empty / no-tenant state for the owner): **do not blindly re-run the
  commit.** Instead, in order, (1) **verify the auth user id mapping** — confirm
  the `--owner-auth-user-id` used matches the owner's real local Supabase Auth
  user id (re-check it the MVP-safe way via local Studio; never via email-to-uid
  lookup, auth-admin, or `service_role`); (2) **verify the expected row/audit
  counts** for the tenant (counts only, per the onboarding runbook §12.F); and
  (3) **verify the membership status is `active`** (the facade only returns
  active memberships). Keep any notes **redacted** (no real UUIDs, emails,
  secrets, DB URLs, or table rows). A re-run with the corrected id is safe
  because onboarding is idempotent.
- **If a committed run's outcome is unknown** (e.g. the CLI reports the commit
  outcome as indeterminate, or it crashed around the `COMMIT`): **stop. Do not
  blindly retry.** First **verify the actual state** (expected row/audit counts
  for the tenant) against the local database. Only once the state is known,
  either re-run (if nothing was persisted) or treat it per §5.3 (data
  loss/corruption) and restore from the pre-onboarding backup. Never restore to
  Cloud without separate approval.

## 6. Strong warnings

- **No auto rollback for MVP.** Rollback is a human decision via Vercel.
- **No auto restart assumption.** Vercel runs managed serverless functions; there
  is no server to reboot. "Restart the app" is not a recovery lever.
- **No DB restore unless data loss/corruption is confirmed.** Never restore for a
  normal app outage or a provider outage with intact data.
- **Roll back the app before touching the DB** when the issue is
  deployment-related.
- **No secrets in incident notes, chat, or screenshots.** No DB URLs, API keys,
  passwords, JWTs, or refresh tokens, ever.
- **No real user UUIDs in reports.** Use placeholders only.

## 7. Out of scope for this stage

This runbook does NOT configure an external monitoring service, implement
auto-rollback, implement auto-restart/auto-recovery, or add any LINE/Slack alert
integration. Those are later, separately approved tasks.
