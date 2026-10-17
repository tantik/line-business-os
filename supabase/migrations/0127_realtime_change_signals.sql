-- ============================================================================
-- 0127 — Live updates by push: Realtime Broadcast "change signals"
-- ----------------------------------------------------------------------------
-- Design: docs/architecture/realtime-live-updates.md (Founder-approved
-- 2026-10-17, closes DEBT-095).
--
-- "Signal, then fetch": an AFTER trigger on each live table sends a tiny
-- private Broadcast message -- { area, location, by } only, no row data, no
-- PII -- to tenant-scoped topics. The browser then re-reads the affected data
-- through the existing RLS-checked read paths. The signal grants nothing.
--
-- Topics (all private):
--   oruwa:<tenant>:staff           -- staff-visible changes (published schedule, issues, ...)
--   oruwa:<tenant>:manager         -- everything the Manager dashboard shows
--   oruwa:<tenant>:emp:<employee>  -- one employee's own mail / requests / attendance
--
-- Join rules: core.realtime_topic_allowed(topic), used by one SELECT policy
-- on realtime.messages (Broadcast only). No INSERT policy: browsers cannot
-- send. Additive only: no existing object is changed.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Who may join a topic
-- ----------------------------------------------------------------------------
create or replace function core.realtime_topic_allowed(p_topic text)
returns boolean
language plpgsql
stable
security definer
set search_path = core, workforce, public
as $$
declare
  v_parts text[];
  v_tenant uuid;
  v_employee uuid;
  v_uuid_re constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
begin
  if p_topic is null or core.current_user_id() is null then
    return false;
  end if;
  v_parts := string_to_array(p_topic, ':');
  if v_parts[1] is distinct from 'oruwa' or v_parts[2] !~ v_uuid_re then
    return false;
  end if;
  v_tenant := v_parts[2]::uuid;

  if array_length(v_parts, 1) = 3 and v_parts[3] = 'staff' then
    return core.has_permission_in_tenant(v_tenant, 'workforce.shift.read');
  end if;

  if array_length(v_parts, 1) = 3 and v_parts[3] = 'manager' then
    return core.has_permission_in_tenant(v_tenant, 'workforce.request.manage');
  end if;

  if array_length(v_parts, 1) = 4 and v_parts[3] = 'emp' and v_parts[4] ~ v_uuid_re then
    v_employee := v_parts[4]::uuid;
    return exists (
      select 1
        from workforce.employees e
       where e.id = v_employee
         and e.tenant_id = v_tenant
         and e.user_id = core.current_user_id()
    );
  end if;

  return false;
end;
$$;

comment on function core.realtime_topic_allowed(text) is
  '0127: join rule for private Realtime Broadcast topics. oruwa:<tenant>:staff -> workforce.shift.read in the tenant; oruwa:<tenant>:manager -> workforce.request.manage in the tenant; oruwa:<tenant>:emp:<employee> -> that employee row belongs to the caller. Anything else -> false. Returns a boolean only.';

revoke all on function core.realtime_topic_allowed(text) from public;
grant execute on function core.realtime_topic_allowed(text) to authenticated;

