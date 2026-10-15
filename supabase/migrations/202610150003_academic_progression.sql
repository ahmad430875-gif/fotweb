alter table public.teams
  add column if not exists batch_session text;

alter table public.players
  add column if not exists batch_session text;

create or replace function public.promote_class_team(target_team uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  team_row public.teams%rowtype;
  normalized_class text;
  next_class text;
  updated_players integer;
begin
  select * into team_row
  from public.teams
  where id = target_team
  for update;

  if not found or not public.can_manage_university(team_row.university_id) then
    raise exception 'You cannot manage this team.' using errcode = '42501';
  end if;
  if team_row.type <> 'class_team' then
    raise exception 'Only class teams can be promoted.' using errcode = '23514';
  end if;
  if not public.is_super_admin() and team_row.is_locked then
    raise exception 'This team is locked by a Super Admin.' using errcode = '42501';
  end if;

  normalized_class := regexp_replace(lower(trim(team_row.academic_class)), '[^a-z0-9]', '', 'g');
  normalized_class := regexp_replace(normalized_class, '^mbbs', '');
  next_class := case
    when normalized_class in ('year1', '1styear', 'firstyear') then 'Year 2'
    when normalized_class in ('year2', '2ndyear', 'secondyear') then 'Year 3'
    when normalized_class in ('year3', '3rdyear', 'thirdyear') then 'Year 4'
    when normalized_class in ('year4', '4thyear', 'fourthyear') then 'Year 5'
    when normalized_class in ('year5', '5thyear', 'fifthyear', 'finalyear') then 'HO'
    else null
  end;

  if next_class is null then
    raise exception 'This class year has no automatic next year. Update it manually if required.' using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.player_registrations pr
    join public.players p on p.id = pr.player_id
    where pr.team_id = team_row.id
      and pr.university_id = team_row.university_id
      and pr.released_at is null
      and p.is_active
      and p.is_locked
  ) and not public.is_super_admin() then
    raise exception 'At least one registered player profile is locked by a Super Admin.' using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.player_registrations pr
    join public.players p on p.id = pr.player_id
    where pr.team_id = team_row.id
      and pr.university_id = team_row.university_id
      and pr.released_at is null
      and p.is_active
      and p.current_academic_year is not null
      and regexp_replace(regexp_replace(lower(trim(p.current_academic_year)), '[^a-z0-9]', '', 'g'), '^mbbs', '') <> normalized_class
  ) then
    raise exception 'Some active players have a different academic year. Review the roster before promoting the class team.' using errcode = '23514';
  end if;

  update public.players p
  set current_academic_year = next_class
  where p.university_id = team_row.university_id
    and p.is_active
    and exists (
      select 1 from public.player_registrations pr
      where pr.player_id = p.id
        and pr.team_id = team_row.id
        and pr.university_id = team_row.university_id
        and pr.released_at is null
    );
  get diagnostics updated_players = row_count;

  update public.teams
  set academic_class = next_class
  where id = team_row.id;

  return updated_players;
end;
$$;

revoke execute on function public.promote_class_team(uuid) from public, anon;
grant execute on function public.promote_class_team(uuid) to authenticated;

comment on function public.promote_class_team(uuid) is 'Atomically advances an unlocked class team and its active registered permanent player profiles by one academic year.';
comment on column public.teams.batch_session is 'University-defined cohort or academic session for the team.';
comment on column public.players.batch_session is 'University-defined cohort or academic session for the permanent player profile.';
