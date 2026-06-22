-- ============================================================================
-- 0007  Row Level Security policies for core + audit
-- ----------------------------------------------------------------------------
-- RLS is MANDATORY. Tenant isolation is enforced here, not in the frontend.
-- The service_role key bypasses RLS by design and must remain server-only.
-- ============================================================================

-- Enable + force RLS on every core/audit table.
alter table core.tenants            enable row level security;
alter table core.locations          enable row level security;
alter table core.users              enable row level security;
alter table core.tenant_memberships enable row level security;
alter table core.tenant_modules     enable row level security;
alter table core.permissions        enable row level security;
alter table core.roles              enable row level security;
alter table core.role_permissions   enable row level security;
alter table core.role_assignments   enable row level security;
alter table core.line_channels      enable row level security;
alter table core.line_accounts      enable row level security;
alter table audit.audit_logs        enable row level security;

-- --- tenants ---------------------------------------------------------------
drop policy if exists tenants_select on core.tenants;
create policy tenants_select on core.tenants
  for select using (core.is_member_of(id));

drop policy if exists tenants_update on core.tenants;
create policy tenants_update on core.tenants
  for update using (core.has_permission(id, 'core.billing.manage'))
  with check (core.has_permission(id, 'core.billing.manage'));

-- --- locations -------------------------------------------------------------
drop policy if exists locations_select on core.locations;
create policy locations_select on core.locations
  for select using (core.is_member_of(tenant_id));

drop policy if exists locations_write on core.locations;
create policy locations_write on core.locations
  for all using (core.has_permission(tenant_id, 'core.location.manage'))
  with check (core.has_permission(tenant_id, 'core.location.manage'));

-- --- users -----------------------------------------------------------------
-- A user can read/update their own row; platform staff can read all.
drop policy if exists users_self_select on core.users;
create policy users_self_select on core.users
  for select using (id = core.current_user_id() or core.is_platform_staff());

-- A user may update their own row, BUT the privileged `is_platform_staff` column
-- is NOT self-mutable: migration 0012 installs a trigger that blocks client
-- roles from changing it, closing a cross-tenant privilege-escalation path. RLS
-- WITH CHECK cannot compare the previous value, so the trigger is the guard.
drop policy if exists users_self_update on core.users;
create policy users_self_update on core.users
  for update using (id = core.current_user_id())
  with check (id = core.current_user_id());

-- Members can read fellow members within shared tenants.
drop policy if exists users_co_member_select on core.users;
create policy users_co_member_select on core.users
  for select using (
    exists (
      select 1
      from core.tenant_memberships m_self
      join core.tenant_memberships m_other on m_other.tenant_id = m_self.tenant_id
      where m_self.user_id = core.current_user_id()
        and m_other.user_id = core.users.id
    )
  );

-- --- tenant_memberships ----------------------------------------------------
drop policy if exists memberships_select on core.tenant_memberships;
create policy memberships_select on core.tenant_memberships
  for select using (core.is_member_of(tenant_id));

drop policy if exists memberships_write on core.tenant_memberships;
create policy memberships_write on core.tenant_memberships
  for all using (core.has_permission(tenant_id, 'core.member.invite'))
  with check (core.has_permission(tenant_id, 'core.member.invite'));

-- --- tenant_modules --------------------------------------------------------
drop policy if exists tenant_modules_select on core.tenant_modules;
create policy tenant_modules_select on core.tenant_modules
  for select using (core.is_member_of(tenant_id));

drop policy if exists tenant_modules_write on core.tenant_modules;
create policy tenant_modules_write on core.tenant_modules
  for all using (core.has_permission(tenant_id, 'core.billing.manage'))
  with check (core.has_permission(tenant_id, 'core.billing.manage'));

-- --- permissions (global catalog: readable by any authenticated user) ------
drop policy if exists permissions_select on core.permissions;
create policy permissions_select on core.permissions
  for select using (core.current_user_id() is not null);

-- --- roles -----------------------------------------------------------------
-- System roles (tenant_id null) visible to all; tenant roles to members.
drop policy if exists roles_select on core.roles;
create policy roles_select on core.roles
  for select using (tenant_id is null or core.is_member_of(tenant_id));

drop policy if exists roles_write on core.roles;
create policy roles_write on core.roles
  for all using (tenant_id is not null and core.has_permission(tenant_id, 'core.role.manage'))
  with check (tenant_id is not null and core.has_permission(tenant_id, 'core.role.manage'));

-- --- role_permissions ------------------------------------------------------
drop policy if exists role_permissions_select on core.role_permissions;
create policy role_permissions_select on core.role_permissions
  for select using (
    exists (
      select 1 from core.roles r
      where r.id = role_id
        and (r.tenant_id is null or core.is_member_of(r.tenant_id))
    )
  );

-- --- role_assignments ------------------------------------------------------
drop policy if exists role_assignments_select on core.role_assignments;
create policy role_assignments_select on core.role_assignments
  for select using (core.is_member_of(tenant_id));

drop policy if exists role_assignments_write on core.role_assignments;
create policy role_assignments_write on core.role_assignments
  for all using (core.has_permission(tenant_id, 'core.role.manage'))
  with check (core.has_permission(tenant_id, 'core.role.manage'));

-- --- line_channels ---------------------------------------------------------
drop policy if exists line_channels_select on core.line_channels;
create policy line_channels_select on core.line_channels
  for select using (core.is_member_of(tenant_id));

drop policy if exists line_channels_write on core.line_channels;
create policy line_channels_write on core.line_channels
  for all using (core.has_permission(tenant_id, 'core.line.manage'))
  with check (core.has_permission(tenant_id, 'core.line.manage'));

-- --- line_accounts ---------------------------------------------------------
drop policy if exists line_accounts_select on core.line_accounts;
create policy line_accounts_select on core.line_accounts
  for select using (core.is_member_of(tenant_id));

-- --- audit_logs ------------------------------------------------------------
-- Read by members with audit permission; inserts via service_role only.
drop policy if exists audit_logs_select on audit.audit_logs;
create policy audit_logs_select on audit.audit_logs
  for select using (core.has_permission(tenant_id, 'core.audit.read'));
