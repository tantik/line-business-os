-- ============================================================================
-- 0008  RBAC platform data: permission catalog + system roles
-- ----------------------------------------------------------------------------
-- Platform-level (non-tenant) reference data. Safe to run repeatedly.
-- ============================================================================

-- Permission catalog --------------------------------------------------------
insert into core.permissions (key, module, description) values
  ('core.member.invite',        'core',      'Invite / manage tenant members'),
  ('core.role.manage',          'core',      'Manage roles and role assignments'),
  ('core.billing.manage',       'core',      'Manage billing and module entitlements'),
  ('core.location.manage',      'core',      'Manage tenant locations'),
  ('core.line.manage',          'core',      'Manage tenant LINE channels'),
  ('core.audit.read',           'core',      'Read audit logs'),
  ('workforce.shift.read',      'workforce', 'View shifts'),
  ('workforce.shift.write',     'workforce', 'Create / edit shifts'),
  ('workforce.attendance.manage','workforce','Manage attendance records'),
  ('workforce.request.manage',  'workforce', 'Approve shift / leave requests'),
  ('booking.booking.read',      'booking',   'View bookings'),
  ('booking.booking.write',     'booking',   'Create / edit bookings'),
  ('booking.service.manage',    'booking',   'Manage services and staff'),
  ('ai.propose',                'ai',        'Submit AI proposals'),
  ('ai.approve',                'ai',        'Approve AI proposals for application')
on conflict (key) do update set description = excluded.description, module = excluded.module;

-- System roles --------------------------------------------------------------
insert into core.roles (id, tenant_id, key, name, is_system) values
  ('00000000-0000-0000-0000-000000000001', null, 'platform_owner',   'Platform Owner',   true),
  ('00000000-0000-0000-0000-000000000002', null, 'platform_support', 'Platform Support', true),
  ('00000000-0000-0000-0000-000000000003', null, 'tenant_owner',     'Tenant Owner',     true),
  ('00000000-0000-0000-0000-000000000004', null, 'tenant_admin',     'Tenant Admin',     true),
  ('00000000-0000-0000-0000-000000000005', null, 'manager',          'Manager',          true),
  ('00000000-0000-0000-0000-000000000006', null, 'employee',         'Employee',         true),
  ('00000000-0000-0000-0000-000000000007', null, 'client',           'Client',           true)
on conflict (tenant_id, key) do nothing;

-- Role -> permission mappings ----------------------------------------------
-- Helper: assign every permission to a role by key.
do $$
declare
  r_owner   uuid := '00000000-0000-0000-0000-000000000003';
  r_admin   uuid := '00000000-0000-0000-0000-000000000004';
  r_manager uuid := '00000000-0000-0000-0000-000000000005';
  r_emp     uuid := '00000000-0000-0000-0000-000000000006';
  r_client  uuid := '00000000-0000-0000-0000-000000000007';
begin
  -- Tenant Owner: everything in core + all modules.
  insert into core.role_permissions (role_id, permission_key)
    select r_owner, key from core.permissions
  on conflict do nothing;

  -- Tenant Admin: all module ops + member/role/location/line/audit, no billing.
  insert into core.role_permissions (role_id, permission_key)
    select r_admin, key from core.permissions
    where key <> 'core.billing.manage'
  on conflict do nothing;

  -- Manager: module operations + approvals + audit read.
  insert into core.role_permissions (role_id, permission_key) values
    (r_manager, 'workforce.shift.read'),
    (r_manager, 'workforce.shift.write'),
    (r_manager, 'workforce.attendance.manage'),
    (r_manager, 'workforce.request.manage'),
    (r_manager, 'booking.booking.read'),
    (r_manager, 'booking.booking.write'),
    (r_manager, 'booking.service.manage'),
    (r_manager, 'core.audit.read'),
    (r_manager, 'ai.approve'),
    (r_manager, 'ai.propose')
  on conflict do nothing;

  -- Employee: read shifts, manage own attendance, propose (AI), read bookings.
  insert into core.role_permissions (role_id, permission_key) values
    (r_emp, 'workforce.shift.read'),
    (r_emp, 'workforce.attendance.manage'),
    (r_emp, 'booking.booking.read'),
    (r_emp, 'ai.propose')
  on conflict do nothing;

  -- Client: read their own bookings only (enforced further by module RLS).
  insert into core.role_permissions (role_id, permission_key) values
    (r_client, 'booking.booking.read')
  on conflict do nothing;
end $$;
