create or replace function public.is_team_in_published_competition(target_team uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.competition_teams ct
    join public.competitions c on c.id = ct.competition_id
    join public.universities u on u.id = c.university_id
    where ct.team_id = target_team
      and c.status = 'published'
      and u.is_active
  );
$$;

revoke all on function public.is_team_in_published_competition(uuid) from public;
grant execute on function public.is_team_in_published_competition(uuid) to anon, authenticated;

create or replace function public.can_register_competition_team(
  target_team uuid,
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
    from public.teams t
    join public.competitions c on c.id = target_competition
    where t.id = target_team
      and t.university_id = target_university
      and (
        public.is_super_admin()
        or (not t.is_locked and not c.is_locked)
      )
  );
$$;

revoke all on function public.can_register_competition_team(uuid, uuid, uuid) from public, anon;
grant execute on function public.can_register_competition_team(uuid, uuid, uuid) to authenticated;

drop policy if exists teams_public_read on public.teams;
create policy teams_public_read on public.teams
  for select to anon, authenticated
  using (
    is_active
    and public.is_team_in_published_competition(id)
  );

drop policy if exists competition_teams_secretary_insert on public.competition_teams;
create policy competition_teams_secretary_insert on public.competition_teams
  for insert to authenticated
  with check (
    public.can_register_competition_team(team_id, competition_id, university_id)
    and (
      public.is_super_admin()
      or public.can_manage_competition(competition_id)
      or (
        public.is_university_admin_for(university_id)
        and public.is_accepted_competition_participant(competition_id, university_id)
      )
    )
  );

drop policy if exists competition_teams_secretary_update on public.competition_teams;
create policy competition_teams_secretary_update on public.competition_teams
  for update to authenticated
  using (
    public.can_manage_competition(competition_id)
    or (
      public.is_university_admin_for(university_id)
      and public.is_accepted_competition_participant(competition_id, university_id)
    )
  )
  with check (
    public.can_register_competition_team(team_id, competition_id, university_id)
    and (
      public.can_manage_competition(competition_id)
      or (
        public.is_university_admin_for(university_id)
        and public.is_accepted_competition_participant(competition_id, university_id)
      )
    )
  );

drop policy if exists competition_teams_secretary_delete on public.competition_teams;
create policy competition_teams_secretary_delete on public.competition_teams
  for delete to authenticated
  using (
    public.can_register_competition_team(team_id, competition_id, university_id)
    and (
      public.can_manage_competition(competition_id)
      or (
        public.is_university_admin_for(university_id)
        and public.is_accepted_competition_participant(competition_id, university_id)
      )
    )
  );
