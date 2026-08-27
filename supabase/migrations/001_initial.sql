create extension if not exists pgcrypto;
create type work_order_status as enum ('Pending Plan','Scheduled','In Progress','Completed','Diverted');
create type uom_type as enum ('Pcs','Mtrs');
create type qa_status as enum ('Pending','Cleared','Hold','Rejected');
create type app_role as enum ('Admin','PPC','Production','QA','Viewer');
create table public.profiles(id uuid primary key references auth.users(id) on delete cascade, full_name text, role app_role not null default 'Viewer', created_at timestamptz not null default now());
create table public.process_stages(id uuid primary key default gen_random_uuid(),stage_code text unique not null,stage_name text not null,active boolean not null default true,created_at timestamptz not null default now());
create table public.process_routes(id uuid primary key default gen_random_uuid(),route_code text unique not null,route_name text not null,material_category text not null,active boolean not null default true,created_at timestamptz not null default now());
create table public.route_stages(id uuid primary key default gen_random_uuid(),route_id uuid not null references process_routes(id) on delete cascade,stage_id uuid not null references process_stages(id),sequence_no int not null check(sequence_no>0),is_required boolean not null default true,created_at timestamptz not null default now(),unique(route_id,stage_id),unique(route_id,sequence_no));
create table public.work_orders(id uuid primary key default gen_random_uuid(),work_order_no text unique not null,customer_name text,size_od numeric check(size_od>0),size_wt numeric check(size_wt>0),grade text,ordered_qty numeric not null check(ordered_qty>0),uom uom_type not null,target_date date,status work_order_status not null default 'Pending Plan',created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table public.rolling_plans(id uuid primary key default gen_random_uuid(),plan_no text unique not null default ('RP-'||to_char(clock_timestamp(),'YYYYMMDDHH24MISSMS')),work_order_id uuid not null references work_orders(id),planned_rolling_date date not null,planned_qty numeric not null check(planned_qty>0),process_route_id uuid not null references process_routes(id),target_mother_size text,multiple numeric not null default 1 check(multiple>0),status text not null default 'Scheduled',created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table public.diversion_plans(id uuid primary key default gen_random_uuid(),source_wo_id uuid not null references work_orders(id),target_wo_id uuid not null references work_orders(id),diverted_qty numeric not null check(diverted_qty>0),process_route_id uuid not null references process_routes(id),multiple numeric not null default 1 check(multiple>0),reason text not null,approved_by uuid references auth.users(id),diversion_date date not null,created_at timestamptz not null default now(),check(source_wo_id<>target_wo_id));
create table public.production_logs(id uuid primary key default gen_random_uuid(),work_order_id uuid not null references work_orders(id),rolling_plan_id uuid references rolling_plans(id),stage_id uuid not null references process_stages(id),process_route_id uuid not null references process_routes(id),process_date date not null,input_qty numeric not null default 0 check(input_qty>=0),output_qty numeric not null default 0 check(output_qty>=0),rejection_qty numeric not null default 0 check(rejection_qty>=0),htc_ok numeric not null default 0 check(htc_ok>=0),heat_lot_no text,qa_clearance qa_status,remarks text,created_by uuid references auth.users(id),created_at timestamptz not null default now(),check(rejection_qty<=input_qty));
create table public.audit_log(id bigint generated always as identity primary key,user_id uuid references auth.users(id),action text not null,entity text not null,record_id uuid,old_value jsonb,new_value jsonb,created_at timestamptz not null default now());
create index on work_orders(status); create index on work_orders(target_date); create index on work_orders(grade); create index on work_orders(customer_name); create index on rolling_plans(work_order_id,process_route_id); create index on production_logs(work_order_id,process_route_id,stage_id,process_date); create index on diversion_plans(source_wo_id,target_wo_id);
insert into process_stages(stage_code,stage_name) values ('ROLLING','Rolling'),('HOLLOW_HEAT_TREATMENT','Hollow Heat Treatment'),('DRAW','Draw'),('HEAT_TREATMENT','Heat Treatment'),('FINISHING','Finishing') on conflict do nothing;
insert into process_routes(route_code,route_name,material_category) values ('HFS','Standard HFS','Standard'),('CDS','Standard CDS','Standard'),('ALLOY_HFS','Alloy HFS','Alloy'),('ALLOY_CDS','Alloy CDS','Alloy') on conflict do nothing;
insert into route_stages(route_id,stage_id,sequence_no) select r.id,s.id,x.seq from (values('HFS','ROLLING',1),('HFS','FINISHING',2),('CDS','ROLLING',1),('CDS','DRAW',2),('CDS','HEAT_TREATMENT',3),('CDS','FINISHING',4),('ALLOY_HFS','ROLLING',1),('ALLOY_HFS','HOLLOW_HEAT_TREATMENT',2),('ALLOY_HFS','FINISHING',3),('ALLOY_CDS','ROLLING',1),('ALLOY_CDS','HOLLOW_HEAT_TREATMENT',2),('ALLOY_CDS','DRAW',3),('ALLOY_CDS','HEAT_TREATMENT',4),('ALLOY_CDS','FINISHING',5)) x(code,stage,seq) join process_routes r on r.route_code=x.code join process_stages s on s.stage_code=x.stage on conflict do nothing;
create or replace function set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end $$;
create trigger work_orders_updated before update on work_orders for each row execute function set_updated_at();
create trigger rolling_plans_updated before update on rolling_plans for each row execute function set_updated_at();
create or replace function get_unplanned_qty(p_work_order_id uuid) returns numeric language sql security definer set search_path=public as $$ select greatest(0,w.ordered_qty-coalesce((select sum(planned_qty) from rolling_plans where work_order_id=p_work_order_id),0)-coalesce((select sum(diverted_qty) from diversion_plans where source_wo_id=p_work_order_id),0)); $$;

create or replace function create_rolling_plan(
 p_work_order_id uuid,p_planned_qty numeric,p_rolling_date date,p_route_id uuid,
 p_target_mother_size text,p_multiple numeric default 1
) returns text language plpgsql security invoker set search_path=public as $$
declare n text; avail numeric;
begin
 if p_planned_qty<=0 then raise exception 'Planned quantity must be positive'; end if;
 if p_multiple<=0 then raise exception 'Multiple must be positive'; end if;
 if not exists(select 1 from work_orders where id=p_work_order_id) then raise exception 'Work Order not found'; end if;
 if not exists(select 1 from process_routes where id=p_route_id and active) then raise exception 'Invalid route'; end if;
 select get_unplanned_qty(p_work_order_id) into avail;
 if p_planned_qty>avail then raise exception 'Planned quantity % exceeds unplanned quantity %',p_planned_qty,avail; end if;
 insert into rolling_plans(work_order_id,planned_rolling_date,planned_qty,process_route_id,target_mother_size,multiple)
 values(p_work_order_id,p_rolling_date,p_planned_qty,p_route_id,p_target_mother_size,p_multiple)
 returning plan_no into n;
 update work_orders set status='Scheduled' where id=p_work_order_id and status='Pending Plan';
 return n;
end $$;

create or replace function create_diversion(
 p_source uuid,p_target uuid,p_qty numeric,p_route uuid,p_multiple numeric default 1,
 p_reason text default '',p_date date default current_date
) returns uuid language plpgsql security invoker set search_path=public as $$
declare avail numeric; idd uuid;
begin
 if p_source=p_target then raise exception 'Source and target WO cannot be same'; end if;
 if p_qty<=0 then raise exception 'Diversion quantity must be positive'; end if;
 if p_multiple<=0 then raise exception 'Multiple must be positive'; end if;
 select get_unplanned_qty(p_source) into avail;
 if p_qty>avail then raise exception 'Diversion exceeds available source quantity'; end if;
 if not exists(select 1 from process_routes where id=p_route and active) then raise exception 'Invalid route'; end if;
 if trim(coalesce(p_reason,''))='' then raise exception 'Reason is required'; end if;
 insert into diversion_plans(source_wo_id,target_wo_id,diverted_qty,process_route_id,multiple,reason,approved_by,diversion_date)
 values(p_source,p_target,p_qty,p_route,p_multiple,p_reason,auth.uid(),p_date) returning id into idd;
 return idd;
end $$;

create or replace function get_production_entry_queue(p_stage_code text)
returns table(
 work_order_id uuid,work_order_no text,customer_name text,specification text,
 od numeric,wl numeric,uom uom_type,route_id uuid,route_code text,route_name text,
 stage_code text,balance_to_make numeric,multiple numeric
) language sql security definer set search_path=public as $$
with route_stage_list as (
 select wo.id work_order_id,wo.work_order_no,wo.customer_name,wo.grade specification,
        wo.size_od od,wo.size_wt wl,wo.uom,r.id route_id,r.route_code,r.route_name,
        ps.stage_code,rs.sequence_no
 from work_orders wo join rolling_plans rp on rp.work_order_id=wo.id
 join process_routes r on r.id=rp.process_route_id and r.active
 join route_stages rs on rs.route_id=r.id and rs.is_required
 join process_stages ps on ps.id=rs.stage_id and ps.active
 where ps.stage_code=p_stage_code
 union
 select wo.id,wo.work_order_no,wo.customer_name,wo.grade,wo.size_od,wo.size_wt,wo.uom,
        r.id,r.route_code,r.route_name,ps.stage_code,rs.sequence_no
 from work_orders wo join diversion_plans dp on dp.target_wo_id=wo.id
 join process_routes r on r.id=dp.process_route_id and r.active
 join route_stages rs on rs.route_id=r.id and rs.is_required
 join process_stages ps on ps.id=rs.stage_id and ps.active
 where ps.stage_code=p_stage_code
), base as (
 select distinct on(work_order_id,route_id,stage_code) * from route_stage_list
 order by work_order_id,route_id,stage_code
)
select b.work_order_id,b.work_order_no,b.customer_name,b.specification,b.od,b.wl,b.uom,
 b.route_id,b.route_code,b.route_name,b.stage_code,
 greatest(0,case
 when b.stage_code='ROLLING' then
   coalesce((select sum(rp.planned_qty) from rolling_plans rp where rp.work_order_id=b.work_order_id and rp.process_route_id=b.route_id),0)
 + coalesce((select sum(dp.diverted_qty) from diversion_plans dp where dp.target_wo_id=b.work_order_id and dp.process_route_id=b.route_id),0)
 - coalesce((select sum(pl.input_qty) from production_logs pl join process_stages ps on ps.id=pl.stage_id
             where pl.work_order_id=b.work_order_id and pl.process_route_id=b.route_id and ps.stage_code='ROLLING'),0)
 when b.stage_code='HOLLOW_HEAT_TREATMENT' then
   coalesce((select sum(pl.output_qty-pl.rejection_qty) from production_logs pl join process_stages ps on ps.id=pl.stage_id
             where pl.work_order_id=b.work_order_id and pl.process_route_id=b.route_id and ps.stage_code='ROLLING'),0)
 - coalesce((select sum(pl.input_qty) from production_logs pl join process_stages ps on ps.id=pl.stage_id
             where pl.work_order_id=b.work_order_id and pl.process_route_id=b.route_id and ps.stage_code='HOLLOW_HEAT_TREATMENT'),0)
 when b.stage_code='DRAW' then
   coalesce((select sum(pl.htc_ok) from production_logs pl join process_stages ps on ps.id=pl.stage_id
             where pl.work_order_id=b.work_order_id and pl.process_route_id=b.route_id and ps.stage_code='ROLLING'),0)
 + coalesce((select sum(dp.diverted_qty) from diversion_plans dp where dp.target_wo_id=b.work_order_id and dp.process_route_id=b.route_id),0)
 - coalesce((select sum(pl.input_qty) from production_logs pl join process_stages ps on ps.id=pl.stage_id
             where pl.work_order_id=b.work_order_id and pl.process_route_id=b.route_id and ps.stage_code='DRAW'),0)
 when b.stage_code='HEAT_TREATMENT' then
   coalesce((select sum(pl.output_qty-pl.rejection_qty) from production_logs pl join process_stages ps on ps.id=pl.stage_id
             where pl.work_order_id=b.work_order_id and pl.process_route_id=b.route_id and ps.stage_code='DRAW'),0)
 - coalesce((select sum(pl.input_qty) from production_logs pl join process_stages ps on ps.id=pl.stage_id
             where pl.work_order_id=b.work_order_id and pl.process_route_id=b.route_id and ps.stage_code='HEAT_TREATMENT'),0)
 when b.stage_code='FINISHING' then
   (case when b.route_code in('HFS','ALLOY_HFS') then
      coalesce((select sum(pl.htc_ok) from production_logs pl join process_stages ps on ps.id=pl.stage_id
                where pl.work_order_id=b.work_order_id and pl.process_route_id=b.route_id and ps.stage_code='ROLLING'),0)
    else
      coalesce((select sum(pl.output_qty-pl.rejection_qty) from production_logs pl join process_stages ps on ps.id=pl.stage_id
                where pl.work_order_id=b.work_order_id and pl.process_route_id=b.route_id and ps.stage_code='HEAT_TREATMENT'),0)
    end)
   * coalesce((select max(dp.multiple) from diversion_plans dp where dp.target_wo_id=b.work_order_id and dp.process_route_id=b.route_id),
              (select max(rp.multiple) from rolling_plans rp where rp.work_order_id=b.work_order_id and rp.process_route_id=b.route_id),1)
   - coalesce((select sum(pl.input_qty) from production_logs pl join process_stages ps on ps.id=pl.stage_id
               where pl.work_order_id=b.work_order_id and pl.process_route_id=b.route_id and ps.stage_code='FINISHING'),0)
 else 0 end),
 coalesce((select max(dp.multiple) from diversion_plans dp where dp.target_wo_id=b.work_order_id and dp.process_route_id=b.route_id),
          (select max(rp.multiple) from rolling_plans rp where rp.work_order_id=b.work_order_id and rp.process_route_id=b.route_id),1)
from base b order by b.work_order_no,b.route_code;
$$;

create or replace function record_production(
 p_work_order_id uuid,p_route_id uuid,p_stage_code text,p_process_date date,
 p_input_qty numeric,p_output_qty numeric,p_rejection_qty numeric,p_htc_ok numeric,
 p_heat_lot_no text,p_remarks text
) returns uuid language plpgsql security invoker set search_path=public as $$
declare sid uuid; rec uuid; balance numeric;
begin
 if p_input_qty<=0 or p_output_qty<=0 then raise exception 'Production quantity must be positive'; end if;
 if p_output_qty>p_input_qty then raise exception 'Output quantity cannot exceed input quantity'; end if;
 if p_rejection_qty<0 or p_rejection_qty>p_output_qty then raise exception 'Rejection cannot exceed output quantity'; end if;
 if p_htc_ok<0 then raise exception 'HTC OK cannot be negative'; end if;
 select ps.id into sid from process_stages ps join route_stages rs on rs.stage_id=ps.id
 where rs.route_id=p_route_id and rs.is_required and ps.stage_code=p_stage_code and ps.active;
 if sid is null then raise exception 'Stage is not part of selected route'; end if;
 if p_stage_code<>'ROLLING' and p_htc_ok<>0 then raise exception 'HTC OK can only be entered at Rolling'; end if;
 if p_stage_code='ROLLING' and p_htc_ok>(p_output_qty-p_rejection_qty) then raise exception 'HTC OK cannot exceed net rolling production'; end if;
 select q.balance_to_make into balance from get_production_entry_queue(p_stage_code) q
 where q.work_order_id=p_work_order_id and q.route_id=p_route_id limit 1;
 if balance is null then raise exception 'No eligible WIP found for this Work Order and route'; end if;
 if p_input_qty>balance then raise exception 'Production input % exceeds available WIP %',p_input_qty,balance; end if;
 insert into production_logs(work_order_id,stage_id,process_route_id,process_date,input_qty,output_qty,rejection_qty,htc_ok,heat_lot_no,remarks,created_by)
 values(p_work_order_id,sid,p_route_id,p_process_date,p_input_qty,p_output_qty,p_rejection_qty,p_htc_ok,
        nullif(trim(p_heat_lot_no),''),nullif(trim(p_remarks),''),auth.uid()) returning id into rec;
 update work_orders set status='In Progress' where id=p_work_order_id and status in('Pending Plan','Scheduled');
 return rec;
end $$;

create or replace function get_recent_production_entries(p_limit integer default 50)
returns table(id uuid,work_order_no text,customer_name text,route_code text,stage_code text,
 process_date date,input_qty numeric,output_qty numeric,rejection_qty numeric,htc_ok numeric,
 heat_lot_no text,remarks text,created_at timestamptz)
language sql security definer set search_path=public as $$
 select pl.id,wo.work_order_no,wo.customer_name,r.route_code,ps.stage_code,pl.process_date,
        pl.input_qty,pl.output_qty,pl.rejection_qty,pl.htc_ok,pl.heat_lot_no,pl.remarks,pl.created_at
 from production_logs pl join work_orders wo on wo.id=pl.work_order_id
 join process_routes r on r.id=pl.process_route_id join process_stages ps on ps.id=pl.stage_id
 order by pl.created_at desc limit greatest(1,least(coalesce(p_limit,50),100));
$$;

create or replace function update_production_entry(
 p_production_id uuid,p_process_date date,p_output_qty numeric,p_rejection_qty numeric,p_htc_ok numeric,
 p_heat_lot_no text,p_remarks text
) returns void language plpgsql security invoker set search_path=public as $$
declare oldrec production_logs%rowtype; balance numeric; stage_code_value text;
begin
 select * into oldrec from production_logs where id=p_production_id for update;
 if oldrec.id is null then raise exception 'Production entry not found'; end if;
 if exists(select 1 from production_logs x where x.work_order_id=oldrec.work_order_id
           and x.process_route_id=oldrec.process_route_id and x.created_at>oldrec.created_at) then
   raise exception 'Only the last production entry for this Work Order and route can be corrected';
 end if;
 select ps.stage_code into stage_code_value from process_stages ps where ps.id=oldrec.stage_id;
 if p_output_qty<=0 or p_rejection_qty<0 or p_rejection_qty>p_output_qty then raise exception 'Invalid corrected production/rejection quantity'; end if;
 if p_htc_ok<0 or(stage_code_value<>'ROLLING' and p_htc_ok<>0) then raise exception 'Invalid HTC OK quantity'; end if;
 if stage_code_value='ROLLING' and p_htc_ok>p_output_qty-p_rejection_qty then raise exception 'HTC OK cannot exceed net rolling production'; end if;
 select q.balance_to_make+oldrec.input_qty into balance from get_production_entry_queue(stage_code_value) q
 where q.work_order_id=oldrec.work_order_id and q.route_id=oldrec.process_route_id limit 1;
 if balance is null or p_output_qty>balance then raise exception 'Corrected quantity exceeds available WIP %',coalesce(balance,0); end if;
 update production_logs set process_date=p_process_date,input_qty=p_output_qty,output_qty=p_output_qty,rejection_qty=p_rejection_qty,
   htc_ok=p_htc_ok,heat_lot_no=nullif(trim(p_heat_lot_no),''),remarks=nullif(trim(p_remarks),'')
 where id=p_production_id;
end $$;

create or replace function delete_production_entry(p_production_id uuid)
returns void language plpgsql security invoker set search_path=public as $$
declare oldrec production_logs%rowtype;
begin
 select * into oldrec from production_logs where id=p_production_id for update;
 if oldrec.id is null then raise exception 'Production entry not found'; end if;
 if exists(select 1 from production_logs x where x.work_order_id=oldrec.work_order_id
           and x.process_route_id=oldrec.process_route_id and x.created_at>oldrec.created_at) then
   raise exception 'Only the last production entry for this Work Order and route can be deleted';
 end if;
 delete from production_logs where id=p_production_id;
end $$;

create or replace view vw_route_stage_wip as
with balances as(select work_order_id,process_route_id,stage_id,sum(input_qty) input_qty,sum(output_qty) output_qty,sum(rejection_qty) rejection_qty
                 from production_logs group by 1,2,3)
select wo.id work_order_id,wo.work_order_no,r.id route_id,r.route_code,s.id stage_id,s.stage_name,rs.sequence_no,
 coalesce(b.input_qty,0) input_qty,coalesce(b.output_qty,0) output_qty,coalesce(b.rejection_qty,0) rejection_qty,
 greatest(coalesce(b.output_qty,0)-coalesce(b.input_qty,0)-coalesce(b.rejection_qty,0),0) current_wip
from work_orders wo join rolling_plans rp on rp.work_order_id=wo.id join process_routes r on r.id=rp.process_route_id
join route_stages rs on rs.route_id=r.id join process_stages s on s.id=rs.stage_id
left join balances b on b.work_order_id=wo.id and b.process_route_id=r.id and b.stage_id=s.id
group by wo.id,wo.work_order_no,r.id,r.route_code,s.id,s.stage_name,rs.sequence_no,b.input_qty,b.output_qty,b.rejection_qty;

create or replace view vw_work_order_summary as
select wo.id work_order_id,wo.work_order_no,wo.customer_name customer,wo.size_od od,wo.size_wt wt,wo.grade,wo.ordered_qty,
 coalesce(sum(rp.planned_qty),0) planned_qty,
 coalesce((select sum(output_qty) from production_logs p where p.work_order_id=wo.id),0) produced_qty,
 coalesce((select sum(rejection_qty) from production_logs p where p.work_order_id=wo.id),0) rejected_qty,
 coalesce((select string_agg(distinct pr.route_code,', ' order by pr.route_code) from rolling_plans x join process_routes pr on pr.id=x.process_route_id where x.work_order_id=wo.id),'') route,
 wo.target_date,
 greatest(0,wo.ordered_qty-coalesce((select sum(output_qty-rejection_qty) from production_logs p where p.work_order_id=wo.id
 and p.stage_id=(select id from process_stages where stage_code='FINISHING')),0)-coalesce((select sum(diverted_qty) from diversion_plans d where d.source_wo_id=wo.id),0)) total_pending,
 wo.status from work_orders wo left join rolling_plans rp on rp.work_order_id=wo.id group by wo.id;

create or replace view vw_dashboard_kpis as
select count(*) filter(where status in('Scheduled','In Progress')) active_work_orders,
 count(*) filter(where status='Pending Plan') pending_planning,count(*) filter(where status='Scheduled') scheduled_orders,
 count(*) filter(where status='In Progress') in_progress_orders,
 coalesce((select count(*) from production_logs where process_date=current_date and stage_id=(select id from process_stages where stage_code='FINISHING')),0) completed_today,
 coalesce((select sum(current_wip) from vw_route_stage_wip),0) total_wip,
 coalesce((select sum(rejection_qty) from production_logs),0) rejection_qty,
 count(*) filter(where target_date<current_date and total_pending>0) delayed_orders from vw_work_order_summary;

create or replace function audit_trigger() returns trigger language plpgsql security definer set search_path=public as $$
begin
 insert into audit_log(user_id,action,entity,record_id,old_value,new_value)
 values(auth.uid(),tg_op,tg_table_name,coalesce(new.id,old.id),to_jsonb(old),to_jsonb(new));
 return coalesce(new,old);
end $$;
create trigger audit_work_orders after insert or update or delete on work_orders for each row execute function audit_trigger();
create trigger audit_rolling_plans after insert or update or delete on rolling_plans for each row execute function audit_trigger();
create trigger audit_diversions after insert or update or delete on diversion_plans for each row execute function audit_trigger();
create trigger audit_production after insert or update or delete on production_logs for each row execute function audit_trigger();

alter table profiles enable row level security; alter table process_stages enable row level security; alter table process_routes enable row level security;
alter table route_stages enable row level security; alter table work_orders enable row level security; alter table rolling_plans enable row level security;
alter table diversion_plans enable row level security; alter table production_logs enable row level security; alter table audit_log enable row level security;

create or replace function app_current_role() returns app_role language sql stable security definer set search_path=public as $$
 select role from profiles where id=auth.uid();
$$;

create policy profile_self on profiles for select using(id=auth.uid());
create policy stages_read on process_stages for select to authenticated using(active or app_current_role()='Admin');
create policy routes_read on process_routes for select to authenticated using(active or app_current_role()='Admin');
create policy route_stages_read on route_stages for select to authenticated using(true);
create policy wo_read on work_orders for select to authenticated using(true);
create policy wo_write on work_orders for all to authenticated using(app_current_role() in('Admin','PPC')) with check(app_current_role() in('Admin','PPC'));
create policy rp_read on rolling_plans for select to authenticated using(true);
create policy rp_write on rolling_plans for all to authenticated using(app_current_role() in('Admin','PPC')) with check(app_current_role() in('Admin','PPC'));
create policy div_read on diversion_plans for select to authenticated using(true);
create policy div_write on diversion_plans for insert to authenticated with check(app_current_role() in('Admin','PPC'));
create policy prod_read on production_logs for select to authenticated using(true);
create policy prod_write on production_logs for insert to authenticated with check(app_current_role() in('Admin','Production','QA'));
create policy prod_update on production_logs for update to authenticated using(app_current_role() in('Admin','Production','QA')) with check(app_current_role() in('Admin','Production','QA'));
create policy prod_delete on production_logs for delete to authenticated using(app_current_role() in('Admin','Production','QA'));
create policy audit_read on audit_log for select to authenticated using(app_current_role() in('Admin','PPC','QA'));

grant execute on function get_unplanned_qty(uuid) to authenticated;
grant execute on function create_rolling_plan(uuid,numeric,date,uuid,text,numeric) to authenticated;
grant execute on function create_diversion(uuid,uuid,numeric,uuid,numeric,text,date) to authenticated;
grant execute on function get_production_entry_queue(text) to authenticated;
grant execute on function record_production(uuid,uuid,text,date,numeric,numeric,numeric,numeric,text,text) to authenticated;
grant execute on function get_recent_production_entries(integer) to authenticated;
grant execute on function update_production_entry(uuid,date,numeric,numeric,numeric,text,text) to authenticated;
grant execute on function delete_production_entry(uuid) to authenticated;
