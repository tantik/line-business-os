-- ============================================================================
-- 0004  LINE registry: channels & accounts
-- ----------------------------------------------------------------------------
-- Maps tenants to their LINE Official Account channels, and links platform
-- users to their LINE user ids (PII-protected).
-- ============================================================================

create table if not exists core.line_channels (
  id                      uuid primary key default gen_random_uuid(),
  tenant_id               uuid not null references core.tenants(id) on delete cascade,
  location_id             uuid references core.locations(id) on delete set null,
  channel_id              text not null,            -- LINE channel id
  -- Secrets are encrypted at the app layer before insert; never plaintext.
  channel_secret_encrypted     bytea,
  channel_access_token_encrypted bytea,
  liff_id                 text,
  is_active               boolean not null default true,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (tenant_id, channel_id)
);
create index if not exists line_channels_tenant_idx on core.line_channels(tenant_id);
comment on table core.line_channels is 'Per-tenant LINE OA channel config (secrets encrypted at app layer).';

create table if not exists core.line_accounts (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references core.tenants(id) on delete cascade,
  user_id         uuid references core.users(id) on delete set null,
  -- LINE user id is PII: store encrypted + blind-index hash for lookup.
  line_user_id_encrypted bytea not null,
  line_user_id_hash      text not null,
  display_name    text,
  linked_at       timestamptz not null default now(),
  unique (tenant_id, line_user_id_hash)
);
create index if not exists line_accounts_tenant_idx on core.line_accounts(tenant_id);
create index if not exists line_accounts_hash_idx on core.line_accounts(line_user_id_hash);
comment on table core.line_accounts is 'Links tenant users to LINE user ids (PII-protected).';
