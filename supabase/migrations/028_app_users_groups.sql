-- ============================================================
-- 028_app_users_groups.sql
--
-- Move the application's user/group model into Supabase.
-- Authentication remains in auth.users.
-- Application user/profile data lives in public.app_users.
-- ============================================================

-- Application group used by the frontend permission model.
alter table public.app_users
  add column if not exists user_group text;

alter table public.app_users
  drop constraint if exists app_users_user_group_check;

alter table public.app_users
  add constraint app_users_user_group_check
  check (user_group in ('admin', 'super_user', 'user'));

-- Additional application profile fields used by the existing UI.
alter table public.app_users
  add column if not exists role_title text;

alter table public.app_users
  add column if not exists shift text;

alter table public.app_users
  add column if not exists allowed_stages text[] not null default '{}';

alter table public.app_users
  add column if not exists default_stage text;

alter table public.app_users
  add column if not exists avatar_color text;

-- Optional username/employee login alias. Authentication still uses
-- the email/password stored in Supabase Auth.
alter table public.app_users
  add column if not exists username text;

create unique index if not exists app_users_username_lower_idx
  on public.app_users (lower(username))
  where username is not null;

-- Existing role -> application group mapping.
update public.app_users
set user_group =
  case role
    when 'Admin' then 'admin'
    when 'PPC' then 'super_user'
    else 'user'
  end
where user_group is null;

-- Existing users get sensible defaults for fields that were previously
-- supplied by the hardcoded DEFAULT_USERS records.
update public.app_users
set role_title =
  case role
    when 'Admin' then 'PPC Administrator'
    when 'PPC' then 'Plant Operations Head'
    when 'Production' then 'Production Operator'
    when 'QA' then 'Quality & NDT Inspector'
    when 'Viewer' then 'Viewer'
    else 'User'
  end
where role_title is null;

update public.app_users
set allowed_stages =
  case
    when work_center = 'ALL' then
      array[
        'ROLLING',
        'HOLLOW_HEAT_TREATMENT',
        'DRAW',
        'HEAT_TREATMENT',
        'FINISHING'
      ]::text[]
    when work_center = 'QA' then
      array[
        'HEAT_TREATMENT',
        'HOLLOW_HEAT_TREATMENT'
      ]::text[]
    else
      array[work_center]::text[]
  end
where allowed_stages = '{}';

update public.app_users
set default_stage =
  case
    when work_center = 'ALL' then 'ROLLING'
    else work_center
  end
where default_stage is null;

create index if not exists app_users_group_idx
  on public.app_users(user_group);

create index if not exists app_users_work_center_idx
  on public.app_users(work_center);

-- Ensure every existing Supabase Auth account that has an email can have
-- an application-directory record. Existing app_users rows are untouched.
-- No password or Auth account is created here.
insert into public.app_users
(
  auth_user_id,
  employee_code,
  employee_name,
  email,
  role,
  work_center,
  active,
  user_group,
  role_title,
  allowed_stages,
  default_stage
)
select
  u.id,
  'EMP-' || right(replace(u.id::text, '-', ''), 6),
  coalesce(nullif(p.full_name, ''), split_part(u.email, '@', 1)),
  lower(u.email),
  coalesce(p.role, 'Viewer'::app_role),
  case coalesce(p.role, 'Viewer'::app_role)
    when 'Admin' then 'ALL'
    when 'PPC' then 'ALL'
    when 'Production' then 'ROLLING'
    when 'QA' then 'QA'
    else 'ALL'
  end,
  true,
  case coalesce(p.role, 'Viewer'::app_role)
    when 'Admin' then 'admin'
    when 'PPC' then 'super_user'
    else 'user'
  end,
  case coalesce(p.role, 'Viewer'::app_role)
    when 'Admin' then 'PPC Administrator'
    when 'PPC' then 'Plant Operations Head'
    when 'Production' then 'Production Operator'
    when 'QA' then 'Quality & NDT Inspector'
    else 'Viewer'
  end,
  case
    when coalesce(p.role, 'Viewer'::app_role) in ('Admin', 'PPC') then
      array[
        'ROLLING',
        'HOLLOW_HEAT_TREATMENT',
        'DRAW',
        'HEAT_TREATMENT',
        'FINISHING'
      ]::text[]
    when coalesce(p.role, 'Viewer'::app_role) = 'QA' then
      array[
        'HEAT_TREATMENT',
        'HOLLOW_HEAT_TREATMENT'
      ]::text[]
    when coalesce(p.role, 'Viewer'::app_role) = 'Production' then
      array['ROLLING']::text[]
    else
      array[]::text[]
  end,
  case coalesce(p.role, 'Viewer'::app_role)
    when 'Admin' then 'ROLLING'
    when 'PPC' then 'ROLLING'
    when 'Production' then 'ROLLING'
    when 'QA' then 'HEAT_TREATMENT'
    else null
  end
from auth.users u
left join public.profiles p
  on p.id = u.id
where u.email is not null
on conflict (auth_user_id) do nothing;
