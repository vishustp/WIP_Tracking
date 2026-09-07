-- 036: Automatically revert work order status when production logs are deleted
-- If all production logs for a work order are deleted, the work order status reverts to 'Scheduled' (if rolling plan exists) or 'Pending Plan'.

create or replace function public.delete_production_entry(p_production_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  oldrec public.production_logs%rowtype;
  v_remaining_count int;
  v_plan_count int;
  v_target_wo_id uuid;
begin
  if public.app_current_role() not in ('Admin','Production','QA') then
    raise exception 'You do not have permission to delete production entries';
  end if;

  select * into oldrec
  from public.production_logs
  where id = p_production_id
  for update;

  if oldrec.id is null then
    raise exception 'Production entry not found';
  end if;

  if exists (
    select 1
    from public.production_logs x
    where x.work_order_id = oldrec.work_order_id
      and x.process_route_id = oldrec.process_route_id
      and x.created_at > oldrec.created_at
  ) then
    raise exception 'Only the latest production entry for this Work Order and route can be deleted';
  end if;

  v_target_wo_id := oldrec.work_order_id;

  delete from public.production_logs
  where id = p_production_id;

  -- Check if any production logs remain for this work order
  select count(*) into v_remaining_count
  from public.production_logs
  where work_order_id = v_target_wo_id;

  if v_remaining_count = 0 then
    -- Check if a rolling plan exists
    select count(*) into v_plan_count
    from public.rolling_plans
    where work_order_id = v_target_wo_id;

    if v_plan_count > 0 then
      update public.work_orders
      set status = 'Scheduled'
      where id = v_target_wo_id and status not in ('Completed', 'Diverted');
    else
      update public.work_orders
      set status = 'Pending Plan'
      where id = v_target_wo_id and status not in ('Completed', 'Diverted');
    end if;
  end if;
end;
$function$;

grant execute on function public.delete_production_entry(uuid) to authenticated;
