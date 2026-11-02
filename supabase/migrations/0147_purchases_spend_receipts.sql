-- ============================================================================
-- 0147: purchase receipts -- what a location spent, in yen (DEBT-136).
-- Design: docs/architecture/purchase-receipts-design-2026-11-02.md.
--
-- WHY: purchases record what/how much/when/who (0089, 0120, 0137) but no money,
-- so no report can show what a location spent. Founder 2026-11-01: add a
-- receipt (photo + total in JPY) linked to bought/received purchases, and a
-- monthly spend view; no unit price, no supplier, no OCR, no approval.
--
-- NAMING: "receipt" in existing code means goods received (api.record_purchase_
-- receipt, 入荷). The paper receipt (レシート) is a SPEND receipt here.
--
-- WHAT:
--   purchases.receipt_settings      per location: receipts on/off, photo off/optional/required
--   purchases.spend_receipts        one paper receipt: date, amount_jpy (optional), category,
--                                   note, photo path, active|canceled (never deleted)
--   purchases.spend_receipt_items   receipt -> bought/received purchase actions (one action
--                                   belongs to at most one receipt)
--   permission purchases.receipt.manage (owner, admin, manager): every receipt + spend of
--                                   the location, edit after the day, settings
--   bucket purchase-receipts        private; path <tenant>/<location>/<uploader user>/<uuid>.<ext>
--   api.spend_receipts / api.spend_receipt_settings (views), api.create_spend_receipt,
--   api.update_spend_receipt, api.cancel_spend_receipt, api.set_spend_receipt_settings
--
-- RULES (Founder 2026-11-01, DEBT-136; amount rule 2026-11-02):
--   visibility  the buyer sees their own receipts (amount + photo); purchases.receipt.manage
--               sees every receipt of the location; other staff see none.
--   amount      one JPY integer as printed (tax included), optional -- but a receipt needs an
--               amount or a photo (a Manager may add the amount later; the spend view marks
--               receipts without one).
--   no items    allowed with a category and a note.
--   editing     the buyer until the end of the location-local day the receipt was created;
--               afterwards only purchases.receipt.manage. Cancel needs a reason, keeps the row.
--   audit       every create / update / cancel / settings change -> audit.audit_logs.
--   photo       per location setting: off | optional (default) | required.
--
-- SECURITY MODEL: tables are read through RLS (select only for authenticated); every write
-- goes through a SECURITY DEFINER function in the purchases schema with explicit checks
-- (module, permission at the location, settings, edit window, own actions, path prefix); the
-- api.* functions are SECURITY INVOKER passthroughs (ADR 0008, same shape as
-- api.permanently_delete_inventory_item, 0085). anon gets nothing.
-- ============================================================================

-- ---- permission ------------------------------------------------------------------------
insert into core.permissions (key, module, description) values
  ('purchases.receipt.manage', 'purchases',
   'See every purchase receipt and the spend of a location, edit receipts after their day, change receipt settings')
on conflict (key) do update set description = excluded.description, module = excluded.module;

insert into core.role_permissions (role_id, permission_key) values
  ('00000000-0000-0000-0000-000000000003', 'purchases.receipt.manage'),  -- tenant_owner
  ('00000000-0000-0000-0000-000000000004', 'purchases.receipt.manage'),  -- tenant_admin
  ('00000000-0000-0000-0000-000000000005', 'purchases.receipt.manage')   -- manager
on conflict do nothing;

