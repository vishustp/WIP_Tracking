-- 039_round_mtr_to_pcs.sql
-- Ensure mtr_to_pcs always returns a discrete rounded whole integer (no fractional decimals).

create or replace function public.mtr_to_pcs(p_work_order_id uuid, p_mtr numeric)
returns numeric language sql stable security definer set search_path=public as $$
  select case
    when coalesce(public.wo_avg_length(p_work_order_id), 0) <= 0 then 0
    else round(greatest(coalesce(p_mtr, 0), 0) / public.wo_avg_length(p_work_order_id))
  end;
$$;

grant execute on function public.mtr_to_pcs(uuid, numeric) to authenticated, anon, service_role;
