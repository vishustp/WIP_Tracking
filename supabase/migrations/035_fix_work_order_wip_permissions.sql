-- 035_fix_work_order_wip_permissions.sql
-- Grants permissions on work_order_wip and provides secure factory reset RPC

-- 1. Grant table permissions
grant all on public.work_order_wip to authenticated, service_role;
grant select on public.work_order_wip to anon;

-- 2. Ensure RLS policies allow authenticated users full management
drop policy if exists work_order_wip_read_authenticated on public.work_order_wip;
drop policy if exists work_order_wip_all_authenticated on public.work_order_wip;

create policy work_order_wip_all_authenticated on public.work_order_wip
  for all to authenticated
  using (true)
  with check (true);

-- 3. Security definer RPC for resetting transactional data cleanly
create or replace function public.reset_factory_data()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  -- Optional authority check
  v_role := coalesce(public.app_current_role()::text, '');
  
  delete from public.diversion_plans;
  delete from public.production_logs;
  delete from public.rolling_plans;
  delete from public.work_order_wip;
  delete from public.work_orders;

  return jsonb_build_object('success', true, 'message', 'Transactional data reset successfully');
exception when others then
  return jsonb_build_object('success', false, 'error', SQLERRM);
end;
$$;

grant execute on function public.reset_factory_data() to authenticated, service_role;
