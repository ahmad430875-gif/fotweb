drop policy if exists competition_participants_invite on public.competition_participants;
create policy competition_participants_invite on public.competition_participants
  for insert to authenticated
  with check (
    public.can_manage_competition(competition_id)
    and invited_by = (select auth.uid())
    and participation_status = 'accepted'
    and responded_at is not null
    and university_id <> (
      select c.university_id from public.competitions c where c.id = competition_id
    )
  );

drop policy if exists competition_participants_respond on public.competition_participants;

create or replace function public.add_inter_class_teams(target_competition uuid, target_university uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.competitions c
    join public.competition_participants cp on cp.competition_id = c.id
      and cp.university_id = target_university
      and cp.participation_status = 'accepted'
    where c.id = target_competition and c.type = 'inter_class'
  ) then
    return;
  end if;

  insert into public.competition_teams (competition_id, team_id, university_id)
  select target_competition, t.id, target_university
  from public.teams t
  where t.university_id = target_university
    and t.type = 'class_team'
    and t.is_active
  on conflict (competition_id, team_id) do nothing;

  insert into public.player_registrations (
    player_id, team_id, competition_id, university_id, shirt_number
  )
  select roster.player_id, roster.team_id, target_competition, target_university, roster.shirt_number
  from (
    with latest_roster_competitions as (
      select distinct on (pr.team_id) pr.team_id, pr.competition_id
      from public.player_registrations pr
      join public.competitions source_competition on source_competition.id = pr.competition_id
      where pr.university_id = target_university
        and pr.released_at is null
        and source_competition.id <> target_competition
      order by pr.team_id, source_competition.start_date desc, pr.registered_at desc
    )
    select distinct on (pr.team_id, pr.player_id)
      pr.team_id, pr.player_id, pr.shirt_number,
      regexp_replace(
        regexp_replace(lower(trim(coalesce(p.current_academic_year, ''))), '[^a-z0-9]', '', 'g'),
        '^mbbs', ''
      ) as player_class,
      regexp_replace(
        regexp_replace(lower(trim(coalesce(t.academic_class, ''))), '[^a-z0-9]', '', 'g'),
        '^mbbs', ''
      ) as team_class
    from latest_roster_competitions latest
    join public.player_registrations pr on pr.team_id = latest.team_id
      and pr.competition_id = latest.competition_id
    join public.teams t on t.id = pr.team_id and t.university_id = target_university
      and t.type = 'class_team' and t.is_active
    join public.players p on p.id = pr.player_id and p.university_id = target_university and p.is_active
    where pr.university_id = target_university and pr.released_at is null
    order by pr.team_id, pr.player_id, pr.registered_at desc
  ) roster
  where roster.player_class <> ''
    and roster.player_class = roster.team_class
  on conflict (player_id, team_id, competition_id) do nothing;
end;
$$;

revoke all on function public.add_inter_class_teams(uuid, uuid) from public, anon, authenticated;

create or replace function public.add_participant_inter_class_teams()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.participation_status = 'accepted' then
    perform public.add_inter_class_teams(new.competition_id, new.university_id);
  end if;
  return new;
end;
$$;

create trigger competition_participants_add_inter_class_teams
  after insert or update of participation_status on public.competition_participants
  for each row execute function public.add_participant_inter_class_teams();

update public.competition_participants
set participation_status = 'accepted',
    responded_at = coalesce(responded_at, invited_at)
where participation_status = 'invited';
