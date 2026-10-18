-- ============================================================================
-- QA4 seed cleanup: removes exactly the rows qa4-seed-past-month.sql inserted
-- (ids starting with 0a4a5eed-) on one test tenant, and reopens the backlog
-- rows it resolved (matched by its resolution note).
--
-- Valid only BEFORE live QA4 actions point at seeded rows: a live purchase on
-- a seeded latest count (purchase_actions.snapshot_stock_count_id), a
-- correction request on a seeded attendance row (shift_requests.attendance_id)
-- or a 'reported' exception on a seeded instance are foreign keys that block
-- the delete. The function then refuses up front and names them; nothing is
-- deleted (one statement).
--
-- Not restorable: the critical_missed rows the seed removed for the
-- occurrences it completed. The Manager Operations read recreates them for
-- the last 31 days (operations.flag_missed_critical window); older ones stay
-- gone (they were system flags on test data).
--
-- Run: pnpm exec supabase db query --linked -o table -f packages/db/scripts/qa4-seed-cleanup.sql
-- ============================================================================

create or replace function pg_temp.qa4_cleanup(p_slug text)
returns table (what text, n integer)
language plpgsql as $$
declare
  v_tenant uuid;
  v_n int;
begin
  if p_slug not in ('oruwa-cafe', 'qa4-local') then
    raise exception 'qa4_cleanup: % is not a registered test tenant', p_slug;
  end if;
  select t.id into v_tenant from core.tenants t
   where t.slug = p_slug
     and t.id in ('72b81b2f-9ba5-4a4a-a296-02e32d4682b8', '9a400000-0000-0000-0000-000000000001');
  if v_tenant is null then raise exception 'qa4_cleanup: tenant % not found or not the pinned test tenant', p_slug; end if;

  -- live rows that reference seeded rows block the delete: refuse with a clear message
  select
    (select count(*) from purchases.purchase_actions pa
      where pa.tenant_id = v_tenant and pa.id::text not like '0a4a5eed-%' and pa.snapshot_stock_count_id::text like '0a4a5eed-%')
  + (select count(*) from workforce.shift_requests sr
      where sr.tenant_id = v_tenant and sr.attendance_id::text like '0a4a5eed-%')
  + (select count(*) from operations.task_exceptions te
      where te.tenant_id = v_tenant and te.id::text not like '0a4a5eed-%' and te.instance_id::text like '0a4a5eed-%')
  + (select count(*) from issues.issues i
      where i.tenant_id = v_tenant and i.id::text not like '0a4a5eed-%' and i.operations_exception_id::text like '0a4a5eed-%')
  into v_n;
  if v_n > 0 then
    raise exception 'qa4_cleanup: % live row(s) reference seeded rows (purchases on seeded counts, correction requests on seeded attendance, exceptions on seeded instances); nothing deleted', v_n;
  end if;

  -- children first
  delete from workforce.staff_messages where tenant_id = v_tenant and id::text like '0a4a5eed-%';
  get diagnostics v_n = row_count; what := 'mail'; n := v_n; return next;
  delete from purchases.purchase_actions where tenant_id = v_tenant and id::text like '0a4a5eed-%';
  get diagnostics v_n = row_count; what := 'purchase_actions'; n := v_n; return next;
  delete from inventory.stock_counts where tenant_id = v_tenant and id::text like '0a4a5eed-%';
  get diagnostics v_n = row_count; what := 'stock_counts'; n := v_n; return next;
  delete from issues.issues where tenant_id = v_tenant and id::text like '0a4a5eed-%';
  get diagnostics v_n = row_count; what := 'issues'; n := v_n; return next;
  delete from operations.task_exceptions where tenant_id = v_tenant and id::text like '0a4a5eed-%';
  get diagnostics v_n = row_count; what := 'threshold_exceptions'; n := v_n; return next;
  delete from operations.item_responses where tenant_id = v_tenant and instance_id::text like '0a4a5eed-%';
  get diagnostics v_n = row_count; what := 'item_responses'; n := v_n; return next;
  delete from operations.task_instances where tenant_id = v_tenant and id::text like '0a4a5eed-%';
  get diagnostics v_n = row_count; what := 'operations_instances'; n := v_n; return next;
  delete from workforce.attendance where tenant_id = v_tenant and id::text like '0a4a5eed-%';
  get diagnostics v_n = row_count; what := 'attendance'; n := v_n; return next;
  delete from workforce.shifts where tenant_id = v_tenant and id::text like '0a4a5eed-%';
  get diagnostics v_n = row_count; what := 'shifts'; n := v_n; return next;

  update operations.task_exceptions
     set status = 'open', resolved_at = null, resolved_by = null, resolution_note = null
   where tenant_id = v_tenant and source = 'critical_missed' and status = 'resolved'
     and resolution_note like 'QA4 baseline (%): pre-QA4 test backlog closed by the Lead via the QA4 seed, recorded under the QA Manager account (DEBT-002).';
  get diagnostics v_n = row_count; what := 'backlog_reopened'; n := v_n; return next;
end;
$$;

select * from pg_temp.qa4_cleanup('oruwa-cafe');
