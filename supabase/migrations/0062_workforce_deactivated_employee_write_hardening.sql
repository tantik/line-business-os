-- ============================================================================
-- 0062  Workforce Cafe v2.1: block Staff self-service WRITES for deactivated
--       employees (defense-in-depth RLS fix)
-- ----------------------------------------------------------------------------
-- STAFF_AUTH_IDENTITY_ARCHITECTURE_AUDIT found that workforce.is_own_employee
-- (0027) -- the shared self-scope predicate used across attendance,
-- shift_requests, and shift_exchanges -- only checks
-- `e.user_id = core.current_user_id()`, never `e.is_active`. A deactivated
-- employee whose Supabase Auth session is still valid can therefore still
-- pass every *_self_insert/_self_update self-scope RLS policy, even though
-- app-layer resolvePreviewStaffContext() already refuses to resolve them.
-- Any direct PostgREST write (bypassing that app-layer check) was therefore
-- still possible. RLS is meant to be the actual security boundary here, so
-- this closes the gap at the DB layer.
--
-- Fix shape: is_own_employee itself is left untouched, and continues to gate
-- every existing SELECT/read policy unchanged -- deactivation must not hide
-- or break historical read access (past attendance, past requests, past
-- exchanges all remain exactly as readable as before). A new sibling
-- predicate, workforce.is_own_active_employee, additionally requires
-- e.is_active = true, and is substituted ONLY into the self-scope WRITE
-- policies/branches (INSERT / UPDATE with-check, and the self-actor branches
-- of workforce.guard_shift_exchange_update) identified below. This is the
-- narrower of the two options the task brief allows (centralizing inside
-- is_own_employee itself would also silently change every *_self_select read
-- policy's behavior, which the brief explicitly says must not happen).
--
-- Self-scope WRITE surfaces fixed (all of workforce's *_self_* / self-actor
-- write predicates that exist at this migration; there are no others):
--   * workforce.attendance:       wf_attendance_self_insert / _self_update
--   * workforce.shift_requests:   wf_shift_requests_self_insert
--       (there is no self UPDATE policy on shift_requests -- staff can only
--       ever insert a new pending request, never mutate an existing one, so
--       there is nothing else to fix there)
--   * workforce.shift_exchanges:  wf_shift_exchanges_request (insert),
--       wf_shift_exchanges_accept (with check), wf_shift_exchanges_cancel_own
--       (using + with check), and the self-actor accept/cancel branches of
--       workforce.guard_shift_exchange_update()
--   * api.cancel_workforce_shift_exchange: adds an explicit is_active check
--       (api.accept_workforce_shift_exchange, 0050, already joins
--       workforce.employees with `e.is_active = true` explicitly, so it is
--       already correct and is not touched here)
--
-- Not touched: workforce.inventory has no employee-self-scope predicate
-- anywhere (its Staff-reachable writes are gated purely by
-- core.has_permission, never by is_own_employee), so there is nothing to fix
-- there.
-- ============================================================================

-- --- workforce.is_own_active_employee ---------------------------------------
create or replace function workforce.is_own_active_employee(p_employee_id uuid)
returns boolean
language sql stable
set search_path = core, workforce, public
as $$
  select exists (
    select 1
    from workforce.employees e
    where e.id = p_employee_id
      and e.user_id = core.current_user_id()
      and e.is_active = true
  );
$$;

comment on function workforce.is_own_active_employee(uuid) is
  'Like workforce.is_own_employee (0027), plus e.is_active = true. Used ONLY by self-scope WRITE policies/branches (INSERT / UPDATE with-check) so a deactivated employee with an otherwise-valid session cannot perform new Staff self-service writes -- historical SELECT access continues to use plain is_own_employee, unchanged, so deactivation never hides or destroys history. Plain SECURITY INVOKER, same reasoning as is_own_employee: relies on workforce.employees'' own RLS, not on bypassing it.';

revoke all on function workforce.is_own_active_employee(uuid) from public;
grant execute on function workforce.is_own_active_employee(uuid) to authenticated;

-- --- workforce.attendance ----------------------------------------------------
drop policy if exists wf_attendance_self_insert on workforce.attendance;
create policy wf_attendance_self_insert on workforce.attendance
  for insert
  with check (workforce.is_own_active_employee(employee_id));

drop policy if exists wf_attendance_self_update on workforce.attendance;
create policy wf_attendance_self_update on workforce.attendance
  for update
  using (workforce.is_own_active_employee(employee_id))
  with check (workforce.is_own_active_employee(employee_id));

-- --- workforce.shift_requests -------------------------------------------------
drop policy if exists wf_shift_requests_self_insert on workforce.shift_requests;
create policy wf_shift_requests_self_insert on workforce.shift_requests
  for insert
  with check (
    workforce.is_own_active_employee(employee_id)
    and status = 'pending'
    and decided_by is null
  );

-- --- workforce.shift_exchanges ------------------------------------------------
drop policy if exists wf_shift_exchanges_request on workforce.shift_exchanges;
create policy wf_shift_exchanges_request on workforce.shift_exchanges
  for insert with check (
    workforce.is_own_active_employee(requester_employee_id)
    and replacement_employee_id is null
    and status = 'open'
    and length(btrim(reason)) between 1 and 500
    and exists (
      select 1 from workforce.shifts s
      where s.tenant_id = shift_exchanges.tenant_id
        and s.location_id = shift_exchanges.location_id
        and s.id = shift_exchanges.shift_id
        and s.employee_id = shift_exchanges.requester_employee_id
        and s.published = true
        and s.starts_at > clock_timestamp()
    )
    and (
      (request_kind in ('exchange', 'cancel') and requested_shift_type_id is null)
      or (
        request_kind = 'change'
        and exists (
          select 1 from workforce.shift_types st
          where st.tenant_id = shift_exchanges.tenant_id
            and st.id = shift_exchanges.requested_shift_type_id
            and st.is_active = true
            and (st.location_id is null or st.location_id = shift_exchanges.location_id)
        )
      )
    )
  );

drop policy if exists wf_shift_exchanges_accept on workforce.shift_exchanges;
create policy wf_shift_exchanges_accept on workforce.shift_exchanges
  for update
  using (
    status = 'open'
    and core.has_permission(tenant_id, 'workforce.shift.read', location_id)
  )
  with check (
    status = 'accepted'
    and replacement_employee_id is not null
    and workforce.is_own_active_employee(replacement_employee_id)
    and not workforce.is_own_employee(requester_employee_id)
  );

drop policy if exists wf_shift_exchanges_cancel_own on workforce.shift_exchanges;
create policy wf_shift_exchanges_cancel_own on workforce.shift_exchanges
  for update
  using (
    status in ('open', 'accepted')
    and workforce.is_own_active_employee(requester_employee_id)
  )
  with check (
    status = 'cancelled'
    and workforce.is_own_active_employee(requester_employee_id)
  );

-- guard_shift_exchange_update: self-actor accept/cancel branches only.
-- Manager bypass (core.has_permission branch, first) is untouched. The
-- negative `not workforce.is_own_employee(old.requester_employee_id)` checks
-- are left as plain is_own_employee -- they exist to stop the requester
-- accepting their own exchange, and whether that requester happens to be
-- deactivated does not change what they are being prevented from doing.
create or replace function workforce.guard_shift_exchange_update()
returns trigger
language plpgsql
set search_path = core, workforce, public
as $$
begin
  if core.has_permission(old.tenant_id, 'workforce.request.manage', old.location_id) then
    return new;
  end if;

  if old.request_kind = 'exchange'
     and old.status = 'open'
     and new.status = 'accepted'
     and workforce.is_own_active_employee(new.replacement_employee_id)
     and not workforce.is_own_employee(old.requester_employee_id) then
    if new.tenant_id <> old.tenant_id
       or new.location_id <> old.location_id
       or new.shift_id <> old.shift_id
       or new.requester_employee_id <> old.requester_employee_id
       or new.reason <> old.reason
       or new.request_kind <> old.request_kind
       or new.requested_shift_type_id is distinct from old.requested_shift_type_id
       or new.decided_by is distinct from old.decided_by
       or new.decided_at is distinct from old.decided_at then
      raise exception 'shift_exchange_immutable_fields' using errcode = 'P0001';
    end if;
    new.accepted_at := clock_timestamp();
    return new;
  end if;

  if old.status in ('open', 'accepted')
     and new.status = 'cancelled'
     and workforce.is_own_active_employee(old.requester_employee_id) then
    if new.tenant_id <> old.tenant_id
       or new.location_id <> old.location_id
       or new.shift_id <> old.shift_id
       or new.requester_employee_id <> old.requester_employee_id
       or new.replacement_employee_id is distinct from old.replacement_employee_id
       or new.reason <> old.reason
       or new.request_kind <> old.request_kind
       or new.requested_shift_type_id is distinct from old.requested_shift_type_id
       or new.accepted_at is distinct from old.accepted_at
       or new.decided_by is distinct from old.decided_by
       or new.decided_at is distinct from old.decided_at then
      raise exception 'shift_exchange_immutable_fields' using errcode = 'P0001';
    end if;
    return new;
  end if;

  raise exception 'shift_exchange_invalid_transition' using errcode = 'P0001';
end;
$$;

-- api.cancel_workforce_shift_exchange: add explicit is_active check (mirrors
-- api.accept_workforce_shift_exchange's existing `e.is_active = true`, 0050).
create or replace function api.cancel_workforce_shift_exchange(
  p_exchange_id uuid
)
returns text
language plpgsql
security invoker
set search_path = core, workforce, public
as $$
declare
  v_status text;
begin
  update workforce.shift_exchanges x
     set status = 'cancelled'
   where x.id = p_exchange_id
     and x.status in ('open', 'accepted')
     and workforce.is_own_active_employee(x.requester_employee_id)
  returning x.status into v_status;
  if v_status is null then
    raise exception 'shift_exchange_not_cancellable' using errcode = 'P0001';
  end if;
  return v_status;
end;
$$;
