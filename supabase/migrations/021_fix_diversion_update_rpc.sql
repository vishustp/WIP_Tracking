-- 021: Add the missing update_diversion RPC used by the Diversion Plan edit form.
-- diversion_plans intentionally has no updated_at column, so this function only
-- updates the mutable diversion fields and preserves created_at.

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
security invoker
set search_path = public
as $$
declare
  v_id uuid;
  v_work_center text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
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

  if not exists (
    select 1 from public.diversion_plans dp where dp.id = p_diversion_id
  ) then
    raise exception 'Diversion record not found';
  end if;

  if not exists (
    select 1 from public.process_routes pr
    where pr.id = p_route and pr.active
  ) then
    raise exception 'Invalid route';
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

  if v_id is null then
    raise exception 'Failed to update diversion plan';
  end if;

  insert into public.audit_log(user_id, action, entity, record_id, new_value)
  values (
    auth.uid(),
    'UPDATE',
    'Pipe Diversion',
    v_id,
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
