-- ============================================================================
-- 0006  Helper functions: identity, tenant context, RBAC checks, triggers
-- ----------------------------------------------------------------------------
-- These SECURITY DEFINER / STABLE functions are the single source of truth for
-- RLS decisions. RLS policies call them so the logic lives in one place.
-- ============================================================================

-- Current authenticated user id.
-- Works with Supabase auth (auth.uid()). For backend service connections the
-- caller may instead set `app.current_user_id` via set_config(...).
create or replace function core.current_user_id()
returns uuid
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), '')::uuid,
    nullif(current_setting('app.current_user_id', true), '')::uuid
  );
$$;

-- Is the current user platform staff (Platform Owner / Support)?
create or replace function core.is_platform_staff()
returns boolean
language sql stable security definer set search_path = core, public as $$
  select exists (
    select 1 from core.users u
    where u.id = core.current_user_id() and u.is_platform_staff = true
  );
$$;

-- Is the current user an active member of the given tenant?
create or replace function core.is_member_of(p_tenant_id uuid)
returns boolean
language sql stable security definer set search_path = core, public as $$
  select core.is_platform_staff()
      or exists (
        select 1
        from core.tenant_memberships m
        where m.tenant_id = p_tenant_id
          and m.user_id = core.current_user_id()
          and m.status = 'active'
      );
$$;

-- Does the current user hold a permission within a tenant (optionally location)?
-- location-scoped assignments (location_id not null) only grant within that
-- location; assignments with null location_id grant tenant-wide.
create or replace function core.has_permission(
  p_tenant_id uuid,
  p_permission text,
  p_location_id uuid default null
)
returns boolean
language sql stable security definer set search_path = core, public as $$
  select core.is_platform_staff()
      or exists (
        select 1
        from core.role_assignments ra
        join core.role_permissions rp on rp.role_id = ra.role_id
        where ra.tenant_id = p_tenant_id
          and ra.user_id = core.current_user_id()
          and rp.permission_key = p_permission
          and (ra.location_id is null or ra.location_id = p_location_id)
      );
$$;

-- Shared updated_at maintenance trigger.
create or replace function core.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Attach updated_at trigger to core tables that have the column.
do $$
declare t text;
begin
  foreach t in array array[
    'core.tenants', 'core.locations', 'core.users',
    'core.tenant_memberships', 'core.tenant_modules', 'core.line_channels'
  ] loop
    execute format(
      'drop trigger if exists set_updated_at on %s; '
      'create trigger set_updated_at before update on %s '
      'for each row execute function core.set_updated_at();', t, t);
  end loop;
end $$;
