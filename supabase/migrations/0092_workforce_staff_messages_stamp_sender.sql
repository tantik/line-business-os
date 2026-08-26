-- ============================================================================
-- 0092  Workforce: stamp staff_messages.sender_user_id on INSERT
-- ----------------------------------------------------------------------------
-- Real bug found via live chrome-devtools MCP QA on PR #444's Preview
-- (2026-08-25, after 0090/0091 were pushed to Cloud dev): sending a message
-- always failed ("new row violates row-level security policy") because
-- `sender_user_id` is `not null` but nothing ever set it -- the app-layer
-- insert (`sendStaffMessage`/`sendManagerMessage` in staff-messages.ts)
-- never included it, and 0090 only added a stamping trigger for
-- `read_at`/`read_by` (on UPDATE), not one for `sender_user_id` (on
-- INSERT). The `wf_staff_messages_self_insert`/`wf_staff_messages_manage_insert`
-- policies' `with check (... and sender_user_id = core.current_user_id() ...)`
-- predicate was therefore never satisfiable: a NULL `sender_user_id` compared
-- against `core.current_user_id()` is NULL, not true, so every insert was
-- rejected by RLS regardless of who the real caller was.
--
-- Fixed the same way 0090 already stamps read_at/read_by: a BEFORE INSERT
-- trigger that fills `sender_user_id` with the caller's own id ONLY when
-- the column was left NULL (the real app-layer path, which never supplies
-- it) -- a COALESCE, not an unconditional overwrite. An explicit,
-- non-NULL value (a raw fixture/seed insert running as the table owner,
-- which bypasses RLS entirely and has no `core.current_user_id()` session
-- context to stamp from) passes through untouched. A forged non-NULL value
-- from a genuine `authenticated`-role caller is NOT silently corrected --
-- it is REJECTED by the existing RLS `with check
-- (sender_user_id = core.current_user_id())` predicate, same as any other
-- mismatched column on that path (sender_role, employee_id, etc.) --
-- rejecting bad input is preferable to silently laundering it.
-- ============================================================================

create or replace function workforce.stamp_staff_message_sender()
returns trigger
language plpgsql
as $$
begin
  if new.sender_user_id is null then
    new.sender_user_id := core.current_user_id();
  end if;
  return new;
end;
$$;

comment on function workforce.stamp_staff_message_sender() is
  'BEFORE INSERT trigger: fills sender_user_id with the calling user ONLY when left NULL (COALESCE, not an unconditional overwrite) -- fixes a bug where sender_user_id was left NULL by every real app-layer insert (0090 only stamped read_at/read_by on UPDATE), making the self_insert/manage_insert RLS with-check predicate `sender_user_id = core.current_user_id()` unsatisfiable. An explicit non-NULL value (fixture/seed inserts bypassing RLS) passes through untouched; a forged non-NULL value from an authenticated caller is rejected by RLS, not silently corrected.';

create trigger stamp_staff_message_sender
  before insert on workforce.staff_messages
  for each row execute function workforce.stamp_staff_message_sender();
