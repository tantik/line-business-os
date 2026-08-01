begin;

create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public, core, workforce;
select no_plan();

select has_column('workforce', 'employees', 'family_name_encrypted', 'staff family name is stored encrypted');
select has_column('workforce', 'employees', 'given_name_encrypted', 'staff given name is stored encrypted');
select has_column('workforce', 'employees', 'email_encrypted', 'staff email is stored encrypted');
select has_column('workforce', 'employees', 'email_hash', 'staff email has a blind index');
select has_column('workforce', 'employees', 'notes_encrypted', 'staff notes are stored encrypted');

select col_type_is('workforce', 'employees', 'family_name_encrypted', 'bytea', 'family name ciphertext uses bytea');
select col_type_is('workforce', 'employees', 'given_name_encrypted', 'bytea', 'given name ciphertext uses bytea');
select col_type_is('workforce', 'employees', 'email_encrypted', 'bytea', 'email ciphertext uses bytea');
select col_type_is('workforce', 'employees', 'notes_encrypted', 'bytea', 'notes ciphertext uses bytea');

select has_index(
  'workforce',
  'employees',
  'workforce_employees_tenant_email_hash_key',
  'tenant-scoped email blind index is unique when present'
);

select has_view('api', 'workforce_staff_manage', 'manager staff facade remains app-facing');
select is(
  (select count(*)::int
     from information_schema.columns
    where table_schema = 'api'
      and table_name = 'workforce_staff_manage'
      and column_name in ('family_name', 'given_name', 'email', 'notes')),
  0,
  'staff facade never exposes plaintext PII columns'
);
select is(
  (select count(*)::int
     from information_schema.role_table_grants
    where grantee in ('anon', 'public')
      and table_schema = 'api'
      and table_name = 'workforce_staff_manage'),
  0,
  'anonymous roles have no staff management facade grants'
);

select * from finish();
rollback;
