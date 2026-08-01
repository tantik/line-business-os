-- 0049 Workforce manager contact profile fields
--
-- Extends the existing manager-only, RLS-protected staff surface. Every PII
-- value remains ciphertext in PostgreSQL and is decrypted only by the
-- authorized server action. Existing rows stay valid and can be completed by
-- the manager during the next edit.

alter table workforce.employees
  add column family_name_encrypted bytea,
  add column given_name_encrypted bytea,
  add column email_encrypted bytea,
  add column email_hash text,
  add column notes_encrypted bytea;

create unique index workforce_employees_tenant_email_hash_key
  on workforce.employees (tenant_id, email_hash)
  where email_hash is not null;

comment on column workforce.employees.family_name_encrypted is 'Encrypted employee family name. Manager-only server-side decryption.';
comment on column workforce.employees.given_name_encrypted is 'Encrypted employee given name. Manager-only server-side decryption.';
comment on column workforce.employees.email_encrypted is 'Encrypted employee email. Manager-only server-side decryption.';
comment on column workforce.employees.email_hash is 'Blind index of normalized employee email for tenant-scoped equality checks.';
comment on column workforce.employees.notes_encrypted is 'Encrypted manager notes about the employee. Manager-only server-side decryption.';

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
  -- PostgreSQL only permits CREATE OR REPLACE VIEW to append columns. Keep
  -- the established 0048 column order and append the new encrypted fields.
  e.family_name_encrypted,
  e.given_name_encrypted,
  e.email_encrypted,
  e.email_hash,
  e.notes_encrypted
from workforce.employees e;

comment on view api.workforce_staff_manage is
  'Manager-only staff read/write facade. Every PII field remains encrypted and is decrypted server-side only. security_invoker/RLS.';

revoke all on api.workforce_staff_manage from anon, public;
grant select, insert, update on api.workforce_staff_manage to authenticated;
