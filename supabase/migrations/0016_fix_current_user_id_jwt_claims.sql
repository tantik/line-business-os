-- ============================================================================
-- 0016  Fix core.current_user_id(): resolve identity from JSON jwt claims
-- ----------------------------------------------------------------------------
-- Phase 1E Stage 2 bug fix (local fix only — not applied to Cloud here).
--
-- PROBLEM
-- Migration 0006 defined core.current_user_id() to read identity ONLY from the
-- legacy flattened GUC `request.jwt.claim.sub`. Supabase Cloud PostgREST,
-- however, exposes the verified JWT to SQL through the JSON GUC
-- `request.jwt.claims` (a JSON object whose `sub` field is the user id). It does
-- NOT reliably set the legacy `request.jwt.claim.sub` GUC. As a result, for an
-- authenticated PostgREST request the helper resolved to NULL, RLS identity
-- collapsed to "no user", and api.my_tenant_memberships returned 0 rows even
-- though Auth login, the fixture, the direct DB connection, and the negative
-- checks were all correct.
--
-- FIX (behavior-preserving superset)
-- Redefine core.current_user_id() to resolve identity in priority order:
--   1. `request.jwt.claims`  -> JSON GUC, take the `sub` field (Cloud PostgREST)
--   2. `request.jwt.claim.sub` -> legacy flattened GUC (kept for back-compat)
--   3. `app.current_user_id`   -> backend/service set_config() path (unchanged)
-- The first non-null wins; every lookup uses the missing_ok form of
-- current_setting() plus nullif(), so an unset/empty GUC yields NULL rather than
-- raising, and a bad value never makes another tenant's identity resolve.
--
-- SIGNATURE / SECURITY POSTURE (unchanged from 0006/0014)
--   * returns uuid, language sql, stable
--   * SECURITY INVOKER (NO security definer) — runs as the calling role
--   * EXECUTE grants are NOT touched: `create or replace function` preserves the
--     existing ACL set by 0014 (PUBLIC revoked, EXECUTE only to authenticated).
--
-- WHY NO `set search_path`
--   This helper is SECURITY INVOKER, so it carries no elevated privilege that a
--   search_path hijack could abuse. Every identifier it uses — coalesce, nullif,
--   current_setting, the ->> operator, and the ::jsonb / ::uuid casts — resolves
--   from pg_catalog, which PostgreSQL always searches first regardless of the
--   caller's search_path. Adding `set search_path` would be unrelated hardening
--   and a behavior change versus 0006, so it is intentionally omitted.
-- ============================================================================

create or replace function core.current_user_id()
returns uuid
language sql
stable
as $$
  select coalesce(
    nullif((nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'), '')::uuid,
    nullif(current_setting('request.jwt.claim.sub', true), '')::uuid,
    nullif(current_setting('app.current_user_id', true), '')::uuid
  );
$$;
