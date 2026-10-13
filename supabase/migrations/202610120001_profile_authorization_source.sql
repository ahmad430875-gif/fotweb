create or replace function public.jwt_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.role::text
  from public.user_profiles p
  where p.id = (select auth.uid());
$$;

create or replace function public.is_active_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_profiles p
    where p.id = (select auth.uid())
      and p.is_active
  );
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_profiles p
    where p.id = (select auth.uid())
      and p.role = 'super_admin'
      and p.is_active
  );
$$;

create or replace function public.is_university_admin_for(target_university uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_profiles p
    join public.universities u on u.id = p.university_id
    where p.id = (select auth.uid())
      and p.role = 'university_admin'
      and p.is_active
      and p.university_id = target_university
      and u.is_active
  );
$$;

comment on function public.is_super_admin() is 'True only when the caller has an active server-managed Super Admin profile.';
comment on function public.is_university_admin_for(uuid) is 'Checks the caller active server-managed profile and university scope.';