---
name: linebos-tenant-rls-audit
description: Static tenant isolation and RLS review checklist for LINE Business OS database or API changes.
disable-model-invocation: true
---

# Tenant Isolation and RLS Audit - LINE Business OS

Static, read-only review. Do not run Supabase commands, migrations, or connect to any database from this skill. Read files only.

## Checklist

For each new or changed table, migration, or API surface, check:

- tenant_id - every business table has tenant_id uuid not null referencing core.tenants(id).
- location_id - present when the data belongs to a physical branch, store, salon, warehouse, or other location.
- RLS enabled in the same migration - alter table enable row level security lands in the same migration that creates the table, not a follow-up.
- Policies added with the table - read/write policies are scoped via core.is_member_of or core.has_permission, not left for later.
- No broad grants - no policy effectively allows cross-tenant reads or writes, for example using true without a tenant or permission check.
- No internal schema exposure - core, audit, workforce, booking, and ai schemas are not made browser-facing without a reviewed ADR.
- App-facing API facade pattern - privileged reads and writes go through apps/api, not directly from the browser against internal schemas.
- No service_role on frontend - apps/web never imports createServiceClient or reads SUPABASE_SERVICE_ROLE_KEY.
- No customer data exposure - no PII in logs, error messages, or unauthenticated responses; encrypted PII uses *_encrypted and *_hash per docs/security/security-requirements.md.

## Explicit limits

- This is not a certification. It is an aid for reviewers, not a substitute for human review.
- Human review remains mandatory before any migration or RLS-affecting change merges, per docs/security/security-requirements.md.
- Do not run Supabase commands such as db push, db pull, db reset, link, or migration repair as part of this skill. This skill only reads files.
