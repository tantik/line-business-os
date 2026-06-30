# Local Onboarding Runbook

## Purpose

This runbook describes the safe local-only onboarding workflow for LINE Business OS.

It is intended for development and operator testing.

It is not a production onboarding runbook.

## Scope

Allowed:

- local Supabase only;
- local dry-run onboarding;
- local committed onboarding only when backup gate passes;
- local verification;
- local dashboard verification.

Forbidden:

- Cloud database writes;
- production database writes;
- real customer onboarding;
- Supabase project configuration changes;
- destructive SQL;
- service_role usage in frontend;
- secrets in logs;
- raw customer PII in output;
- LINE broadcast or mass messaging.

## Before starting

Confirm:

```text
git status --short is clean
current branch is a feature branch
local Supabase is running if needed
.env.local points to the intended local environment
no Cloud credentials are being used for local onboarding
```

## Dry-run flow

Expected chain:

```text
preflight
-> local transaction
-> rollback
-> final operator report
```

Dry-run must not persist onboarding rows.

Use dry-run first before any local committed onboarding.

## Commit flow

Expected chain:

```text
commit gates
-> preflight
-> backup artifact gate
-> local commit transaction
-> final operator report
```

Committed local onboarding requires a valid backup artifact before writes.

If backup validation fails, do not continue.

## Required checks

For dry-run:

```text
preflight passed
transaction rolled back
no persistent onboarding rows
operator report produced
no Cloud touched
```

For local commit:

```text
commit gates passed
preflight passed
backup artifact gate passed
transaction committed locally
expected row deltas persisted
audit rows created
operator report produced
no Cloud touched
```

## Output safety

Do not print:

```text
database passwords
raw DATABASE_URL values
service_role keys
access tokens
refresh tokens
cookies
real customer email addresses
raw production customer identifiers
```

Prefer safe labels, masked values, or test-only identifiers.

## After local onboarding

Verify:

```text
dashboard shows expected tenant
active tenant context is correct
membership count is correct
audit rows exist
no unexpected rows were created
git status remains clean unless docs/code were intentionally changed
```

## When to stop

Stop and ask for review if:

```text
preflight fails
backup gate fails
tenant isolation looks unclear
unexpected rows persist
Cloud environment is detected
production/customer data may be involved
service_role appears in frontend/app flow
RLS behavior is unclear
```

## Production note

This runbook is local-only.

Production or real customer onboarding requires a separate approved runbook, backup/rollback plan, privacy/legal review, and explicit human approval.