-- 029_supabase_only_auth.sql
-- Allow authenticated users to record their own authentication audit event.
drop policy if exists audit_insert_self on public.audit_log;
create policy audit_insert_self
on public.audit_log
for insert to authenticated
with check (user_id = auth.uid());
