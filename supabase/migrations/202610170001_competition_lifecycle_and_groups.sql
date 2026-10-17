alter table public.competitions
  add column if not exists ended_at timestamptz;

drop policy if exists universities_public_read on public.universities;
create policy universities_public_read on public.universities
  for select to anon, authenticated
  using (is_active);

create or replace function public.guard_ended_competition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_data jsonb;
  target_competition uuid;
  ended boolean;
begin
  if tg_table_name = 'competitions' then
    if tg_op = 'INSERT' then
      if new.ended_at is not null then
        raise exception 'A competition cannot be created as ended.' using errcode = '42501';
      end if;
      return new;
    end if;

    if old.ended_at is not null then
      raise exception 'This tournament has ended and is permanently read-only.' using errcode = '42501';
    end if;

    if tg_op = 'DELETE' then return old; end if;

    if tg_op = 'UPDATE' and old.ended_at is null and new.ended_at is not null then
      if new.status <> 'published' then
        raise exception 'Publish the competition before ending it.' using errcode = '23514';
      end if;
      if exists (
        select 1 from public.matches m
        where m.competition_id = new.id
          and m.status not in ('full_time', 'cancelled')
      ) or exists (
        select 1 from public.match_brackets b
        where b.competition_id = new.id
          and b.match_status not in ('full_time', 'cancelled')
      ) then
        raise exception 'Every fixture must be completed or cancelled before ending the tournament.' using errcode = '23514';
      end if;
      new.ended_at := now();
    end if;

    return new;
  end if;

  row_data := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  if row_data ? 'competition_id' then
    target_competition := nullif(row_data ->> 'competition_id', '')::uuid;
    if target_competition is null and tg_table_name = 'announcements' then
      select m.competition_id into target_competition
      from public.matches m
      where m.id = nullif(row_data ->> 'match_id', '')::uuid;
    end if;
  elsif tg_table_name = 'tournament_rounds' then
    select s.competition_id into target_competition
    from public.tournament_stages s
    where s.id = nullif(row_data ->> 'stage_id', '')::uuid;
  elsif tg_table_name = 'match_officials' then
    select b.competition_id into target_competition
    from public.match_brackets b
    where b.id = nullif(row_data ->> 'match_id', '')::uuid;
  elsif tg_table_name in ('match_players', 'match_events') then
    select m.competition_id into target_competition
    from public.matches m
    where m.id = nullif(row_data ->> 'match_id', '')::uuid;
  elsif tg_table_name = 'squad_announcement_players' then
    select sa.competition_id into target_competition
    from public.squad_announcements sa
    where sa.id = nullif(row_data ->> 'announcement_id', '')::uuid;
  end if;

  if target_competition is not null then
    select c.ended_at is not null into ended
    from public.competitions c
    where c.id = target_competition;
    if coalesce(ended, false) then
      raise exception 'This tournament has ended and is permanently read-only.' using errcode = '42501';
    end if;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger competitions_ended_guard
  before insert or update or delete on public.competitions
  for each row execute function public.guard_ended_competition();

create trigger competition_teams_ended_guard
  before insert or update or delete on public.competition_teams
  for each row execute function public.guard_ended_competition();
create trigger competition_participants_ended_guard
  before insert or update or delete on public.competition_participants
  for each row execute function public.guard_ended_competition();
create trigger player_registrations_ended_guard
  before insert or update or delete on public.player_registrations
  for each row execute function public.guard_ended_competition();
create trigger matches_ended_guard
  before insert or update or delete on public.matches
  for each row execute function public.guard_ended_competition();
create trigger match_players_ended_guard
  before insert or update or delete on public.match_players
  for each row execute function public.guard_ended_competition();
create trigger match_events_ended_guard
  before insert or update or delete on public.match_events
  for each row execute function public.guard_ended_competition();
create trigger announcements_ended_guard
  before insert or update or delete on public.announcements
  for each row execute function public.guard_ended_competition();