-- realtime.messages exists on hosted Supabase and in the local stack; guarded
-- so a bare Postgres (no Realtime) still applies the rest of this migration.
do $$
begin
  if to_regclass('realtime.messages') is not null then
    execute $p$
      create policy oruwa_broadcast_receive
        on realtime.messages
        for select
        to authenticated
        using (
          realtime.messages.extension = 'broadcast'
          and core.realtime_topic_allowed((select realtime.topic()))
        )
    $p$;
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- 2. Sending a signal (trigger)
-- ----------------------------------------------------------------------------
-- TG_ARGV[0] = area (e.g. 'schedule'); TG_ARGV[1..] = audiences:
--   manager | staff | staff_published (staff only when the row is or was
--   published) | emp:<column> (that column's employee, old and new value) |
--   mail (Manager-authored -> emp:employee_id, otherwise -> manager).
-- One signal per topic+area+location per transaction; a failure to send never
-- breaks the business write.
create or replace function core.realtime_signal()
returns trigger
language plpgsql
security definer
set search_path = core, public
as $$
declare
  v_new jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  v_old jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  v_row jsonb := coalesce(v_new, v_old);
  v_area text := tg_argv[0];
  v_tenant text := v_row ->> 'tenant_id';
  v_location text := v_row ->> 'location_id';
  v_audience text;
  v_column text;
  v_topics text[] := '{}';
  v_topic text;
  v_key text;
  v_sent text;
  i int;
begin
  if v_tenant is null then
    return null;
  end if;

  for i in 1 .. tg_nargs - 1 loop
    v_audience := tg_argv[i];
    if v_audience = 'manager' then
      v_topics := v_topics || ('oruwa:' || v_tenant || ':manager');
    elsif v_audience = 'staff' then
      v_topics := v_topics || ('oruwa:' || v_tenant || ':staff');
    elsif v_audience = 'staff_published' then
      if coalesce((v_new ->> 'published')::boolean, false) or coalesce((v_old ->> 'published')::boolean, false) then
        v_topics := v_topics || ('oruwa:' || v_tenant || ':staff');
      end if;
    elsif v_audience = 'mail' then
      if v_row ->> 'sender_role' = 'manager' then
        if v_row ->> 'employee_id' is not null then
          v_topics := v_topics || ('oruwa:' || v_tenant || ':emp:' || (v_row ->> 'employee_id'));
        end if;
      else
        v_topics := v_topics || ('oruwa:' || v_tenant || ':manager');
      end if;
    elsif v_audience like 'emp:%' then
      v_column := substr(v_audience, 5);
      if v_new ->> v_column is not null then
        v_topics := v_topics || ('oruwa:' || v_tenant || ':emp:' || (v_new ->> v_column));
      end if;
      if v_old ->> v_column is not null and v_old ->> v_column is distinct from v_new ->> v_column then
        v_topics := v_topics || ('oruwa:' || v_tenant || ':emp:' || (v_old ->> v_column));
      end if;
    end if;
  end loop;

  v_sent := coalesce(current_setting('oruwa.rt_sent', true), '');
  foreach v_topic in array v_topics loop
    v_key := v_topic || '|' || v_area || '|' || coalesce(v_location, '-') || ';';
    continue when position(v_key in v_sent) > 0;
    v_sent := v_sent || v_key;
    begin
      perform realtime.send(
        jsonb_build_object('area', v_area, 'location', v_location, 'by', core.current_user_id()),
        v_area,
        v_topic,
        true
      );
    exception when others then
      -- Live updates are best-effort; the write itself must never fail here.
      null;
    end;
  end loop;
  perform set_config('oruwa.rt_sent', v_sent, true);

  return null;
end;
$$;

comment on function core.realtime_signal() is
  '0127: AFTER-trigger that sends a private Realtime Broadcast change signal ({area, location, by}; no row data) to oruwa:<tenant>:{staff|manager|emp:<id>} topics per TG_ARGV. Deduped per transaction via oruwa.rt_sent; send errors are swallowed.';

revoke all on function core.realtime_signal() from public;

-- ----------------------------------------------------------------------------
-- 3. Which tables signal what
-- ----------------------------------------------------------------------------
-- High-churn rows (each checklist tick, each check-session line) are left out
-- on purpose: they would refresh screens more often than polling did.
do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('workforce', 'shifts',             array['schedule', 'manager', 'staff_published']),
      ('workforce', 'shift_types',        array['schedule', 'manager', 'staff']),
      ('workforce', 'auto_schedule_runs', array['schedule', 'manager']),
      ('workforce', 'schedule_settings',  array['settings', 'manager']),
      ('workforce', 'employees',          array['roster', 'manager', 'staff']),
      ('workforce', 'staff_messages',     array['mail', 'mail']),
      ('workforce', 'shift_exchanges',    array['requests', 'manager', 'emp:requester_employee_id', 'emp:replacement_employee_id']),
      ('workforce', 'shift_requests',     array['requests', 'manager', 'emp:employee_id']),
      ('workforce', 'attendance',         array['attendance', 'manager', 'emp:employee_id']),
      ('workforce', 'recipes',            array['recipes', 'manager', 'staff']),
      ('workforce', 'recipe_ingredients', array['recipes', 'manager', 'staff']),
      ('workforce', 'recipe_steps',       array['recipes', 'manager', 'staff']),
      ('workforce', 'recipe_notes',       array['recipes', 'manager', 'staff']),
      ('workforce', 'recipe_categories',  array['recipes', 'manager', 'staff']),
      ('issues',    'issues',             array['issues', 'manager', 'staff']),
      ('operations','task_instances',     array['operations', 'manager', 'staff']),
      ('operations','task_exceptions',    array['operations', 'manager', 'staff']),
      ('inventory', 'items',              array['inventory', 'manager', 'staff']),
      ('inventory', 'stock_counts',       array['inventory', 'manager', 'staff']),
      ('purchases', 'purchase_actions',   array['purchases', 'manager', 'staff'])
    ) as t(schema_name, table_name, args)
  loop
    execute format(
      'create trigger oruwa_realtime_signal after insert or update or delete on %I.%I '
      'for each row execute function core.realtime_signal(%s)',
      r.schema_name,
      r.table_name,
      (select string_agg(quote_literal(a), ', ') from unnest(r.args) a)
    );
  end loop;
end;
$$;
