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

create or replace function public.can_manage_university(target_university uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_super_admin() or public.is_university_admin_for(target_university);
$$;

drop policy if exists competitions_admin_insert on public.competitions;
create policy competitions_admin_insert on public.competitions
  for insert to authenticated
  with check (
    (select public.can_manage_university(university_id))
    and not is_locked
  );