create trigger tournament_stages_ended_guard
  before insert or update or delete on public.tournament_stages
  for each row execute function public.guard_ended_competition();
create trigger tournament_rounds_ended_guard
  before insert or update or delete on public.tournament_rounds
  for each row execute function public.guard_ended_competition();
create trigger match_brackets_ended_guard
  before insert or update or delete on public.match_brackets
  for each row execute function public.guard_ended_competition();
create trigger match_cards_ended_guard
  before insert or update or delete on public.match_cards
  for each row execute function public.guard_ended_competition();
create trigger squad_locks_ended_guard
  before insert or update or delete on public.squad_locks
  for each row execute function public.guard_ended_competition();
create trigger match_officials_ended_guard
  before insert or update or delete on public.match_officials
  for each row execute function public.guard_ended_competition();
create trigger squad_announcements_ended_guard
  before insert or update or delete on public.squad_announcements
  for each row execute function public.guard_ended_competition();
create trigger squad_announcement_players_ended_guard
  before insert or update or delete on public.squad_announcement_players
  for each row execute function public.guard_ended_competition();

create or replace view public.competition_group_standings as
with completed_sides as (
  select b.competition_id, trim(home_entry.group_name) as group_name,
    b.home_team_id as team_id, b.home_score as goals_for, b.away_score as goals_against
  from public.match_brackets b
  join public.tournament_rounds r on r.id = b.round_id
  join public.tournament_stages s on s.id = r.stage_id and s.stage_type = 'group'
  join public.competition_teams home_entry
    on home_entry.competition_id = b.competition_id and home_entry.team_id = b.home_team_id
  join public.competition_teams away_entry
    on away_entry.competition_id = b.competition_id and away_entry.team_id = b.away_team_id
    and trim(away_entry.group_name) = trim(home_entry.group_name)
  where b.match_status = 'full_time' and nullif(trim(home_entry.group_name), '') is not null
  union all
  select b.competition_id, trim(home_entry.group_name),
    b.away_team_id, b.away_score, b.home_score
  from public.match_brackets b
  join public.tournament_rounds r on r.id = b.round_id
  join public.tournament_stages s on s.id = r.stage_id and s.stage_type = 'group'
  join public.competition_teams home_entry
    on home_entry.competition_id = b.competition_id and home_entry.team_id = b.home_team_id
  join public.competition_teams away_entry
    on away_entry.competition_id = b.competition_id and away_entry.team_id = b.away_team_id
    and trim(away_entry.group_name) = trim(home_entry.group_name)
  where b.match_status = 'full_time' and nullif(trim(home_entry.group_name), '') is not null
), totals as (
  select ct.competition_id, trim(ct.group_name) as group_name, t.id as team_id,
    t.name as team_name, t.short_name, t.logo_url,
    count(cs.team_id)::integer as played,
    count(*) filter (where cs.goals_for > cs.goals_against)::integer as wins,
    count(*) filter (where cs.goals_for = cs.goals_against)::integer as draws,
    count(*) filter (where cs.goals_for < cs.goals_against)::integer as losses,
    coalesce(sum(cs.goals_for), 0)::integer as goals_for,
    coalesce(sum(cs.goals_against), 0)::integer as goals_against,
    (coalesce(sum(cs.goals_for), 0) - coalesce(sum(cs.goals_against), 0))::integer as goal_difference,
    (count(*) filter (where cs.goals_for > cs.goals_against) * c.points_for_win
      + count(*) filter (where cs.goals_for = cs.goals_against) * c.points_for_draw
      + count(*) filter (where cs.goals_for < cs.goals_against) * c.points_for_loss)::integer as points
  from public.competition_teams ct
  join public.competitions c on c.id = ct.competition_id
  join public.universities u on u.id = c.university_id and u.is_active
  join public.teams t on t.id = ct.team_id and t.is_active
  left join completed_sides cs
    on cs.competition_id = ct.competition_id and cs.team_id = ct.team_id
      and cs.group_name = trim(ct.group_name)
  where nullif(trim(ct.group_name), '') is not null
    and (
      c.status = 'published'
      or auth.uid() is not null and public.can_manage_competition(c.id)
    )
  group by ct.competition_id, trim(ct.group_name), t.id, t.name, t.short_name, t.logo_url,
    c.points_for_win, c.points_for_draw, c.points_for_loss
), ranked as (
  select row_number() over (
      partition by competition_id, group_name
      order by points desc, goal_difference desc, goals_for desc, team_name asc, team_id asc
    )::integer as position,
    totals.*
  from totals
)
select position, competition_id, group_name, team_id, team_name, short_name, logo_url,
  played, wins, draws, losses, goals_for, goals_against, goal_difference, points,
  position <= 4 as qualified
