-- ============================================================================
-- 0012  Protect the platform-staff privilege from self-escalation
-- ----------------------------------------------------------------------------
-- SECURITY (privilege escalation fix):
-- The `users_self_update` policy (0007) lets a user update their own
-- core.users row. Without this guard a tenant user could set
-- `is_platform_staff = true` on their own row and, via core.is_platform_staff(),
-- gain unrestricted cross-tenant access (is_member_of / has_permission both
-- short-circuit to true for platform staff).
--
-- RLS WITH CHECK cannot compare against the previous row value, so we enforce
-- immutability with a BEFORE UPDATE trigger instead. The flag may only change
-- when the statement runs under a trusted server role (service_role / postgres);
-- the client-facing roles (anon, authenticated) can never flip it. Promotion to
-- platform staff is therefore a deliberate server-side / migration action, never
-- a self-service one.
-- ============================================================================

create or replace function core.enforce_platform_staff_immutable()
returns trigger
language plpgsql
security invoker
set search_path = core, public
as $$
begin
  if new.is_platform_staff is distinct from old.is_platform_staff
     and current_user in ('anon', 'authenticated') then
    raise exception
      'is_platform_staff is not self-mutable; tenant users cannot promote themselves to platform staff (role: %)',
      current_user
      using errcode = '42501';  -- insufficient_privilege
  end if;
  return new;
end;
$$;

comment on function core.enforce_platform_staff_immutable() is
  'Blocks client roles (anon/authenticated) from changing core.users.is_platform_staff. '
  'Platform-staff promotion is server-only (service_role) by design.';

drop trigger if exists enforce_platform_staff_immutable on core.users;
create trigger enforce_platform_staff_immutable
  before update on core.users
  for each row
  execute function core.enforce_platform_staff_immutable();
