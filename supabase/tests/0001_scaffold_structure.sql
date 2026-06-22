-- ============================================================================
-- DB test: scaffold structure (schemas, core tables, product scaffold tables)
-- ----------------------------------------------------------------------------
-- Run with:  pnpm exec supabase db reset && pnpm exec supabase test db
--
-- These are pgTAP tests. pgTAP ships with the Supabase local Postgres image; we
-- enable it inside the test transaction (rolled back at the end) so the test is
-- self-contained and leaves no trace in the database. If pgTAP is unavailable,
-- `create extension` below will error and the run FAILS LOUDLY — do not treat a
-- failure here as a pass. See docs/phase-1-core-db.md §5.
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public, core, audit, workforce, booking, ai;

select no_plan();

-- --- Schemas exist ---------------------------------------------------------
select has_schema('core',      'schema core exists');
select has_schema('audit',     'schema audit exists');
select has_schema('workforce', 'schema workforce exists (scaffold-only module)');
select has_schema('booking',   'schema booking exists (scaffold-only module)');
select has_schema('ai',        'schema ai exists (scaffold-only module)');

-- --- Core tables exist -----------------------------------------------------
select has_table('core', 'tenants',            'core.tenants exists');
select has_table('core', 'locations',          'core.locations exists');
select has_table('core', 'users',              'core.users exists');
select has_table('core', 'tenant_memberships', 'core.tenant_memberships exists');
select has_table('core', 'tenant_modules',     'core.tenant_modules exists');
select has_table('core', 'permissions',        'core.permissions exists');
select has_table('core', 'roles',              'core.roles exists');
select has_table('core', 'role_permissions',   'core.role_permissions exists');
select has_table('core', 'role_assignments',   'core.role_assignments exists');
select has_table('core', 'line_channels',      'core.line_channels exists');
select has_table('core', 'line_accounts',      'core.line_accounts exists');

-- --- Audit table exists ----------------------------------------------------
select has_table('audit', 'audit_logs', 'audit.audit_logs exists');

-- --- Product scaffold tables exist -----------------------------------------
select has_table('workforce', 'employees',      'workforce.employees exists');
select has_table('workforce', 'shifts',         'workforce.shifts exists');
select has_table('workforce', 'shift_requests', 'workforce.shift_requests exists');
select has_table('workforce', 'leave_requests', 'workforce.leave_requests exists');
select has_table('workforce', 'attendance',     'workforce.attendance exists');

select has_table('booking', 'services',       'booking.services exists');
select has_table('booking', 'staff',          'booking.staff exists');
select has_table('booking', 'business_hours', 'booking.business_hours exists');
select has_table('booking', 'blocked_slots',  'booking.blocked_slots exists');
select has_table('booking', 'bookings',       'booking.bookings exists');
select has_table('booking', 'booking_events', 'booking.booking_events exists');

select has_table('ai', 'proposals',   'ai.proposals exists');
select has_table('ai', 'prompt_logs', 'ai.prompt_logs exists');

-- --- Every product table carries tenant_id ---------------------------------
-- Mandatory multi-tenant rule: no product base table without tenant_id.
select is(
  (select count(*)::int
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname in ('workforce', 'booking', 'ai')
      and c.relkind = 'r'
      and not exists (
        select 1 from pg_attribute a
         where a.attrelid = c.oid
           and a.attname  = 'tenant_id'
           and a.attnum   > 0
           and not a.attisdropped
      )),
  0,
  'every product (workforce/booking/ai) base table has a tenant_id column'
);

select * from finish();
rollback;
