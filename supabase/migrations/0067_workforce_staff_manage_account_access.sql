-- ============================================================================
-- 0067  api.workforce_staff_manage: expose has_account_access (derived
--       boolean only, never a raw user id)
-- ----------------------------------------------------------------------------
-- The Manager Staff-invitation UI needs to know, per employee, whether they
-- already have Staff-app login access -- to decide between offering "Invite"
-- vs "Resend"/"Revoke"/showing "Active access". `workforce.employees.user_id`
-- itself is intentionally never exposed by any `api` view (0023's own
-- "zero user-identity" precedent, reaffirmed by 0031/0048/0049's comments on
-- this exact view). This migration appends a single DERIVED BOOLEAN --
-- `has_account_access = (user_id is not null)` -- the same shape as the
-- already-exposed `is_active`, not a new raw-id leak.
--
-- PostgreSQL only permits CREATE OR REPLACE VIEW to APPEND columns (see
-- 0049's own comment) -- the append-only column order from 0031/0048/0049 is
-- preserved exactly, with has_account_access appended at the end.
-- Read-only column: no INSERT/UPDATE grant behavior changes (the view's
-- existing `grant select, insert, update` is unchanged; a client attempting
-- to write has_account_access would simply fail the same way writing any
-- other non-updatable-through-this-view derived expression already would --
-- Postgres itself rejects writes through a view to columns backed by an
-- expression rather than a plain base-table column).
-- ============================================================================

create or replace view api.workforce_staff_manage
  with (security_invoker = true) as
select
  e.id as staff_id,
  e.tenant_id,
  e.location_id,
  e.name_encrypted,
  e.name_hash,
  e.position_label,
  e.employment_type,
  e.is_active,
  e.created_at,
  e.updated_at,
  e.hourly_wage_yen,
  e.family_name_encrypted,
  e.given_name_encrypted,
  e.email_encrypted,
  e.email_hash,
  e.notes_encrypted,
  (e.user_id is not null) as has_account_access
from workforce.employees e;

comment on view api.workforce_staff_manage is
  'Manager-only staff read/write facade. Includes advisory hourly wage, contact PII (encrypted), and has_account_access (derived boolean, never the raw user_id itself). security_invoker/RLS.';

grant select, insert, update on api.workforce_staff_manage to authenticated;
revoke all on api.workforce_staff_manage from anon, public;
