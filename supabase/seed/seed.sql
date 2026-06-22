-- ============================================================================
-- Seed: demo tenant + client template tenant
-- ----------------------------------------------------------------------------
-- Demo and client template are TENANTS, not separate codebases. Differences
-- are expressed through tenant.kind, settings, and seed data only.
--
-- This file seeds non-PII structure (tenants, locations, modules, services,
-- hours). PII-bearing fake demo data (customers, employees) is created by the
-- TS seeder (scripts/seed.ts) so it is encrypted/hashed correctly.
-- Safe to re-run.
-- ============================================================================

-- Stable ids for repeatable seeding -----------------------------------------
-- Demo tenant
insert into core.tenants (id, slug, name, kind, status, settings) values
  ('11111111-1111-1111-1111-111111111111', 'mame-to-cha-tokyo', 'Mame To Cha Tokyo',
   'demo', 'active',
   '{"locale":"ja-JP","demo":true,"branding":{"primary":"#2f6b3e"}}'::jsonb)
on conflict (id) do nothing;

insert into core.tenants (id, slug, name, kind, status, settings) values
  ('22222222-2222-2222-2222-222222222222', 'mirawi-demo-salon', 'Mirawi Demo Salon',
   'demo', 'active',
   '{"locale":"ja-JP","demo":true,"branding":{"primary":"#a8326b"}}'::jsonb)
on conflict (id) do nothing;

-- Client template tenant (clean starter; clone this to onboard real clients)
insert into core.tenants (id, slug, name, kind, status, settings) values
  ('33333333-3333-3333-3333-333333333333', 'client-template', 'Client Template',
   'client_template', 'active',
   '{"locale":"ja-JP","demo":false,"production_auth":true}'::jsonb)
on conflict (id) do nothing;

-- Locations -----------------------------------------------------------------
insert into core.locations (id, tenant_id, name, timezone) values
  ('1a111111-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Main Cafe', 'Asia/Tokyo'),
  ('2a222222-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'Main Salon', 'Asia/Tokyo'),
  ('3a333333-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', 'Main Location', 'Asia/Tokyo')
on conflict (id) do nothing;

-- Module entitlements -------------------------------------------------------
insert into core.tenant_modules (tenant_id, module, is_enabled) values
  ('11111111-1111-1111-1111-111111111111', 'core', true),
  ('11111111-1111-1111-1111-111111111111', 'workforce', true),
  ('11111111-1111-1111-1111-111111111111', 'ai', true),
  ('22222222-2222-2222-2222-222222222222', 'core', true),
  ('22222222-2222-2222-2222-222222222222', 'booking', true),
  ('22222222-2222-2222-2222-222222222222', 'ai', true),
  ('33333333-3333-3333-3333-333333333333', 'core', true)
on conflict (tenant_id, module) do nothing;

-- Booking demo: services + business hours (no PII) --------------------------
insert into booking.services (id, tenant_id, location_id, name, duration_minutes, price_cents) values
  ('b5000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222',
   '2a222222-0000-0000-0000-000000000001', 'Haircut', 60, 550000),
  ('b5000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222',
   '2a222222-0000-0000-0000-000000000001', 'Color', 120, 1200000)
on conflict (id) do nothing;

insert into booking.business_hours (tenant_id, location_id, weekday, opens_at, closes_at)
select '22222222-2222-2222-2222-222222222222', '2a222222-0000-0000-0000-000000000001',
       d, time '10:00', time '20:00'
from generate_series(1, 6) as d
on conflict do nothing;