from ranked;

grant select on public.competition_group_standings to anon, authenticated;

create or replace function public.assign_competition_team_group(
  target_competition uuid,
  target_team uuid,
  target_group text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.can_manage_competition(target_competition) then
    raise exception 'You cannot manage this competition.' using errcode = '42501';
  end if;

  if exists (select 1 from public.competitions c where c.id = target_competition and c.ended_at is not null) then
    raise exception 'This tournament has ended and is permanently read-only.' using errcode = '42501';
  end if;

  update public.competition_teams ct
  set group_name = nullif(trim(target_group), '')
  where ct.competition_id = target_competition
    and ct.team_id = target_team;

  if not found then
    raise exception 'The team is not registered in this competition.' using errcode = 'P0002';
  end if;
end;
$$;

grant execute on function public.assign_competition_team_group(uuid, uuid, text) to authenticated;
revoke execute on function public.assign_competition_team_group(uuid, uuid, text) from public, anon;

create or replace function public.seed_group_qualifiers(target_competition uuid, source_stage uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  source_order smallint;
  source_type text;
  group_names text[];
  group_count integer;
  group_index integer;
  group_one text;
  group_two text;
  seed_number integer;
  home_seed integer;
  away_seed integer;
  home_team uuid;
  away_team uuid;
  qualified_count integer;
  target_stage uuid;
  target_order smallint;
  target_round uuid;
  target_round_name text;
  fixture_count integer := 0;
begin
  if not public.can_manage_competition(target_competition) then
    raise exception 'You cannot manage this competition.' using errcode = '42501';
  end if;
  if exists (select 1 from public.competitions c where c.id = target_competition and c.ended_at is not null) then
    raise exception 'This tournament has ended and is permanently read-only.' using errcode = '42501';
  end if;

  select s.sequence_order, s.stage_type into source_order, source_type
  from public.tournament_stages s
  where s.id = source_stage and s.competition_id = target_competition;
  if source_order is null or source_type <> 'group' then
    raise exception 'Choose a group stage belonging to this competition.' using errcode = '23514';
  end if;

  if not exists (
    select 1 from public.tournament_rounds r
    join public.match_brackets b on b.round_id = r.id
    where r.stage_id = source_stage
  ) then
    raise exception 'Schedule at least one group-stage fixture before qualifying teams.' using errcode = '23514';
  end if;
  if exists (
    select 1 from public.tournament_rounds r
    join public.match_brackets b on b.round_id = r.id
    where r.stage_id = source_stage and b.match_status not in ('full_time', 'cancelled')
  ) then
    raise exception 'Complete or cancel every group-stage fixture before qualifying teams.' using errcode = '23514';
  end if;

  select array_agg(groups.group_name order by groups.group_name), count(*)::integer
  into group_names, group_count
  from (
    select distinct trim(ct.group_name) as group_name
    from public.competition_teams ct
    where ct.competition_id = target_competition
      and nullif(trim(ct.group_name), '') is not null
  ) groups;
  if group_count is null or group_count = 0 then
    raise exception 'Assign every participating team to a group before qualifying teams.' using errcode = '23514';
  end if;
  if group_count > 1 and group_count % 2 <> 0 then
    raise exception 'Automatic cross-group seeding requires one group or an even number of groups.' using errcode = '23514';
  end if;

  for group_index in 1..group_count loop
    if exists (
      select 1 from public.competition_group_standings g
      where g.competition_id = target_competition
        and g.group_name = group_names[group_index]
        and g.played = 0
    ) then
      raise exception 'Every team in group % needs a completed fixture before qualification.', group_names[group_index] using errcode = '23514';
    end if;

    select count(*)::integer into qualified_count
    from public.competition_group_standings g
    where g.competition_id = target_competition
      and g.group_name = group_names[group_index]
      and g.position <= 4;
    if qualified_count < 4 then
      raise exception 'Group % needs at least four registered teams to qualify its top four.', group_names[group_index] using errcode = '23514';
    end if;
  end loop;

  select s.id, s.sequence_order into target_stage, target_order
  from public.tournament_stages s
  where s.competition_id = target_competition
    and s.sequence_order > source_order
    and s.stage_type = 'knockout'
  order by s.sequence_order
  limit 1;

  if target_stage is null then
    select coalesce(max(s.sequence_order), 0) + 1 into target_order
    from public.tournament_stages s where s.competition_id = target_competition;
    insert into public.tournament_stages (competition_id, name, stage_type, sequence_order)
    values (target_competition, 'Knockout Stage', 'knockout', target_order)
    returning id into target_stage;
  end if;

  select r.id into target_round
  from public.tournament_rounds r
  where r.stage_id = target_stage
  order by r.round_number
  limit 1;
  if target_round is null then
    target_round_name := case
      when group_count = 1 then 'Semi-finals'
      when group_count = 2 then 'Quarter-finals'
      else 'Round of ' || (group_count * 4)::text
    end;
    insert into public.tournament_rounds (stage_id, name, round_number)
    values (target_stage, target_round_name, 1)
    returning id into target_round;
  end if;
  if exists (select 1 from public.match_brackets b where b.round_id = target_round) then
    raise exception 'The first knockout round already contains fixtures and cannot be seeded again.' using errcode = '23514';
  end if;

  if group_count = 1 then
    group_one := group_names[1];
    group_two := group_names[1];
    for seed_number in 1..2 loop
      home_seed := seed_number;
      away_seed := 5 - seed_number;
      select g.team_id into home_team from public.competition_group_standings g
      where g.competition_id = target_competition and g.group_name = group_one and g.position = home_seed;
      select g.team_id into away_team from public.competition_group_standings g
      where g.competition_id = target_competition and g.group_name = group_two and g.position = away_seed;
      insert into public.match_brackets (
        competition_id, round_id, home_team_id, away_team_id
      ) values (target_competition, target_round, home_team, away_team);
      fixture_count := fixture_count + 1;
    end loop;
  else
    for group_index in 1..group_count by 2 loop
      group_one := group_names[group_index];
      group_two := group_names[group_index + 1];
      for seed_number in 1..4 loop
        home_seed := seed_number;
        away_seed := 5 - seed_number;
        select g.team_id into home_team from public.competition_group_standings g
        where g.competition_id = target_competition and g.group_name = group_one and g.position = home_seed;
        select g.team_id into away_team from public.competition_group_standings g
        where g.competition_id = target_competition and g.group_name = group_two and g.position = away_seed;
        insert into public.match_brackets (
          competition_id, round_id, home_team_id, away_team_id
        ) values (target_competition, target_round, home_team, away_team);
        fixture_count := fixture_count + 1;
      end loop;
    end loop;
  end if;

  return target_stage;
end;
$$;

grant execute on function public.seed_group_qualifiers(uuid, uuid) to authenticated;
revoke execute on function public.seed_group_qualifiers(uuid, uuid) from public, anon;

comment on function public.seed_group_qualifiers(uuid, uuid) is
  'Seeds top-four group qualifiers into the first knockout round; pairs one group as semi-finals or adjacent alphabetical groups crosswise and returns the knockout stage.';
