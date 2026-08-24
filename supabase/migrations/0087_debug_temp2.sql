-- TEMP DEBUG migration, to be dropped/reverted once 0085's storage RLS issue is diagnosed.
create or replace function api.debug_storage_meta()
returns table (
  policy_name text,
  cmd text,
  roles text,
  qual text,
  with_check text
)
language sql
security definer
set search_path = pg_catalog, public
as $$
  select polname::text, case p.polcmd when 'r' then 'select' when 'a' then 'insert' when 'w' then 'update' when 'd' then 'delete' else p.polcmd::text end,
    (select string_agg(rolname, ',') from pg_roles where oid = any(p.polroles))::text,
    pg_get_expr(p.polqual, p.polrelid)::text,
    pg_get_expr(p.polwithcheck, p.polrelid)::text
  from pg_policy p
  join pg_class c on c.oid = p.polrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'storage' and c.relname = 'objects'
  order by p.polname;
$$;

grant execute on function api.debug_storage_meta() to authenticated;

create or replace function api.debug_tables_check()
returns table (schemaname text, tablename text, rowsecurity boolean)
language sql
security definer
set search_path = pg_catalog, public
as $$
  select schemaname::text, tablename::text, rowsecurity
  from pg_tables
  where schemaname = 'storage';
$$;

grant execute on function api.debug_tables_check() to authenticated;
