create or replace function public.can_access_competition(target_competition uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.can_manage_competition(target_competition)
    or exists (
      select 1
      from public.competition_participants cp
      where cp.competition_id = target_competition
        and cp.participation_status in ('invited', 'accepted')
        and public.is_university_admin_for(cp.university_id)
    );
$$;

create or replace function public.is_accepted_competition_participant(
  target_competition uuid,
  target_university uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.competition_participants cp
    where cp.competition_id = target_competition
      and cp.university_id = target_university
      and cp.participation_status = 'accepted'
      and (
        public.can_manage_competition(target_competition)
        or public.is_university_admin_for(target_university)
      )
  );
$$;

create or replace function public.can_view_competition_team(target_team uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.competition_teams ct
    join public.teams t on t.id = ct.team_id
    where ct.team_id = target_team
      and (
        public.can_manage_competition(ct.competition_id)
        or public.is_accepted_competition_participant(ct.competition_id, t.university_id)
      )
  );
$$;