-- ============================================================================
-- QA4 seed: a realistic PAST month on a TEST tenant (Cloud DEV only).
-- ----------------------------------------------------------------------------
-- Why: the app stamps clock-in/out, task completion and counts with the real
-- server time, so past days cannot be clicked into existence (roadmap
-- 2026-10-08, Stage 3 [A]). This writes the past month directly, as the
-- product's own tables would look after a month of normal use, so QA4 can
-- check Weekly Review, labour cost, monthly hours, Operations history,
-- Inventory/Purchasing history and Issues on real-looking data.
--
-- Scenario and checks: docs/ai/QA4_SCENARIO_2026-10-18.md.
--
-- What it writes for every day in [p_from, p_to] (location timezone):
--   * published shifts matching the weekday headcount, within the weekly
--     day/hour limits, skipping anyone who already has a shift that day;
--   * attendance for each seeded shift (on time, a few late, one absent, the
--     latest shift of one account holder without a clock-out = material for
--     a live correction request in QA4);
--   * a completed Operations instance with responses for every active
--     schedule, except a few deliberately missed occurrences; two fridge
--     readings out of range (threshold exceptions: one resolved, one open);
--     open critical_missed rows for the occurrences it completes are removed
--     (the task is now on record as done on time);
--   * Issues & Handover notes (resolved, acknowledged, open), stock counts
--     (Mon/Thu), order -> receive and "bought" purchase actions, a few Mail
--     messages.
-- Before p_from: still-open critical_missed rows (the QA backlog of
-- DEBT-002) are resolved with an explicit QA4-baseline note.
--
-- Safety:
--   * Test tenants only: refuses unless the tenant slug is listed below.
--   * One call = one statement = atomic. Refuses to run twice (any seeded
--     shift present) -- run the cleanup file first to re-seed.
--   * Every inserted row's id starts with 0a4a5eed- (cleanup key).
--   * Writes bypass the app's RPCs (no writeAudit rows), like the other
--     fixture tools; no PII is written (names stay encrypted, untouched).
--
-- Run (Cloud DEV, from the repo root, Lead/CTO decision with before/after
-- counts):
--   pnpm exec supabase db query --linked -o table -f packages/db/scripts/qa4-seed-past-month.sql
-- The last statement holds the target and window; edit it for another run.
-- Cleanup: packages/db/scripts/qa4-seed-cleanup.sql.
-- ============================================================================

create or replace function pg_temp.qa4_h(p_key text)
returns integer language sql immutable as $$
  select abs(hashtext(p_key));
$$;

create or replace function pg_temp.qa4_id(p_tenant uuid, p_kind text, p_key text)
returns uuid language sql immutable as $$
  select ('0a4a5eed' || substr(md5(p_tenant::text || ':' || p_kind || ':' || p_key), 9))::uuid;
$$;

create or replace function pg_temp.qa4_seed(p_slug text, p_from date, p_to date)
returns table (what text, n integer)
language plpgsql as $$
declare
  v_tenant uuid;
  v_loc uuid;
  v_tz text;
  v_mgr uuid;
  v_headcount jsonb;
  v_max_days int;
  v_max_hours int;
  v_emps uuid[];
  v_emp_users uuid[];
  v_types uuid[];
  d date;
  k int;
  i int;
  e int;
  v_need int;
  v_emp uuid;
  v_type record;
  v_start timestamptz;
  v_end timestamptz;
  v_wk_days int;
  v_wk_hours numeric;
  v_n_shifts int := 0;
  v_n_att int := 0;
  v_n_inst int := 0;
  v_n_missed int := 0;
  v_n_thr int := 0;
  v_n_del_missed int := 0;
  v_n_backlog int := 0;
  v_n_issues int := 0;
  v_n_counts int := 0;
  v_n_purch int := 0;
  v_n_mail int := 0;
  r record;
  it record;
  v_inst uuid;
  v_by uuid;
  v_val numeric;
  v_h int;
  v_last_open_thr boolean := false;
  v_qty numeric;
  v_count_id uuid;
  v_dec int;
  v_absent uuid;
  v_recv_day date;
  v_recv_qty numeric;
