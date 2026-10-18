-- ============================================================================
-- QA4 seed verification (read-only). Every row should say ok = true.
--   pnpm exec supabase db query --linked -o table -f packages/db/scripts/qa4-seed-verify.sql
-- The tenant slug and window are in the first CTE.
-- ============================================================================
with p as (
  select t.id as tenant, l.id as loc, l.timezone as tz, date '2026-09-21' as d_from, date '2026-10-17' as d_to
    from core.tenants t join core.locations l on l.tenant_id = t.id
   where t.slug = 'oruwa-cafe'
   order by l.created_at limit 1
),
seed_shifts as (
  select s.*, (s.starts_at at time zone p.tz)::date as wd from workforce.shifts s, p
   where s.tenant_id = p.tenant and s.id::text like '0a4a5eed-%'
),
per_day as (
  select wd, count(*) as n from seed_shifts group by wd
),
per_week as (
  select s.employee_id, date_trunc('week', s.starts_at at time zone p.tz) as wk, count(*) as days,
         sum(extract(epoch from s.ends_at - s.starts_at) / 3600) as hours
    from workforce.shifts s, p
   where s.tenant_id = p.tenant and s.published
     and (s.starts_at at time zone p.tz)::date between p.d_from and p.d_to
   group by 1, 2
),
dup_day as (
  select s.employee_id, (s.starts_at at time zone p.tz)::date as wd, count(*) as n
    from workforce.shifts s, p
   where s.tenant_id = p.tenant and (s.starts_at at time zone p.tz)::date between p.d_from and p.d_to
   group by 1, 2 having count(*) > 1
),
att as (
  select a.* from workforce.attendance a, p where a.tenant_id = p.tenant and a.id::text like '0a4a5eed-%'
),
inst as (
  select ti.* from operations.task_instances ti, p where ti.tenant_id = p.tenant and ti.id::text like '0a4a5eed-%'
)
select check_name, ok, detail from (
  select 'every day in the window has seeded shifts' as check_name,
         (select count(*) from per_day) = (select d_to - d_from + 1 from p) as ok,
         (select count(*) from per_day)::text || ' days' as detail
  union all
  select 'nobody over the weekly day / hour limit (published shifts in the window)',
         not exists (select 1 from per_week where days > 5 or hours > 40),
         coalesce((select max(days)::text || ' days, ' || round(max(hours), 1)::text || ' h max' from per_week), '-')
  union all
  select 'nobody has two shifts on one day', not exists (select 1 from dup_day), (select count(*)::text from dup_day)
  union all
  select 'one attendance row per seeded shift', (select count(*) from att) = (select count(*) from seed_shifts),
         (select count(*)::text from att) || ' / ' || (select count(*)::text from seed_shifts)
  union all
  select 'exactly one absence', (select count(*) from att where status = 'absent') = 1,
         (select count(*)::text from att where status = 'absent')
  union all
  select 'some late arrivals', (select count(*) from att where status = 'late') > 0,
         (select count(*)::text from att where status = 'late')
  union all
  select 'exactly one open shift without clock-out (for a live correction)',
         (select count(*) from att where clock_in is not null and clock_out is null) = 1,
         (select count(*)::text from att where clock_in is not null and clock_out is null)
  union all
  select 'every seeded instance completed with responses',
         not exists (select 1 from inst where status <> 'completed')
         and not exists (select 1 from inst i where not exists (select 1 from operations.item_responses r where r.instance_id = i.id)),
         (select count(*)::text from inst)
  union all
  select 'no open critical_missed on a completed occurrence',
         not exists (select 1 from operations.task_exceptions te, p
                      join operations.task_instances ti on ti.tenant_id = p.tenant
                     where te.tenant_id = p.tenant and te.source = 'critical_missed' and te.status = 'open'
                       and ti.schedule_id = te.schedule_id and ti.business_date = te.business_date and ti.status = 'completed'),
         '-'
  union all
  select 'no open critical_missed before the window',
         not exists (select 1 from operations.task_exceptions te, p
                     where te.tenant_id = p.tenant and te.source = 'critical_missed' and te.status = 'open' and te.business_date < p.d_from),
         '-'
  union all
  select 'threshold exceptions: one open, one resolved',
         (select count(*) filter (where te.status = 'open') = 1 and count(*) filter (where te.status = 'resolved') = 1
            from operations.task_exceptions te, p where te.tenant_id = p.tenant and te.id::text like '0a4a5eed-%'),
         (select string_agg(te.status::text, ',') from operations.task_exceptions te, p where te.tenant_id = p.tenant and te.id::text like '0a4a5eed-%')
  union all
  select 'issues seeded (resolved / acknowledged / open)',
         (select count(distinct i.status) = 3 from issues.issues i, p where i.tenant_id = p.tenant and i.id::text like '0a4a5eed-%'),
         (select string_agg(i.status || '=' || n, ', ') from (select i.status, count(*) n from issues.issues i, p
                                                               where i.tenant_id = p.tenant and i.id::text like '0a4a5eed-%' group by 1) i)
  union all
  select 'every receive follows an order of the same item',
         not exists (select 1 from purchases.purchase_actions r, p
                     where r.tenant_id = p.tenant and r.id::text like '0a4a5eed-%' and r.action_type = 'received'
                       and not exists (select 1 from purchases.purchase_actions o
                                        where o.tenant_id = r.tenant_id and o.item_id = r.item_id and o.action_type = 'ordered'
                                          and o.actioned_at < r.actioned_at and o.snapshot_stock_count_id = r.snapshot_stock_count_id)),
         (select string_agg(action_type || '=' || n, ', ') from (select action_type, count(*) n from purchases.purchase_actions pa, p
                                                                  where pa.tenant_id = p.tenant and pa.id::text like '0a4a5eed-%' group by 1) x)
  union all
  select 'mail seeded', (select count(*) from workforce.staff_messages m, p where m.tenant_id = p.tenant and m.id::text like '0a4a5eed-%') > 0,
         (select count(*)::text from workforce.staff_messages m, p where m.tenant_id = p.tenant and m.id::text like '0a4a5eed-%')
) x;