-- ---- tables --------------------------------------------------------------------------------
create table purchases.receipt_settings (
  tenant_id         uuid not null references core.tenants(id) on delete cascade,
  location_id       uuid not null,
  receipts_enabled  boolean not null default true,
  photo_mode        text not null default 'optional' check (photo_mode in ('off', 'optional', 'required')),
  updated_by        uuid references core.users(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  primary key (tenant_id, location_id),
  foreign key (tenant_id, location_id) references core.locations(tenant_id, id) on delete cascade
);
comment on table purchases.receipt_settings is
  '0147 (DEBT-136): per-location receipt settings. No row = receipts on, photo optional.';

create table purchases.spend_receipts (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references core.tenants(id) on delete cascade,
  location_id    uuid not null,
  purchased_on   date not null,
  amount_jpy     integer check (amount_jpy is null or amount_jpy between 1 and 100000000),
  category       text check (category is null or category in ('food', 'supplies', 'equipment', 'other')),
  note           text check (note is null or char_length(note) between 1 and 200),
  media_path     text check (media_path is null or char_length(media_path) <= 300),
  status         text not null default 'active' check (status in ('active', 'canceled')),
  cancel_reason  text check (cancel_reason is null or char_length(cancel_reason) between 1 and 200),
  created_by     uuid not null references core.users(id),
  created_on     date not null,
  created_at     timestamptz not null default now(),
  updated_by     uuid references core.users(id),
  updated_at     timestamptz not null default now(),
  canceled_by    uuid references core.users(id),
  canceled_at    timestamptz,
  -- idempotency key from the client form: a double submit returns the same receipt
  client_request_id uuid not null,
  constraint spend_receipts_client_request_key unique (tenant_id, created_by, client_request_id),
  constraint spend_receipts_amount_or_photo check (amount_jpy is not null or media_path is not null),
  constraint spend_receipts_cancel_shape check (
    (status = 'active' and cancel_reason is null and canceled_by is null and canceled_at is null)
    or (status = 'canceled' and cancel_reason is not null and canceled_by is not null and canceled_at is not null)),
  unique (tenant_id, id),
  foreign key (tenant_id, location_id) references core.locations(tenant_id, id) on delete cascade
);
create index spend_receipts_location_date_idx on purchases.spend_receipts (tenant_id, location_id, purchased_on desc);
create index spend_receipts_creator_idx on purchases.spend_receipts (tenant_id, created_by, purchased_on desc);
comment on table purchases.spend_receipts is
  '0147 (DEBT-136): a paper receipt (レシート) of a purchase: date, total in JPY as printed (optional; amount or photo required), category/note (required when no item is linked), private photo. created_on = location-local day of creation (the buyer''s edit window). Never deleted: status canceled + reason.';

create table purchases.spend_receipt_items (
  tenant_id   uuid not null,
  receipt_id  uuid not null,
  action_id   uuid not null unique references purchases.purchase_actions(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (receipt_id, action_id),
  foreign key (tenant_id, receipt_id) references purchases.spend_receipts(tenant_id, id) on delete cascade
);
comment on table purchases.spend_receipt_items is
  '0147 (DEBT-136): receipt -> bought/received purchase actions of the same location. One action belongs to at most one receipt.';

-- ---- RLS (reads only; writes go through the functions below) ----------------------------
alter table purchases.receipt_settings enable row level security;
alter table purchases.spend_receipts enable row level security;
alter table purchases.spend_receipt_items enable row level security;

create policy receipt_settings_select on purchases.receipt_settings for select to authenticated
using (
  core.has_module_access(tenant_id, 'purchases')
  and (core.has_permission(tenant_id, 'purchases.item.read', location_id)
       or core.has_permission(tenant_id, 'purchases.receipt.manage', location_id))
);

create policy spend_receipts_select on purchases.spend_receipts for select to authenticated
using (
  core.has_module_access(tenant_id, 'purchases')
  and (core.has_permission(tenant_id, 'purchases.receipt.manage', location_id)
       or (created_by = core.current_user_id()
           and core.has_permission(tenant_id, 'purchases.action.write', location_id)))
);

create policy spend_receipt_items_select on purchases.spend_receipt_items for select to authenticated
using (exists (select 1 from purchases.spend_receipts r where r.tenant_id = spend_receipt_items.tenant_id and r.id = spend_receipt_items.receipt_id));

grant select on purchases.receipt_settings, purchases.spend_receipts, purchases.spend_receipt_items to authenticated;

-- ---- helpers --------------------------------------------------------------------------------
-- location-local "today" of a location of the tenant (null when it does not exist)
create or replace function purchases.location_today(p_tenant_id uuid, p_location_id uuid)
returns date
language sql
stable
security definer
set search_path = core, public
as $$
  select (now() at time zone l.timezone)::date
    from core.locations l
   where l.tenant_id = p_tenant_id and l.id = p_location_id;
$$;
revoke all on function purchases.location_today(uuid, uuid) from public;

-- validates one receipt payload; raises on bad input. p_old is the receipt being edited
-- (null on create). On create every rule applies. On edit (review 2026-11-02) only what
-- changes is checked, so a Manager can still complete an old receipt (add the amount later,
-- Founder 2026-11-02) after the date window, a settings change or receipts being switched off:
--   date        checked only when it changes
--   photo mode  a NEW photo needs mode <> off; removing a photo is refused when mode = required
--   items       ownership / "not on another receipt" checked only for newly added actions
create or replace function purchases.check_spend_receipt_input(
  p_tenant_id uuid, p_location_id uuid, p_old purchases.spend_receipts, p_is_manager boolean,
  p_purchased_on date, p_amount_jpy integer, p_category text, p_note text, p_media_path text,
  p_action_ids uuid[]
)
returns void
language plpgsql
stable
security definer
set search_path = purchases, core, storage, public
as $$
declare
  v_today       date := purchases.location_today(p_tenant_id, p_location_id);
  v_is_edit     boolean := p_old.id is not null;
  v_enabled     boolean;
  v_photo_mode  text;
  v_new_photo   boolean := p_media_path is not null and p_media_path is distinct from p_old.media_path;
  v_bad         int;
begin
  -- the location must belong to the tenant (a tenant-wide role would otherwise pass
  -- has_permission for any location id)
  if v_today is null then
    raise exception 'invalid_argument: location' using errcode = '22023';
  end if;
  select coalesce(s.receipts_enabled, true), coalesce(s.photo_mode, 'optional')
    into v_enabled, v_photo_mode
    from (select 1) one
    left join purchases.receipt_settings s on s.tenant_id = p_tenant_id and s.location_id = p_location_id;
  -- receipts off: no new receipts; only a manage holder still corrects existing ones
  if not v_enabled and (not v_is_edit or not p_is_manager) then
    raise exception 'receipts_disabled' using errcode = 'P0010';
  end if;
  if p_media_path is null and v_photo_mode = 'required' and (not v_is_edit or p_old.media_path is not null) then
    raise exception 'receipt_photo_required' using errcode = 'P0011';
  end if;
  if v_new_photo and v_photo_mode = 'off' then
    raise exception 'receipt_photo_off' using errcode = 'P0011';
  end if;
  if v_new_photo then
    if p_media_path !~ ('^' || p_tenant_id || '/' || p_location_id
         || '/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$') then
      raise exception 'invalid_argument: media_path' using errcode = '22023';
    end if;
    -- a new photo is always the caller's own upload (checked before existence, so another
    -- user's folder never reveals whether a file exists)
    if split_part(p_media_path, '/', 3) <> core.current_user_id()::text then
      raise exception 'invalid_argument: media_path' using errcode = '22023';
    end if;
    -- the photo must really be uploaded (else "amount or photo" could be met by a fake path)
    if not exists (select 1 from storage.objects o where o.bucket_id = 'purchase-receipts' and o.name = p_media_path) then
      raise exception 'invalid_argument: media_path not uploaded' using errcode = '22023';
    end if;
  end if;
  if p_amount_jpy is not null and (p_amount_jpy < 1 or p_amount_jpy > 100000000) then
    raise exception 'invalid_argument: amount_jpy' using errcode = '22023';
  end if;
  if p_category is not null and p_category not in ('food', 'supplies', 'equipment', 'other') then
    raise exception 'invalid_argument: category' using errcode = '22023';
  end if;
  if p_note is not null and char_length(p_note) > 200 then
    raise exception 'invalid_argument: note' using errcode = '22023';
  end if;
  if p_amount_jpy is null and p_media_path is null then
    raise exception 'receipt_amount_or_photo_required' using errcode = '22023';
  end if;
  if p_purchased_on is null
     or ((not v_is_edit or p_purchased_on is distinct from p_old.purchased_on)
         and (p_purchased_on > v_today or p_purchased_on < v_today - 90)) then
    raise exception 'invalid_argument: purchased_on' using errcode = '22023';
  end if;
  if coalesce(cardinality(p_action_ids), 0) = 0 and (p_category is null or p_note is null) then
    raise exception 'receipt_category_and_note_required' using errcode = '22023';
  end if;
  if coalesce(cardinality(p_action_ids), 0) > 50 then
    raise exception 'invalid_argument: too many items' using errcode = '22023';
  end if;

  -- every NEWLY linked action: this tenant + location, bought/received, the caller's own
  -- (unless manager), not on another receipt. Actions already on this receipt stay valid.
  select count(*) into v_bad
    from unnest(coalesce(p_action_ids, '{}')) as x(action_id)
    left join purchases.purchase_actions a on a.id = x.action_id
   where not (v_is_edit and exists (select 1 from purchases.spend_receipt_items k
                                     where k.receipt_id = p_old.id and k.action_id = x.action_id))
     and (a.id is null
          or a.tenant_id <> p_tenant_id
          or a.location_id <> p_location_id
          or a.action_type not in ('bought', 'received')
          or (not p_is_manager and a.actioned_by is distinct from core.current_user_id())
          or exists (select 1 from purchases.spend_receipt_items i where i.action_id = x.action_id));
  if v_bad > 0 then
    raise exception 'receipt_item_not_allowed' using errcode = '42501';
  end if;
end;
$$;
revoke all on function purchases.check_spend_receipt_input(uuid, uuid, purchases.spend_receipts, boolean, date, integer, text, text, text, uuid[]) from public;

create or replace function purchases.spend_receipt_audit_row(r purchases.spend_receipts)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object('purchased_on', r.purchased_on, 'amount_jpy', r.amount_jpy, 'category', r.category,
    'note', r.note, 'has_photo', r.media_path is not null, 'status', r.status, 'cancel_reason', r.cancel_reason);
$$;

-- ---- writes -------------------------------------------------------------------------------
create or replace function purchases.create_spend_receipt(
  p_tenant_id uuid, p_location_id uuid, p_purchased_on date, p_amount_jpy integer,
  p_category text, p_note text, p_media_path text, p_action_ids uuid[], p_client_request_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = purchases, core, audit, public
as $$
declare
  v_user     uuid := core.current_user_id();
  v_manager  boolean;
  v_row      purchases.spend_receipts;
  v_existing uuid;
  v_ids      uuid[] := array(select distinct x from unnest(coalesce(p_action_ids, '{}')) x);
begin
  if v_user is null or not core.has_module_access(p_tenant_id, 'purchases') then
    raise exception 'purchases_module_disabled' using errcode = 'P0004';
  end if;
  v_manager := core.has_permission(p_tenant_id, 'purchases.receipt.manage', p_location_id);
  if not (v_manager or core.has_permission(p_tenant_id, 'purchases.action.write', p_location_id)) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  if p_client_request_id is null then
    raise exception 'invalid_argument: client_request_id' using errcode = '22023';
  end if;
  -- double submit of the same form: return the receipt the first submit created
  perform pg_advisory_xact_lock(hashtextextended(v_user::text || p_client_request_id::text, 0));
  select s.id into v_existing from purchases.spend_receipts s
   where s.tenant_id = p_tenant_id and s.created_by = v_user and s.client_request_id = p_client_request_id;
  if v_existing is not null then
    return v_existing;
  end if;
  perform purchases.check_spend_receipt_input(p_tenant_id, p_location_id, null::purchases.spend_receipts, v_manager,
    p_purchased_on, p_amount_jpy, nullif(btrim(p_category), ''), nullif(btrim(p_note), ''), p_media_path, v_ids);

  insert into purchases.spend_receipts (tenant_id, location_id, purchased_on, amount_jpy, category, note,
                                        media_path, created_by, created_on, client_request_id)
  values (p_tenant_id, p_location_id, p_purchased_on, p_amount_jpy, nullif(btrim(p_category), ''),
          nullif(btrim(p_note), ''), p_media_path, v_user, purchases.location_today(p_tenant_id, p_location_id),
          p_client_request_id)
  returning * into v_row;

  insert into purchases.spend_receipt_items (tenant_id, receipt_id, action_id)
  select p_tenant_id, v_row.id, x from unnest(v_ids) x;

  insert into audit.audit_logs (tenant_id, actor_id, actor_kind, module, entity, entity_id, action, before, after, metadata)
  values (p_tenant_id, v_user, 'user', 'purchases', 'spend_receipt', v_row.id::text, 'create', null,
          purchases.spend_receipt_audit_row(v_row),
          jsonb_build_object('location_id', p_location_id, 'action_ids', to_jsonb(v_ids)));
  return v_row.id;
end;
$$;

-- who may change an existing receipt: manage holder at its location, or its creator (still
-- holding action.write) on the location-local day it was created
create or replace function purchases.lock_editable_spend_receipt(p_tenant_id uuid, p_receipt_id uuid)
returns purchases.spend_receipts
language plpgsql
security definer
set search_path = purchases, core, public
as $$
declare
  r           purchases.spend_receipts;
  is_manager  boolean;
begin
  if core.current_user_id() is null then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  -- rights first (no row lock for a caller who may not edit), then lock and re-read
  select * into r from purchases.spend_receipts s where s.tenant_id = p_tenant_id and s.id = p_receipt_id;
  if r.id is null or not core.has_module_access(p_tenant_id, 'purchases')
     or not (core.has_permission(p_tenant_id, 'purchases.receipt.manage', r.location_id)
             or (r.created_by = core.current_user_id()
                 and core.has_permission(p_tenant_id, 'purchases.action.write', r.location_id))) then
    raise exception 'receipt_not_found' using errcode = 'P0002';
  end if;
  select * into r from purchases.spend_receipts s where s.id = p_receipt_id for update;
  is_manager := core.has_permission(p_tenant_id, 'purchases.receipt.manage', r.location_id);
  if not is_manager then
    if r.created_by <> core.current_user_id()
       or not core.has_permission(p_tenant_id, 'purchases.action.write', r.location_id) then
      raise exception 'receipt_not_found' using errcode = 'P0002';
    end if;
    if r.created_on <> purchases.location_today(p_tenant_id, r.location_id) then
      raise exception 'receipt_edit_window_closed' using errcode = 'P0012';
    end if;
  end if;
  if r.status <> 'active' then
    raise exception 'receipt_canceled' using errcode = 'P0013';
  end if;
  return r;
end;
$$;
revoke all on function purchases.lock_editable_spend_receipt(uuid, uuid) from public;

create or replace function purchases.update_spend_receipt(
  p_tenant_id uuid, p_receipt_id uuid, p_purchased_on date, p_amount_jpy integer,
  p_category text, p_note text, p_media_path text, p_action_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = purchases, core, audit, public
as $$
declare
  v_old      purchases.spend_receipts;
  v_manager  boolean;
  v_new      purchases.spend_receipts;
  v_ids      uuid[] := array(select distinct x from unnest(coalesce(p_action_ids, '{}')) x);
  v_old_ids  uuid[];
begin
  v_old := purchases.lock_editable_spend_receipt(p_tenant_id, p_receipt_id);
  v_manager := core.has_permission(p_tenant_id, 'purchases.receipt.manage', v_old.location_id);
  perform purchases.check_spend_receipt_input(p_tenant_id, v_old.location_id, v_old, v_manager,
    p_purchased_on, p_amount_jpy, nullif(btrim(p_category), ''), nullif(btrim(p_note), ''), p_media_path, v_ids);

  select array_agg(i.action_id order by i.action_id) into v_old_ids
    from purchases.spend_receipt_items i where i.receipt_id = v_old.id;

  update purchases.spend_receipts s
     set purchased_on = p_purchased_on, amount_jpy = p_amount_jpy, category = nullif(btrim(p_category), ''),
         note = nullif(btrim(p_note), ''), media_path = p_media_path,
         updated_by = core.current_user_id(), updated_at = now()
   where s.id = v_old.id
  returning * into v_new;

  delete from purchases.spend_receipt_items i where i.receipt_id = v_old.id and not (i.action_id = any (v_ids));
  insert into purchases.spend_receipt_items (tenant_id, receipt_id, action_id)
  select p_tenant_id, v_old.id, x from unnest(v_ids) x
  on conflict (receipt_id, action_id) do nothing;

  insert into audit.audit_logs (tenant_id, actor_id, actor_kind, module, entity, entity_id, action, before, after, metadata)
  values (p_tenant_id, core.current_user_id(), 'user', 'purchases', 'spend_receipt', v_old.id::text, 'update',
          purchases.spend_receipt_audit_row(v_old) || jsonb_build_object('action_ids', to_jsonb(coalesce(v_old_ids, '{}'))),
          purchases.spend_receipt_audit_row(v_new) || jsonb_build_object('action_ids', to_jsonb(v_ids)),
          jsonb_build_object('location_id', v_old.location_id, 'by_manager', v_manager));
end;
$$;

create or replace function purchases.cancel_spend_receipt(p_tenant_id uuid, p_receipt_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = purchases, core, audit, public
as $$
declare
  v_old      purchases.spend_receipts;
  v_manager  boolean;
  v_new      purchases.spend_receipts;
  v_freed    uuid[];
begin
  if p_reason is null or char_length(btrim(p_reason)) not between 1 and 200 then
    raise exception 'invalid_argument: reason' using errcode = '22023';
  end if;
  v_old := purchases.lock_editable_spend_receipt(p_tenant_id, p_receipt_id);
  v_manager := core.has_permission(p_tenant_id, 'purchases.receipt.manage', v_old.location_id);

  update purchases.spend_receipts s
     set status = 'canceled', cancel_reason = btrim(p_reason), canceled_by = core.current_user_id(),
         canceled_at = now(), updated_by = core.current_user_id(), updated_at = now()
   where s.id = v_old.id
  returning * into v_new;

  -- the purchases are free to be put on another receipt again (kept in the audit row)
  with freed as (delete from purchases.spend_receipt_items i where i.receipt_id = v_old.id returning i.action_id)
  select coalesce(array_agg(action_id order by action_id), '{}') into v_freed from freed;

  insert into audit.audit_logs (tenant_id, actor_id, actor_kind, module, entity, entity_id, action, before, after, metadata)
  values (p_tenant_id, core.current_user_id(), 'user', 'purchases', 'spend_receipt', v_old.id::text, 'cancel',
          purchases.spend_receipt_audit_row(v_old) || jsonb_build_object('action_ids', to_jsonb(v_freed)),
          purchases.spend_receipt_audit_row(v_new),
          jsonb_build_object('location_id', v_old.location_id, 'by_manager', v_manager));
end;
$$;

create or replace function purchases.set_spend_receipt_settings(
  p_tenant_id uuid, p_location_id uuid, p_receipts_enabled boolean, p_photo_mode text
)
returns void
language plpgsql
security definer
set search_path = purchases, core, audit, public
as $$
declare
  v_before jsonb;
begin
  if core.current_user_id() is null or not core.has_module_access(p_tenant_id, 'purchases') then
    raise exception 'purchases_module_disabled' using errcode = 'P0004';
  end if;
  if not core.has_permission(p_tenant_id, 'purchases.receipt.manage', p_location_id) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  if purchases.location_today(p_tenant_id, p_location_id) is null then
    raise exception 'invalid_argument: location' using errcode = '22023';
  end if;
  if p_receipts_enabled is null or p_photo_mode is null or p_photo_mode not in ('off', 'optional', 'required') then
    raise exception 'invalid_argument: settings' using errcode = '22023';
  end if;
  select jsonb_build_object('receipts_enabled', s.receipts_enabled, 'photo_mode', s.photo_mode) into v_before
    from purchases.receipt_settings s where s.tenant_id = p_tenant_id and s.location_id = p_location_id;

  insert into purchases.receipt_settings (tenant_id, location_id, receipts_enabled, photo_mode, updated_by)
  values (p_tenant_id, p_location_id, p_receipts_enabled, p_photo_mode, core.current_user_id())
  on conflict (tenant_id, location_id) do update
    set receipts_enabled = excluded.receipts_enabled, photo_mode = excluded.photo_mode,
        updated_by = excluded.updated_by, updated_at = now();

  insert into audit.audit_logs (tenant_id, actor_id, actor_kind, module, entity, entity_id, action, before, after, metadata)
  values (p_tenant_id, core.current_user_id(), 'user', 'purchases', 'spend_receipt_settings', p_location_id::text, 'update',
          coalesce(v_before, jsonb_build_object('receipts_enabled', true, 'photo_mode', 'optional')),
          jsonb_build_object('receipts_enabled', p_receipts_enabled, 'photo_mode', p_photo_mode),
          jsonb_build_object('location_id', p_location_id));
end;
$$;

revoke all on function purchases.create_spend_receipt(uuid, uuid, date, integer, text, text, text, uuid[], uuid) from public;
revoke all on function purchases.update_spend_receipt(uuid, uuid, date, integer, text, text, text, uuid[]) from public;
revoke all on function purchases.cancel_spend_receipt(uuid, uuid, text) from public;
revoke all on function purchases.set_spend_receipt_settings(uuid, uuid, boolean, text) from public;
grant execute on function purchases.create_spend_receipt(uuid, uuid, date, integer, text, text, text, uuid[], uuid) to authenticated;
grant execute on function purchases.update_spend_receipt(uuid, uuid, date, integer, text, text, text, uuid[]) to authenticated;
grant execute on function purchases.cancel_spend_receipt(uuid, uuid, text) to authenticated;
grant execute on function purchases.set_spend_receipt_settings(uuid, uuid, boolean, text) to authenticated;

-- ---- api facade (invoker passthroughs + views) --------------------------------------------------
create or replace function api.create_spend_receipt(
  p_tenant_id uuid, p_location_id uuid, p_purchased_on date, p_amount_jpy integer,
  p_category text, p_note text, p_media_path text, p_action_ids uuid[], p_client_request_id uuid
)
returns uuid language sql security invoker set search_path = api, purchases, public as $$
  select purchases.create_spend_receipt(p_tenant_id, p_location_id, p_purchased_on, p_amount_jpy, p_category, p_note, p_media_path, p_action_ids, p_client_request_id);
$$;
create or replace function api.update_spend_receipt(
  p_tenant_id uuid, p_receipt_id uuid, p_purchased_on date, p_amount_jpy integer,
  p_category text, p_note text, p_media_path text, p_action_ids uuid[]
)
returns void language sql security invoker set search_path = api, purchases, public as $$
  select purchases.update_spend_receipt(p_tenant_id, p_receipt_id, p_purchased_on, p_amount_jpy, p_category, p_note, p_media_path, p_action_ids);
$$;
create or replace function api.cancel_spend_receipt(p_tenant_id uuid, p_receipt_id uuid, p_reason text)
returns void language sql security invoker set search_path = api, purchases, public as $$
  select purchases.cancel_spend_receipt(p_tenant_id, p_receipt_id, p_reason);
$$;
create or replace function api.set_spend_receipt_settings(p_tenant_id uuid, p_location_id uuid, p_receipts_enabled boolean, p_photo_mode text)
returns void language sql security invoker set search_path = api, purchases, public as $$
  select purchases.set_spend_receipt_settings(p_tenant_id, p_location_id, p_receipts_enabled, p_photo_mode);
$$;

revoke all on function api.create_spend_receipt(uuid, uuid, date, integer, text, text, text, uuid[], uuid) from public, anon;
revoke all on function api.update_spend_receipt(uuid, uuid, date, integer, text, text, text, uuid[]) from public, anon;
revoke all on function api.cancel_spend_receipt(uuid, uuid, text) from public, anon;
revoke all on function api.set_spend_receipt_settings(uuid, uuid, boolean, text) from public, anon;
grant execute on function api.create_spend_receipt(uuid, uuid, date, integer, text, text, text, uuid[], uuid) to authenticated;
grant execute on function api.update_spend_receipt(uuid, uuid, date, integer, text, text, text, uuid[]) to authenticated;
grant execute on function api.cancel_spend_receipt(uuid, uuid, text) to authenticated;
grant execute on function api.set_spend_receipt_settings(uuid, uuid, boolean, text) to authenticated;

-- receipts the caller may see (RLS of purchases.spend_receipts), with linked actions and the
-- creator's employee id (for the name; null when the creator has no employee row, DEBT-132)
create or replace view api.spend_receipts with (security_invoker = true) as
select
  r.id as receipt_id, r.tenant_id, r.location_id, r.purchased_on, r.amount_jpy, r.category, r.note,
  r.media_path, r.status, r.cancel_reason, r.created_by, r.created_on, r.created_at, r.updated_by,
  r.updated_at, r.canceled_by, r.canceled_at,
  (r.created_by = core.current_user_id()) as is_mine,
  (select e.id from workforce.employees e
    where e.tenant_id = r.tenant_id and e.user_id = r.created_by
    order by e.is_active desc, e.created_at limit 1) as created_by_employee_id,
  -- left joins: a link row never disappears from the list because the caller cannot read the
  -- action or item (the UI must not drop it on save); unreadable parts come back as nulls
  coalesce((select jsonb_agg(jsonb_build_object('action_id', i.action_id, 'item_id', a.item_id, 'item_name', it.name,
                 'action_type', a.action_type, 'actioned_at', a.actioned_at) order by a.actioned_at, i.action_id)
              from purchases.spend_receipt_items i
              left join purchases.purchase_actions a on a.id = i.action_id
              left join inventory.items it on it.tenant_id = a.tenant_id and it.id = a.item_id
             where i.receipt_id = r.id), '[]'::jsonb) as items
from purchases.spend_receipts r;

create or replace view api.spend_receipt_settings with (security_invoker = true) as
select s.tenant_id, s.location_id, s.receipts_enabled, s.photo_mode, s.updated_at
from purchases.receipt_settings s;

revoke all on api.spend_receipts, api.spend_receipt_settings from public, anon;
grant select on api.spend_receipts, api.spend_receipt_settings to authenticated;

-- ---- storage --------------------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('purchase-receipts', 'purchase-receipts', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- path <tenant>/<location>/<uploader user id>/<uuid>.<ext>: the uploader reads and replaces
-- their own photos; purchases.receipt.manage at the location reads every photo there
create policy purchase_receipts_select on storage.objects for select to authenticated
using (
  bucket_id = 'purchase-receipts'
  and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$'
  and core.has_module_access((storage.foldername(name))[1]::uuid, 'purchases')
  and (core.has_permission((storage.foldername(name))[1]::uuid, 'purchases.receipt.manage', (storage.foldername(name))[2]::uuid)
       or ((storage.foldername(name))[3] = core.current_user_id()::text
           and core.has_permission((storage.foldername(name))[1]::uuid, 'purchases.action.write', (storage.foldername(name))[2]::uuid)))
);

create policy purchase_receipts_insert on storage.objects for insert to authenticated
with check (
  bucket_id = 'purchase-receipts'
  and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$'
  and (storage.foldername(name))[3] = core.current_user_id()::text
  and core.has_module_access((storage.foldername(name))[1]::uuid, 'purchases')
  and (core.has_permission((storage.foldername(name))[1]::uuid, 'purchases.action.write', (storage.foldername(name))[2]::uuid)
       or core.has_permission((storage.foldername(name))[1]::uuid, 'purchases.receipt.manage', (storage.foldername(name))[2]::uuid))
  -- the location must be one of the tenant's (a tenant-wide role passes has_permission for any id)
  and purchases.location_today((storage.foldername(name))[1]::uuid, (storage.foldername(name))[2]::uuid) is not null
);
-- the insert policy runs as the caller: allow it to evaluate the location check
grant execute on function purchases.location_today(uuid, uuid) to authenticated;
-- Accepted (review 2026-11-02): no delete policy -- an abandoned upload stays until the tenant
-- is purged (the purge lists every object under the tenant prefix); a receipt can only point
-- at an uploaded object (check_spend_receipt_input).

-- ROLLBACK (manual; revert the app first):
--   drop view api.spend_receipts, api.spend_receipt_settings;
--   drop function api.create_spend_receipt(...), api.update_spend_receipt(...), api.cancel_spend_receipt(...),
--     api.set_spend_receipt_settings(...) and the purchases.* functions above;
--   drop policy purchase_receipts_select / purchase_receipts_insert on storage.objects;
--   drop table purchases.spend_receipt_items, purchases.spend_receipts, purchases.receipt_settings;
--   delete from core.role_permissions / core.permissions where permission_key/key = 'purchases.receipt.manage';
--   (bucket purchase-receipts: empty it with the Storage API, then delete it)