begin
  -- --- target ---------------------------------------------------------------
  if p_slug not in ('oruwa-cafe', 'qa4-local') then
    raise exception 'qa4_seed: % is not a registered test tenant', p_slug;
  end if;
  if p_to >= (now() at time zone 'Asia/Tokyo')::date then
    raise exception 'qa4_seed: window must end before today (got %)', p_to;
  end if;

  -- pinned ids, not just the slug: the Cloud DEV oruwa-cafe tenant and the local fixture
  select t.id into v_tenant from core.tenants t
   where t.slug = p_slug
     and t.id in ('72b81b2f-9ba5-4a4a-a296-02e32d4682b8', '9a400000-0000-0000-0000-000000000001');
  if v_tenant is null then raise exception 'qa4_seed: tenant % not found or not the pinned test tenant', p_slug; end if;

  select l.id, l.timezone into v_loc, v_tz
    from core.locations l where l.tenant_id = v_tenant order by l.created_at, l.id limit 1;

  select ra.user_id into v_mgr
    from core.role_assignments ra join core.roles ro on ro.id = ra.role_id
   where ra.tenant_id = v_tenant and ro.key = 'manager' order by ra.created_at, ra.user_id limit 1;
  if v_mgr is null then raise exception 'qa4_seed: no manager role assignment'; end if;

  if exists (select 1 from workforce.shifts s where s.tenant_id = v_tenant and s.id::text like '0a4a5eed-%') then
    raise exception 'qa4_seed: tenant % is already seeded -- run qa4-seed-cleanup.sql first', p_slug;
  end if;

  select coalesce(ss.required_headcount_by_weekday, '[1,2,2,2,3,2,1]'::jsonb),
         coalesce(ss.max_days_per_week, 5), coalesce(ss.max_weekly_hours, 40)
    into v_headcount, v_max_days, v_max_hours
    from workforce.schedule_settings ss where ss.tenant_id = v_tenant and ss.location_id = v_loc;
  v_headcount := coalesce(v_headcount, '[1,2,2,2,3,2,1]'::jsonb);
  v_max_days := coalesce(v_max_days, 5);
  v_max_hours := coalesce(v_max_hours, 40);

  select array_agg(x.id order by x.id), array_agg(x.user_id order by x.id) into v_emps, v_emp_users
    from workforce.employees x
   where x.tenant_id = v_tenant and x.is_active and (x.location_id = v_loc or x.location_id is null);
  if coalesce(array_length(v_emps, 1), 0) = 0 then raise exception 'qa4_seed: no active employees'; end if;

  -- part-time shift types (4-5 h) keep everyone inside the weekly limits
  select array_agg(st.id order by st.starts_at_local, st.id) into v_types
    from workforce.shift_types st
   where st.tenant_id = v_tenant and st.is_active
     and (st.location_id = v_loc or st.location_id is null)
     and st.ends_at_local > st.starts_at_local
     and st.ends_at_local - st.starts_at_local between interval '4 hours' and interval '5 hours';
  if coalesce(array_length(v_types, 1), 0) = 0 then raise exception 'qa4_seed: no active 4-5 h shift type'; end if;

  -- --- 1. shifts --------------------------------------------------------------
  d := p_from;
  while d <= p_to loop
    v_need := coalesce((v_headcount ->> (extract(isodow from d)::int - 1))::int, 1);
    k := 0;
    for e in 1 .. array_length(v_emps, 1) loop
      exit when k >= v_need;
      -- rotate who comes first each day
      i := ((e - 1 + (d - p_from)) % array_length(v_emps, 1)) + 1;
      v_emp := v_emps[i];
      continue when exists (
        select 1 from workforce.shifts s
         where s.tenant_id = v_tenant and s.employee_id = v_emp
           and (s.starts_at at time zone v_tz)::date = d)
        or exists (
        select 1 from workforce.attendance a
         where a.tenant_id = v_tenant and a.employee_id = v_emp and a.work_date = d);
      select count(*), coalesce(sum(extract(epoch from s.ends_at - s.starts_at) / 3600), 0)
        into v_wk_days, v_wk_hours
        from workforce.shifts s
       where s.tenant_id = v_tenant and s.employee_id = v_emp
         and date_trunc('week', s.starts_at at time zone v_tz) = date_trunc('week', d::timestamp);
      select st.* into v_type from workforce.shift_types st
       where st.id = v_types[((k + (d - p_from)) % array_length(v_types, 1)) + 1];
      continue when v_wk_days + 1 > v_max_days
        or v_wk_hours + extract(epoch from v_type.ends_at_local - v_type.starts_at_local) / 3600 > v_max_hours;
      v_start := (d + v_type.starts_at_local) at time zone v_tz;
      v_end := (d + v_type.ends_at_local) at time zone v_tz;
      insert into workforce.shifts (id, tenant_id, location_id, employee_id, starts_at, ends_at, published, shift_type_id, break_minutes, created_at)
      values (pg_temp.qa4_id(v_tenant, 'shift', d::text || ':' || k), v_tenant, v_loc, v_emp, v_start, v_end, true,
              v_type.id, v_type.break_minutes, ((d - 14) + time '18:00') at time zone v_tz);
      v_n_shifts := v_n_shifts + 1;
      k := k + 1;
    end loop;
    d := d + 1;
  end loop;

  -- --- 2. attendance ---------------------------------------------------------
  -- exactly one absence: the first second-week shift of someone without a login (else anyone)
  select s.id into v_absent
    from workforce.shifts s join workforce.employees ee on ee.id = s.employee_id
   where s.tenant_id = v_tenant and s.id::text like '0a4a5eed-%' and s.starts_at >= (p_from + 7)::timestamp at time zone v_tz
   order by (ee.user_id is null) desc, s.starts_at limit 1;
  for r in
    select s.*, (s.starts_at at time zone v_tz)::date as wd,
           row_number() over (order by s.starts_at desc) as rn_desc
      from workforce.shifts s
     where s.tenant_id = v_tenant and s.id::text like '0a4a5eed-%'
     order by s.starts_at
  loop
    continue when exists (
      select 1 from workforce.attendance a
       where a.tenant_id = v_tenant and a.employee_id = r.employee_id and a.work_date = r.wd);
    v_h := pg_temp.qa4_h(r.id::text);
    if r.id = v_absent then
      insert into workforce.attendance (id, tenant_id, location_id, employee_id, shift_id, work_date, status, created_at)
      values (pg_temp.qa4_id(v_tenant, 'att', r.id::text), v_tenant, v_loc, r.employee_id, r.id, r.wd, 'absent', r.starts_at);
    else
      insert into workforce.attendance (id, tenant_id, location_id, employee_id, shift_id, work_date, clock_in, clock_out, status,
                                        actual_break_minutes, transportation_cost, daily_message, created_at)
      values (
        pg_temp.qa4_id(v_tenant, 'att', r.id::text), v_tenant, v_loc, r.employee_id, r.id, r.wd,
        case when v_h % 23 = 0 then r.starts_at + make_interval(mins => 8 + v_h % 10)
             else r.starts_at - make_interval(mins => v_h % 7) end,
        -- the newest seeded shift of an account holder stays open: QA4 corrects it live
        case when r.employee_id = (select x from unnest(v_emps, v_emp_users) as u(x, y) where y is not null order by x limit 1)
                  and r.starts_at = (select max(s2.starts_at) from workforce.shifts s2
                                      where s2.tenant_id = v_tenant and s2.id::text like '0a4a5eed-%' and s2.employee_id = r.employee_id)
             then null
             else r.ends_at + make_interval(mins => (v_h % 9) - 2) end,
        case when v_h % 23 = 0 then 'late'::workforce.attendance_status else 'present'::workforce.attendance_status end,
        r.break_minutes,
        case when pg_temp.qa4_h(r.employee_id::text) % 2 = 0 then 320 else null end,
        case v_h % 13
          when 0 then '牛乳の残りが少なめです。'
          when 1 then 'ランチは混雑しました。'
          when 2 then '製氷機の音が少し大きいです。'
          else null end,
        r.starts_at);
    end if;
    v_n_att := v_n_att + 1;
  end loop;

  -- --- 3. operations ---------------------------------------------------------
  d := p_from;
  while d <= p_to loop
    for r in
      select ts.* from operations.task_schedules ts
        join operations.checklist_templates ct on ct.tenant_id = ts.tenant_id and ct.id = ts.template_id
       -- same occurrence rule as the app (0116): effective dates + retired_on, not is_active,
       -- so a superseded schedule version still gets its past days
       where ts.tenant_id = v_tenant and ts.location_id = v_loc
         and ts.effective_from <= d and (ts.effective_to is null or d <= ts.effective_to)
         and (ct.retired_on is null or d <= ct.retired_on)
         and (ts.recurrence_kind = 'daily' or extract(isodow from d)::smallint = any (ts.weekdays))
       order by ts.due_time, ts.id
    loop
      continue when exists (select 1 from operations.task_instances ti
                             where ti.tenant_id = v_tenant and ti.schedule_id = r.id and ti.business_date = d);
      if pg_temp.qa4_h(r.id::text || d::text) % 19 = 0 then
        v_n_missed := v_n_missed + 1;
        continue;
      end if;
      v_start := (d + r.due_time - interval '6 minutes') at time zone v_tz;
      -- performer: an account holder on shift at that time, else on shift that day, else the manager
      select coalesce(
        (select ee.user_id from workforce.shifts s join workforce.employees ee on ee.id = s.employee_id
          where s.tenant_id = v_tenant and ee.user_id is not null and v_start between s.starts_at and s.ends_at
          order by s.id limit 1),
        (select ee.user_id from workforce.shifts s join workforce.employees ee on ee.id = s.employee_id
          where s.tenant_id = v_tenant and ee.user_id is not null and (s.starts_at at time zone v_tz)::date = d
          order by s.id limit 1),
        v_mgr) into v_by;
      v_inst := pg_temp.qa4_id(v_tenant, 'inst', r.id::text || ':' || d);
      insert into operations.task_instances (id, tenant_id, location_id, schedule_id, template_id, business_date, status, started_at, started_by, created_at)
      values (v_inst, v_tenant, v_loc, r.id, r.template_id, d, 'in_progress', v_start, v_by, v_start);
      for it in
        select ci.* from operations.checklist_items ci
         where ci.tenant_id = v_tenant and ci.template_id = r.template_id and ci.is_active
         order by ci.sort_order, ci.id
      loop
        v_h := pg_temp.qa4_h(it.id::text || d::text);
        if it.response_type = 'boolean' then
          insert into operations.item_responses (id, tenant_id, location_id, instance_id, item_id, response_bool, recorded_by, recorded_at)
          values (pg_temp.qa4_id(v_tenant, 'resp', v_inst::text || it.id), v_tenant, v_loc, v_inst, it.id, true, v_by, v_start + interval '2 minutes');
        elsif it.response_type = 'text' then
          insert into operations.item_responses (id, tenant_id, location_id, instance_id, item_id, response_text, recorded_by, recorded_at)
          values (pg_temp.qa4_id(v_tenant, 'resp', v_inst::text || it.id), v_tenant, v_loc, v_inst, it.id, '問題なし', v_by, v_start + interval '2 minutes');
        elsif it.response_type = 'numeric' then
          continue when not it.is_required and v_h % 3 <> 0;
          if it.label ~ '冷凍|Freezer' then v_val := -18 - (v_h % 30) / 10.0;
          elsif it.label ~ '温蔵|保温|Hot' then v_val := 67 + (v_h % 40) / 10.0;
          else v_val := 2.5 + (v_h % 18) / 10.0;
          end if;
          -- two out-of-range fridge readings in the month (day 9: resolved, 3 days before the end: open),
          -- on the first ranged item answered that day
          if it.numeric_max is not null and d in (p_from + 8, p_to - 2)
             and not exists (select 1 from operations.task_exceptions te
                              join operations.task_instances ti on ti.id = te.instance_id
                             where te.tenant_id = v_tenant and te.source = 'threshold' and ti.business_date = d
                               and te.id::text like '0a4a5eed-%') then
            v_val := it.numeric_max + 1.8;
          end if;
          insert into operations.item_responses (id, tenant_id, location_id, instance_id, item_id, response_numeric, recorded_by, recorded_at)
          values (pg_temp.qa4_id(v_tenant, 'resp', v_inst::text || it.id), v_tenant, v_loc, v_inst, it.id, v_val, v_by, v_start + interval '3 minutes');
          if (it.numeric_max is not null and v_val > it.numeric_max) or (it.numeric_min is not null and v_val < it.numeric_min) then
            v_last_open_thr := (d = p_to - 2);
            insert into operations.task_exceptions (id, tenant_id, location_id, instance_id, item_id, severity, source, status,
                                                    resolved_by, resolved_at, resolution_note, created_at)
            values (pg_temp.qa4_id(v_tenant, 'thr', v_inst::text || it.id), v_tenant, v_loc, v_inst, it.id,
                    case when it.is_critical then 'action_required' else 'warning' end, 'threshold',
                    case when v_last_open_thr then 'open'::operations.exception_status else 'resolved'::operations.exception_status end,
                    case when v_last_open_thr then null else v_mgr end,
                    case when v_last_open_thr then null else v_start + interval '2 hours' end,
                    case when v_last_open_thr then null else '扉が少し開いていました。閉めて30分後に再測定し、3.8℃を確認しました。' end,
                    v_start + interval '3 minutes');
            v_n_thr := v_n_thr + 1;
          end if;
        end if;
      end loop;
      update operations.task_instances
         set status = 'completed', completed_at = v_start + interval '6 minutes', completed_by = v_by
       where id = v_inst;
      delete from operations.task_exceptions te
       -- any status: a completed-on-time occurrence must not also count as missed (Weekly Review)
       where te.tenant_id = v_tenant and te.source = 'critical_missed'
         and te.schedule_id = r.id and te.business_date = d;
      get diagnostics k = row_count;
      v_n_del_missed := v_n_del_missed + k;
      v_n_inst := v_n_inst + 1;
    end loop;
    d := d + 1;
  end loop;

  update operations.task_exceptions te
     set status = 'resolved', resolved_at = now(), resolved_by = v_mgr,
         resolution_note = 'QA4 baseline (' || to_char(now() at time zone 'Asia/Tokyo', 'YYYY-MM-DD') || '): pre-QA4 test backlog closed by the Lead via the QA4 seed, recorded under the QA Manager account (DEBT-002).'
   where te.tenant_id = v_tenant and te.source = 'critical_missed' and te.status = 'open' and te.business_date < p_from;
  get diagnostics v_n_backlog = row_count;

  -- --- 4. issues & handover --------------------------------------------------
  for r in
    select * from (values
      (1,  '09:40', 'issue',    'equipment',  'important', '製氷機から異音がします。氷はまだ出ています。',                      'staff',   'resolved', '業者に点検を依頼し、ファンを交換しました。'),
      (3,  '17:10', 'handover', null,         null,        '明日の朝、牛乳12本が納品されます。冷蔵庫の下段を空けてください。',  'manager', 'resolved', null),
      (6,  '11:25', 'issue',    'customer',   'normal',    'お客様から店内が寒いとのご意見がありました。',                      'staff',   'resolved', '空調を26℃に変更しました。'),
      (9,  '14:05', 'issue',    'facility',   'normal',    'トイレの照明が点滅しています。',                                    'staff',   'resolved', '電球を交換しました。'),
      (12, '20:30', 'handover', null,         null,        'レジ締めは完了。釣り銭の千円札が少なめです。',                      'staff',   'resolved', null),
      (15, '08:15', 'issue',    'inventory',  'important', 'コーヒー豆が残り1袋です。今日中に発注が必要です。',                'staff',   'resolved', '発注済み。明後日入荷予定です。'),
      (19, '16:45', 'issue',    'cleaning',   'normal',    '客席の椅子2脚の脚がぐらついています。',                            'manager', 'resolved', 'ネジを締め直しました。'),
      (22, '13:20', 'handover', null,         null,        '来週月曜は設備点検のため10時開店です。',                            'manager', 'acknowledged', null),
      (24, '10:50', 'issue',    'equipment',  'normal',    'エスプレッソマシンのスチーム圧が少し弱いです。',                    'staff',   'open', null),
      (26, '18:20', 'handover', null,         null,        '明日の仕込み：スコーン生地2回分。冷凍庫の右側にあります。',        'staff',   'open', null)
    ) as v(off, hm, kind, category, severity, note, who, status, res_note)
  loop
    d := p_from + r.off;
    continue when d > p_to;
    v_start := (d + r.hm::time) at time zone v_tz;
    v_by := case when r.who = 'manager' then v_mgr
                 else (select y from unnest(v_emps, v_emp_users) as u(x, y) where y is not null
                        order by pg_temp.qa4_h(x::text || r.off) limit 1) end;
    insert into issues.issues (id, tenant_id, location_id, kind, category, severity, status, note, business_date,
                               reported_by, reported_by_role, acknowledged_by, acknowledged_at, resolved_by, resolved_at,
                               resolution_note, source, created_at)
    values (pg_temp.qa4_id(v_tenant, 'issue', r.off::text), v_tenant, v_loc, r.kind, r.category, r.severity, r.status, r.note, d,
            v_by, r.who,
            case when r.status in ('acknowledged', 'resolved') then v_mgr end,
            case when r.status in ('acknowledged', 'resolved') then v_start + interval '40 minutes' end,
            case when r.status = 'resolved' then v_mgr end,
            case when r.status = 'resolved' then v_start + interval '1 day 2 hours' end,
            r.res_note, 'manual', v_start);
    v_n_issues := v_n_issues + 1;
  end loop;

  -- --- 5. inventory counts + purchases ---------------------------------------
  for it in
    select x.* from inventory.items x
     where x.tenant_id = v_tenant and x.is_active and x.location_id = v_loc
       and x.name !~ 'QA' and x.required_quantity is not null and x.required_quantity > 0
     order by x.name
  loop
    v_dec := case when it.unit in ('kg', 'L') then 1 else 0 end;
    v_qty := it.required_quantity;
    v_count_id := null;
    v_recv_day := null;
    d := p_from;
    while d <= p_to loop
      -- daily use: about a tenth of the target
      v_qty := greatest(v_qty - it.required_quantity * (8 + pg_temp.qa4_h(it.id::text || d) % 5) / 100.0, 0);
      -- delivery of an earlier order: like api.record_purchase_receipt, a new count (old + received)
      -- by the receiver, and the 'received' row points at that new count
      if d = v_recv_day then
        v_qty := v_qty + v_recv_qty;
        v_count_id := pg_temp.qa4_id(v_tenant, 'recvcount', it.id::text || d);
        insert into inventory.stock_counts (id, tenant_id, location_id, item_id, actual_quantity, counted_by, counted_at, created_at)
        values (v_count_id, v_tenant, v_loc, it.id, round(v_qty, v_dec), v_mgr,
                (d + time '10:00') at time zone v_tz, (d + time '10:00') at time zone v_tz);
        insert into purchases.purchase_actions (id, tenant_id, location_id, item_id, snapshot_stock_count_id, actioned_by, actioned_at, created_at, action_type, received_quantity)
        values (pg_temp.qa4_id(v_tenant, 'recv', it.id::text || d), v_tenant, v_loc, it.id, v_count_id, v_mgr,
                (d + time '10:00') at time zone v_tz, (d + time '10:00') at time zone v_tz, 'received', v_recv_qty);
        v_n_counts := v_n_counts + 1;
        v_n_purch := v_n_purch + 1;
        v_recv_day := null;
      end if;
      if extract(isodow from d) in (1, 4)
         and not exists (select 1 from inventory.stock_counts sc
                          where sc.tenant_id = v_tenant and sc.item_id = it.id
                            and (sc.counted_at at time zone v_tz)::date = d) then
        v_count_id := pg_temp.qa4_id(v_tenant, 'count', it.id::text || d);
        insert into inventory.stock_counts (id, tenant_id, location_id, item_id, actual_quantity, counted_by, counted_at, created_at)
        values (v_count_id, v_tenant, v_loc, it.id, round(v_qty, v_dec),
                coalesce((select ee.user_id from workforce.shifts s join workforce.employees ee on ee.id = s.employee_id
                           where s.tenant_id = v_tenant and ee.user_id is not null and (s.starts_at at time zone v_tz)::date = d
                           order by s.id limit 1), v_mgr),
                (d + time '16:30') at time zone v_tz, (d + time '16:30') at time zone v_tz);
        v_n_counts := v_n_counts + 1;
        if it.reorder_point is not null and v_qty <= it.reorder_point and v_recv_day is null then
          if it.unit = 'L' then
            -- bought at a nearby shop the same day; the next count shows the refill
            insert into purchases.purchase_actions (id, tenant_id, location_id, item_id, snapshot_stock_count_id, actioned_by, actioned_at, created_at, action_type)
            values (pg_temp.qa4_id(v_tenant, 'buy', it.id::text || d), v_tenant, v_loc, it.id, v_count_id, v_mgr,
                    (d + time '17:00') at time zone v_tz, (d + time '17:00') at time zone v_tz, 'bought');
            v_n_purch := v_n_purch + 1;
            v_qty := it.required_quantity;
          else
            insert into purchases.purchase_actions (id, tenant_id, location_id, item_id, snapshot_stock_count_id, actioned_by, actioned_at, created_at, action_type, ordered_quantity)
            values (pg_temp.qa4_id(v_tenant, 'order', it.id::text || d), v_tenant, v_loc, it.id, v_count_id, v_mgr,
                    (d + time '17:00') at time zone v_tz, (d + time '17:00') at time zone v_tz, 'ordered',
                    round(it.required_quantity - v_qty, v_dec));
            v_n_purch := v_n_purch + 1;
            -- delivered two days later, if that is still inside the window (else it stays "ordered")
            if d + 2 <= p_to then
              v_recv_day := d + 2;
              v_recv_qty := round(it.required_quantity - v_qty, v_dec);
            end if;
          end if;
        end if;
      end if;
      d := d + 1;
    end loop;
  end loop;

  -- --- 6. mail ---------------------------------------------------------------
  for r in
    select * from (values
      (2,  '19:05', 0, 'staff',   '来週の木曜日、学校の行事で17時以降に入れません。'),
      (2,  '20:10', 0, 'manager', '了解しました。木曜は早番に変更します。'),
      (10, '12:30', 1, 'manager', '今月の交通費の申請を金曜までにお願いします。'),
      (10, '18:45', 1, 'staff',   '承知しました。本日入力しました。'),
      (17, '09:20', 0, 'staff',   '体調不良のため、今日は30分遅れて出勤します。'),
      (17, '09:35', 0, 'manager', 'お大事にしてください。無理しないでください。'),
      (25, '15:10', 2, 'manager', '新しいシフト希望の提出をお願いします（来月分）。')
    ) as v(off, hm, who_idx, role, body)
  loop
    d := p_from + r.off;
    continue when d > p_to;
    select x, y into v_emp, v_by from (
      select x, y, row_number() over (order by x) - 1 as idx
        from unnest(v_emps, v_emp_users) as u(x, y) where y is not null) z
     where z.idx = r.who_idx % greatest((select count(*) from unnest(v_emp_users) w where w is not null), 1);
    continue when v_emp is null;
    v_start := (d + r.hm::time) at time zone v_tz;
    insert into workforce.staff_messages (id, tenant_id, location_id, employee_id, sender_role, sender_user_id, body,
                                          is_read, read_at, read_by, created_at, updated_at)
    values (pg_temp.qa4_id(v_tenant, 'mail', r.off::text || r.hm), v_tenant, v_loc, v_emp, r.role,
            case when r.role = 'manager' then v_mgr else v_by end, r.body,
            true, v_start + interval '30 minutes', case when r.role = 'manager' then v_by else v_mgr end,
            v_start, v_start + interval '30 minutes');
    v_n_mail := v_n_mail + 1;
  end loop;

  return query values
    ('shifts', v_n_shifts), ('attendance', v_n_att), ('operations_instances', v_n_inst),
    ('operations_missed_on_purpose', v_n_missed), ('threshold_exceptions', v_n_thr),
    ('critical_missed_removed_in_window', v_n_del_missed), ('backlog_resolved_before_window', v_n_backlog),
    ('issues', v_n_issues), ('stock_counts', v_n_counts), ('purchase_actions', v_n_purch), ('mail', v_n_mail);
end;
$$;

select * from pg_temp.qa4_seed('oruwa-cafe', date '2026-09-21', date '2026-10-17');
