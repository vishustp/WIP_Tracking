-- 030: Make the Supabase API authenticated-only for operational data.
-- The browser anon key is public by design, so it must not be able to read
-- production records or invoke RPCs directly.

-- Remove every legacy anonymous RLS policy, including policies on views and
-- tables added by earlier compatibility migrations.
do $$
declare
  policy_record record;
begin
  for policy_record in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and 'anon' = any(roles)
  loop
    execute format(
      'drop policy if exists %I on %I.%I',
      policy_record.policyname,
      policy_record.schemaname,
      policy_record.tablename
    );
  end loop;
end;
$$;

-- Revoke inherited/current grants.  Privileges for authenticated users are
-- granted explicitly by the feature migrations, while service_role bypasses RLS.
revoke all privileges on all tables in schema public from anon;
revoke all privileges on all sequences in schema public from anon;
revoke all privileges on all functions in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke execute on functions from anon;

-- Audit rows are evidence created by database triggers.  Direct inserts let a
-- user forge a row that appears to be an audit event, so remove that path.
drop policy if exists audit_insert_self on public.audit_log;
revoke insert, update, delete on public.audit_log from authenticated;
