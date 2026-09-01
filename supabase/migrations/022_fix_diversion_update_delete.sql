-- 022: Fix Diversion Plan update/delete.
-- Root cause: diversion_plans has INSERT/SELECT RLS only; there are no UPDATE/DELETE policies.
-- Therefore the frontend RPCs must perform the mutation through SECURITY DEFINER,
-- with the application role checked explicitly inside the RPC.

create or replace function public.update_diversion(
  p_diversion_id uuid,
  p_qty numeric,
  p_work_center text,
  p_route uuid,
  p_multiple numeric,
  p_date date,
  p_reason text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_work_center text;
  v_old jsonb;
begin
  if public.app_current_role() not in ('Admin','PPC') then
    raise exception 'You do not have permission to edit Diversion Plans';
  end if;

  if p_qty is null or p_qty <= 0 then
    raise exception 'Diversion MTR must be positive';
  end if;
  if p_multiple is null or p_multiple <= 0 then
    raise exception 'Multiple must be positive';
  end if;
  if p_date is null then
    raise exception 'Diversion date is required';
  end if;
  if trim(coalesce(p_reason, '')) = '' then
    raise exception 'Reason is required';
  end if;

  v_work_center := coalesce(nullif(trim(p_work_center), ''), 'ROLLING');

  select to_jsonb(dp) into v_old
  from public.diversion_plans dp
  where dp.id = p_diversion_id;

  if v_old is null then
    raise exception 'Diversion record not found';
  end if;

  if not exists (
    select 1 from public.process_routes pr
    where pr.id = p_route and pr.active
  ) then
    raise exception 'Invalid process route';
  end if;

  if not exists (
    select 1
    from public.process_stages ps
    join public.route_stages rs on rs.stage_id = ps.id
    where ps.stage_code = v_work_center
      and ps.active
      and rs.route_id = p_route
      and rs.is_required
  ) then
    raise exception 'Selected work center is not part of the selected process route';
  end if;

  update public.diversion_plans
  set diverted_qty = p_qty,
      work_center = v_work_center,
      process_route_id = p_route,
      multiple = p_multiple,
      diversion_date = p_date,
      reason = trim(p_reason)
  where id = p_diversion_id
  returning id into v_id;

  insert into public.audit_log(user_id, action, entity, record_id, old_value, new_value)
  values (
    auth.uid(), 'UPDATE', 'Pipe Diversion', v_id, v_old,
    jsonb_build_object(
      'diverted_qty', p_qty,
      'work_center', v_work_center,
      'process_route_id', p_route,
      'multiple', p_multiple,
      'diversion_date', p_date,
      'reason', trim(p_reason)
    )
  );

  return v_id;
end;
$$;

grant execute on function public.update_diversion(uuid,numeric,text,uuid,numeric,date,text) to authenticated;

create or replace function public.delete_diversion(
  p_diversion_id uuid
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old jsonb;
  v_id uuid;
begin
  if public.app_current_role() not in ('Admin','PPC') then
    raise exception 'You do not have permission to delete Diversion Plans';
  end if;

  select to_jsonb(dp) into v_old
  from public.diversion_plans dp
  where dp.id = p_diversion_id;

  if v_old is null then
    raise exception 'Diversion record not found';
  end if;

  delete from public.diversion_plans
  where id = p_diversion_id
  returning id into v_id;

  insert into public.audit_log(user_id, action, entity, record_id, old_value)
  values (auth.uid(), 'DELETE', 'Pipe Diversion', v_id, v_old);

  return v_id;
end;
$$;

grant execute on function public.delete_diversion(uuid) to authenticated;
