alter table public.competition_teams
  drop constraint competition_teams_competition_id_fkey,
  add constraint competition_teams_competition_id_fkey
    foreign key (competition_id) references public.competitions(id) on delete cascade;

alter table public.player_registrations
  drop constraint player_registrations_competition_id_fkey,
  add constraint player_registrations_competition_id_fkey
    foreign key (competition_id) references public.competitions(id) on delete cascade;

alter table public.matches
  drop constraint matches_competition_id_fkey,
  add constraint matches_competition_id_fkey
    foreign key (competition_id) references public.competitions(id) on delete cascade;

alter table public.match_players
  drop constraint match_players_match_id_fkey,
  add constraint match_players_match_id_fkey
    foreign key (match_id) references public.matches(id) on delete cascade;

alter table public.match_events
  drop constraint match_events_match_id_fkey,
  add constraint match_events_match_id_fkey
    foreign key (match_id) references public.matches(id) on delete cascade;

alter table public.announcements
  drop constraint announcements_competition_id_fkey,
  add constraint announcements_competition_id_fkey
    foreign key (competition_id) references public.competitions(id) on delete cascade,
  drop constraint announcements_match_id_fkey,
  add constraint announcements_match_id_fkey
    foreign key (match_id) references public.matches(id) on delete cascade;

alter table public.squad_announcements
  drop constraint squad_announcements_competition_id_fkey,
  add constraint squad_announcements_competition_id_fkey
    foreign key (competition_id) references public.competitions(id) on delete cascade,
  drop constraint squad_announcements_match_id_fkey,
  add constraint squad_announcements_match_id_fkey
    foreign key (match_id) references public.matches(id) on delete cascade;

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

    if old.ended_at is not null and not (tg_op = 'DELETE' and public.is_super_admin()) then
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
    if coalesce(ended, false) and not (tg_op = 'DELETE' and public.is_super_admin()) then
      raise exception 'This tournament has ended and is permanently read-only.' using errcode = '42501';
    end if;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function public.create_club_friendly_match(
  target_university uuid,
  target_home_team uuid,
  target_away_team uuid,
  target_kickoff timestamptz,
  target_venue text default null,
  target_referee text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  organizer_university uuid;
  home_university uuid;
  away_university uuid;
  season_start_year integer;
  friendly_season text;
  competition_id uuid;
  match_id uuid;
begin
  if not public.is_super_admin() then
    raise exception 'Only a Super Admin can create Club Friendly fixtures.' using errcode = '42501';
  end if;
  if target_home_team = target_away_team or target_kickoff is null then
    raise exception 'Choose two different teams and a kick-off time.' using errcode = '23514';
  end if;

  select u.id into organizer_university
  from public.universities u
  where u.id = target_university and u.is_active
  for update;
  if organizer_university is null then
    raise exception 'The selected organizing university is not active.' using errcode = '23514';
  end if;

  select t.university_id into home_university
  from public.teams t
  join public.universities u on u.id = t.university_id and u.is_active
  where t.id = target_home_team and t.is_active and t.type = 'university_team';
  select t.university_id into away_university
  from public.teams t
  join public.universities u on u.id = t.university_id and u.is_active
  where t.id = target_away_team and t.is_active and t.type = 'university_team';
  if home_university is null or away_university is null then
    raise exception 'Choose active university teams.' using errcode = '23514';
  end if;

  season_start_year := extract(year from target_kickoff)::integer
    - case when extract(month from target_kickoff) < 7 then 1 else 0 end;
  friendly_season := season_start_year::text || '/' || (season_start_year + 1)::text;

  select c.id into competition_id
  from public.competitions c
  where c.university_id = organizer_university
    and c.type = 'clubfriendly'::public.competition_type
    and c.season = friendly_season
    and c.status = 'published'
    and c.ended_at is null
  order by c.created_at desc
  limit 1
  for update;

  if competition_id is null then
    insert into public.competitions (
      university_id, name, season, type, start_date, end_date, format,
      status, description, is_primary, points_for_win, points_for_draw, points_for_loss
    ) values (
      organizer_university, 'Club Friendly', friendly_season, 'clubfriendly'::public.competition_type,
      make_date(season_start_year, 7, 1), make_date(season_start_year + 1, 6, 30),
      'round_robin', 'published', 'Club Friendly fixtures', false, 3, 1, 0
    ) returning id into competition_id;
  end if;

  insert into public.competition_participants (
    competition_id, university_id, participation_status, invited_by, invited_at, responded_at
  )
  select competition_id, participant.university_id, 'accepted', auth.uid(), now(), now()
  from (values (home_university), (away_university)) as participant(university_id)
  where participant.university_id <> organizer_university
  on conflict (competition_id, university_id) do update
    set participation_status = 'accepted', invited_by = auth.uid(), responded_at = now();

  insert into public.competition_teams (competition_id, team_id, university_id)
  values (competition_id, target_home_team, home_university),
    (competition_id, target_away_team, away_university)
  on conflict (competition_id, team_id) do update
    set university_id = excluded.university_id;

  insert into public.matches (
    competition_id, university_id, home_team_id, away_team_id, kickoff_at,
    venue, referee, status, published_at, created_by
  ) values (
    competition_id, organizer_university, target_home_team, target_away_team,
    target_kickoff, nullif(trim(target_venue), ''), nullif(trim(target_referee), ''),
    'scheduled', now(), auth.uid()
  ) returning id into match_id;

  return match_id;
end;
$$;

create or replace function public.super_admin_delete_match(target_match uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Only a Super Admin can delete fixtures.' using errcode = '42501';
  end if;
  delete from public.matches where id = target_match;
  if not found then
    raise exception 'The fixture does not exist.' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.super_admin_delete_competition(target_competition uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Only a Super Admin can delete tournaments.' using errcode = '42501';
  end if;
  delete from public.competitions where id = target_competition;
  if not found then
    raise exception 'The tournament does not exist.' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.create_club_friendly_match(uuid, uuid, uuid, timestamptz, text, text) from public, anon;
revoke all on function public.super_admin_delete_match(uuid) from public, anon;
revoke all on function public.super_admin_delete_competition(uuid) from public, anon;
grant execute on function public.create_club_friendly_match(uuid, uuid, uuid, timestamptz, text, text) to authenticated;
grant execute on function public.super_admin_delete_match(uuid) to authenticated;
grant execute on function public.super_admin_delete_competition(uuid) to authenticated;