-- 004_internal_user_management.sql
-- Application-level employee directory. Passwords remain in Supabase Auth.
create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique not null references auth.users(id) on delete cascade,
  employee_code text unique not null,
  employee_name text not null,
  email text unique not null,
  role app_role not null default 'Viewer',
  work_center text not null default 'ALL',
  department text,
  phone text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists app_users_role_idx on public.app_users(role);
create index if not exists app_users_active_idx on public.app_users(active);

alter table public.app_users enable row level security;

drop policy if exists app_users_read on public.app_users;
create policy app_users_self
on public.app_users
for select to authenticated
using (auth_user_id = auth.uid());

create policy app_users_admin_read
on public.app_users
for select to authenticated
using (app_current_role() = 'Admin');

-- Admin writes are performed by the server-side Admin API using the service role.
revoke all on public.app_users from anon;
grant select on public.app_users to authenticated;

-- Seed the directory from existing Auth users/profiles.
insert into public.app_users
  (auth_user_id, employee_code, employee_name, email, role, work_center, active)
select
  u.id,
  coalesce('EMP-' || right(replace(u.id::text,'-',''), 6), 'EMP'),
  coalesce(nullif(p.full_name,''), split_part(u.email,'@',1)),
  lower(u.email),
  coalesce(p.role, 'Viewer'::app_role),
  case coalesce(p.role, 'Viewer'::app_role)
    when 'Admin' then 'ALL'
    when 'PPC' then 'ALL'
    when 'Production' then 'ROLLING'
    when 'QA' then 'QA'
    else 'ALL'
  end,
  true
from auth.users u
left join public.profiles p on p.id = u.id
where u.email is not null
on conflict (auth_user_id) do nothing;

-- Keep updated_at current.
create or replace function public.touch_app_users_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_app_users_updated_at on public.app_users;
create trigger trg_app_users_updated_at
before update on public.app_users
for each row execute function public.touch_app_users_updated_at();
