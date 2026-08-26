-- ============================================================================
-- 0096  Booking: enforce module-OFF gating (Module Access Security
--       Remediation, WP-S4)
-- ----------------------------------------------------------------------------
-- Booking is a scaffold-only module (AGENTS.md "Database phase (Phase 1)":
-- schema/RLS exist, no product features built on it -- confirmed by
-- searching the full migration/test history: only 0008_rbac_seed.sql
-- (permission seed) and 0010_booking.sql (schema + RLS) ever reference the
-- booking schema; no api.* view, no RPC, no SECURITY DEFINER function, and
-- the only test coverage (supabase/tests/0001_scaffold_structure.sql) is
-- purely structural (has_schema/has_table), never a role-hop RLS/behavioral
-- test). This keeps WP-S4 the simplest staged domain: six RLS policies to
-- re-declare, no view/RPC/function surface, no existing fixture at risk of
-- breaking under the new fail-closed default.
--
-- Prior state: none of Booking's six RLS policies (0010) ever checked
-- core.tenant_modules.is_enabled. A tenant with Booking turned OFF (or,
-- since no tenant has ever had a booking row provisioned by any seed/
-- migration, a tenant that simply never had the module row created) still
-- had the same tenant-facing RLS behavior as one with Booking ON, gated
-- only by core.has_permission(...).
--
-- This migration adds core.has_module_access(tenant_id, 'booking') to:
--   * bk_services_read/write
--   * bk_staff_read/write
--   * bk_hours_rw/read
--   * bk_blocked_rw
--   * bk_bookings_read/write
--   * bk_events_read
--
-- Behavior:
--   Booking ON  -> unchanged (permission checks as before).
--   Booking OFF -> every table above returns/accepts nothing tenant-facing;
--                   existing rows (none in any current tenant, but the
--                   guarantee holds regardless) are preserved.
--   Booking ON again -> prior access restored, unchanged.
--
-- No product features added or changed -- per the mission's explicit
-- instruction, this is module-access gating only.
--
-- Rollback: re-apply the pre-0096 policy bodies (drop the module-access
-- conjunct) for each policy listed above. Purely additive/no data change
-- either direction.
-- ============================================================================

drop policy if exists bk_services_read on booking.services;
create policy bk_services_read on booking.services
  for select using (
    core.has_module_access(tenant_id, 'booking')
    and core.has_permission(tenant_id, 'booking.booking.read', location_id)
  );
drop policy if exists bk_services_write on booking.services;
create policy bk_services_write on booking.services
  for all
  using (
    core.has_module_access(tenant_id, 'booking')
    and core.has_permission(tenant_id, 'booking.service.manage', location_id)
  )
  with check (
    core.has_module_access(tenant_id, 'booking')
    and core.has_permission(tenant_id, 'booking.service.manage', location_id)
  );

drop policy if exists bk_staff_read on booking.staff;
create policy bk_staff_read on booking.staff
  for select using (
    core.has_module_access(tenant_id, 'booking')
    and core.has_permission(tenant_id, 'booking.booking.read', location_id)
  );
drop policy if exists bk_staff_write on booking.staff;
create policy bk_staff_write on booking.staff
  for all
  using (
    core.has_module_access(tenant_id, 'booking')
    and core.has_permission(tenant_id, 'booking.service.manage', location_id)
  )
  with check (
    core.has_module_access(tenant_id, 'booking')
    and core.has_permission(tenant_id, 'booking.service.manage', location_id)
  );

drop policy if exists bk_hours_rw on booking.business_hours;
create policy bk_hours_rw on booking.business_hours
  for all
  using (
    core.has_module_access(tenant_id, 'booking')
    and core.has_permission(tenant_id, 'booking.service.manage', location_id)
  )
  with check (
    core.has_module_access(tenant_id, 'booking')
    and core.has_permission(tenant_id, 'booking.service.manage', location_id)
  );
drop policy if exists bk_hours_read on booking.business_hours;
create policy bk_hours_read on booking.business_hours
  for select using (
    core.has_module_access(tenant_id, 'booking')
    and core.has_permission(tenant_id, 'booking.booking.read', location_id)
  );

drop policy if exists bk_blocked_rw on booking.blocked_slots;
create policy bk_blocked_rw on booking.blocked_slots
  for all
  using (
    core.has_module_access(tenant_id, 'booking')
    and core.has_permission(tenant_id, 'booking.service.manage', location_id)
  )
  with check (
    core.has_module_access(tenant_id, 'booking')
    and core.has_permission(tenant_id, 'booking.service.manage', location_id)
  );

drop policy if exists bk_bookings_read on booking.bookings;
create policy bk_bookings_read on booking.bookings
  for select using (
    core.has_module_access(tenant_id, 'booking')
    and core.has_permission(tenant_id, 'booking.booking.read', location_id)
  );
drop policy if exists bk_bookings_write on booking.bookings;
create policy bk_bookings_write on booking.bookings
  for all
  using (
    core.has_module_access(tenant_id, 'booking')
    and core.has_permission(tenant_id, 'booking.booking.write', location_id)
  )
  with check (
    core.has_module_access(tenant_id, 'booking')
    and core.has_permission(tenant_id, 'booking.booking.write', location_id)
  );

drop policy if exists bk_events_read on booking.booking_events;
create policy bk_events_read on booking.booking_events
  for select using (
    core.has_module_access(tenant_id, 'booking')
    and core.has_permission(tenant_id, 'booking.booking.read')
  );
