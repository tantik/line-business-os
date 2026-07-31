-- 0048 Workforce advisory hourly wage input
--
-- This is an operational planning input, not payroll. Managers may read and
-- update it through the existing manager-only facade; staff may read only
-- their own value through the self-scoped profile facade.

alter table workforce.employees
  add column hourly_wage_yen integer
  check (hourly_wage_yen is null or hourly_wage_yen between 0 and 1000000);

comment on column workforce.employees.hourly_wage_yen is
  'Optional advisory hourly wage in whole JPY for estimated earnings/labour-cost planning. Not payroll and excludes overtime, premiums, tax, insurance, transport, and deductions.';

create or replace view api.workforce_my_staff_profile
  with (security_invoker = true) as
select
  e.id as staff_id,
  e.tenant_id,
  e.location_id,
  e.position_label,
  e.employment_type,
  e.is_active,
  e.created_at,
  e.hourly_wage_yen
from workforce.employees e
where e.user_id = core.current_user_id();

comment on view api.workforce_my_staff_profile is
  'Caller''s own workforce.employees row, including the caller''s advisory hourly wage. Self-scoped by user_id and security_invoker/RLS. No name ciphertext/hash or raw user ids.';

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
  e.hourly_wage_yen
from workforce.employees e;

comment on view api.workforce_staff_manage is
  'Manager-only staff read/write facade. Includes advisory hourly wage for operational estimates. PII remains encrypted and is decrypted server-side only. security_invoker/RLS.';

revoke all on api.workforce_my_staff_profile from anon, public;
revoke all on api.workforce_staff_manage from anon, public;
grant select on api.workforce_my_staff_profile to authenticated;
grant select, insert, update on api.workforce_staff_manage to authenticated;
