# Multi-Tenancy Model

## Vocabulary

| Term          | Meaning                                  | Table                 |
| ------------- | ---------------------------------------- | --------------------- |
| `tenant_id`   | SaaS customer / company                  | `core.tenants`        |
| `location_id` | store / salon / branch / warehouse       | `core.locations`      |
| `module_code` | workforce / booking / logistics / crm / inventory / ai | `core.module_code` enum |

Example:

- Tenant: *Mame To Cha Tokyo* · Location: *Main Cafe* · Module: *Workforce*
- Tenant: *Mirawi Demo Salon* · Location: *Main Salon* · Module: *Booking*

## Isolation strategy

Single database, shared schema, **Row Level Security** per tenant. The source of
truth for "who can touch tenant X" is `core.tenant_memberships`.

### The golden rules

1. Every business table has `tenant_id uuid not null` referencing
   `core.tenants(id)`.
2. Physical-location data also has `location_id uuid` referencing
   `core.locations(id)`.
3. RLS policies gate every table using the helper functions in
   `supabase/migrations/0006_helpers.sql`:
   - `core.is_member_of(tenant_id)` — read access for members.
   - `core.has_permission(tenant_id, key, location_id?)` — fine-grained gates.
4. The backend **derives `tenant_id` from membership** (`resolveTenantContext`),
   never trusts a body-supplied tenant id.

## Adding a new business table (checklist)

```sql
create table mymodule.things (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  location_id uuid references core.locations(id) on delete cascade, -- if physical
  -- ...columns...
  created_at timestamptz not null default now()
);
alter table mymodule.things enable row level security;
create policy things_read on mymodule.things
  for select using (core.has_permission(tenant_id, 'mymodule.thing.read', location_id));
create policy things_write on mymodule.things
  for all using (core.has_permission(tenant_id, 'mymodule.thing.write', location_id))
  with check (core.has_permission(tenant_id, 'mymodule.thing.write', location_id));
```

Then register permissions in `core.permissions`, map them to roles, and expose
typed contracts in the module package.
