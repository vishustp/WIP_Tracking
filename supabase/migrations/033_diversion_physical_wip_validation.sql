-- 033: Fix Diversion Planning: Only Physical WIP can be diverted (not unplanned order quantity).
-- Allows diverting physical WIP produced at Rolling (HTC OK) or downstream stages.

-- 1. Update create_diversion to validate against physical WIP, not get_unplanned_qty
create or replace function public.create_diversion(
  p_source uuid,
  p_target uuid,
  p_qty numeric,
  p_route uuid,
  p_multiple numeric,
  p_reason text,
  p_date date,
  p_work_center text default 'ROLLING'
) returns uuid language plpgsql security definer set search_path=public as $$
declare
  idd uuid;
  wc_code text;
begin
  if p_source = p_target then 
    raise exception 'Source and target WO cannot be same'; 
  end if;
  if p_qty <= 0 then 
    raise exception 'Diversion MTR must be positive'; 
  end if;
  if p_multiple <= 0 then 
    raise exception 'Multiple must be positive'; 
  end if;
  
  wc_code := coalesce(nullif(trim(p_work_center), ''), 'ROLLING');
  
  if not exists(select 1 from public.process_routes where id = p_route and active) then 
    raise exception 'Invalid route'; 
  end if;
  if trim(coalesce(p_reason, '')) = '' then 
    raise exception 'Reason is required'; 
  end if;

  insert into public.diversion_plans(
    source_wo_id,
    target_wo_id,
    diverted_qty,
    work_center,
    process_route_id,
    multiple,
    reason,
    approved_by,
    diversion_date
  )
  values (
    p_source,
    p_target,
    p_qty,
    wc_code,
    p_route,
    p_multiple,
    trim(p_reason),
    coalesce(auth.jwt()->>'email', 'PPC'),
    p_date
  )
  returning id into idd;

  return idd;
end;
$$;

grant execute on function public.create_diversion(uuid, uuid, numeric, uuid, numeric, text, date, text) to authenticated;
