drop view if exists public.competition_standings;

create view public.competition_standings with (security_invoker = true) as
with completed_sides as (
  select m.competition_id, m.home_team_id as team_id, m.home_score as goals_for, m.away_score as goals_against
  from public.matches m
  where m.status = 'full_time' and m.published_at is not null
  union all
  select m.competition_id, m.away_team_id, m.away_score, m.home_score
  from public.matches m
  where m.status = 'full_time' and m.published_at is not null
), totals as (
  select ct.competition_id, c.university_id, t.id as team_id, t.name as team_name, t.short_name, t.logo_url,
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
  join public.competitions c on c.id = ct.competition_id and c.status = 'published'
  join public.universities u on u.id = c.university_id and u.is_active
  join public.teams t on t.id = ct.team_id and t.is_active
  left join completed_sides cs on cs.competition_id = ct.competition_id and cs.team_id = ct.team_id
  group by ct.competition_id, c.university_id, t.id, t.name, t.short_name, t.logo_url,
    c.points_for_win, c.points_for_draw, c.points_for_loss
)
select row_number() over (partition by competition_id order by points desc, goal_difference desc, goals_for desc, team_name)::integer as position,
  competition_id, university_id, team_id, team_name, short_name, played,
  wins as won, draws as drawn, losses as lost, goals_for, goals_against, goal_difference, points,
  logo_url, wins, draws, losses,
  goals_for as gf, goals_against as ga, goal_difference as gd, points as pts
from totals;

grant select on public.competition_standings to anon, authenticated;

create or replace view public.competition_player_stats with (security_invoker = true) as
with active_players as (
  select distinct pr.competition_id, p.university_id, p.id as player_id, p.full_name, p.photo_url, p.position,
    pr.team_id, t.name as team_name
  from public.player_registrations pr
  join public.players p on p.id = pr.player_id and p.is_active
  join public.teams t on t.id = pr.team_id and t.is_active
  join public.competitions c on c.id = pr.competition_id and c.status = 'published'
  where pr.released_at is null
), actual_appearances as (
  select m.competition_id, mp.match_id, mp.player_id, mp.team_id, mp.is_starter, mp.minutes_played
  from public.match_players mp
  join public.matches m on m.id = mp.match_id and m.status = 'full_time' and m.published_at is not null
  where mp.is_starter or mp.minutes_played > 0 or exists (
    select 1 from public.match_events e
    where e.match_id = mp.match_id and not e.is_reversed and e.event_type = 'substitution'
      and (e.player_id = mp.player_id or e.related_player_id = mp.player_id)
  )
), appearance_totals as (
  select competition_id, player_id, count(distinct match_id)::integer as appearances,
    count(distinct match_id) filter (where is_starter)::integer as starts,
    coalesce(sum(minutes_played), 0)::integer as minutes_played
  from actual_appearances
  group by competition_id, player_id
), event_totals as (
  select m.competition_id, e.player_id,
    count(*) filter (where e.event_type in ('goal', 'penalty') and e.team_id is not null)::integer as goals,
    count(*) filter (where e.event_type = 'yellow_card')::integer as yellow_cards,
    count(*) filter (where e.event_type = 'red_card')::integer as red_cards
  from public.match_events e
  join public.matches m on m.id = e.match_id and m.status = 'full_time' and m.published_at is not null
  where not e.is_reversed and e.player_id is not null
  group by m.competition_id, e.player_id
), assist_totals as (
  select m.competition_id, e.assist_player_id as player_id, count(*)::integer as assists
  from public.match_events e
  join public.matches m on m.id = e.match_id and m.status = 'full_time' and m.published_at is not null
  where not e.is_reversed and e.event_type in ('goal', 'penalty') and e.assist_player_id is not null
  group by m.competition_id, e.assist_player_id
), clean_sheet_totals as (
  select aa.competition_id, aa.player_id, count(distinct aa.match_id)::integer as clean_sheets
  from actual_appearances aa
  join public.players p on p.id = aa.player_id
  join public.matches m on m.id = aa.match_id
  where lower(coalesce(p.position, '')) like '%goalkeeper%'
    and ((aa.team_id = m.home_team_id and m.away_score = 0)
      or (aa.team_id = m.away_team_id and m.home_score = 0))
  group by aa.competition_id, aa.player_id
)
select ap.competition_id, ap.university_id, ap.player_id, ap.full_name, ap.photo_url, ap.team_id, ap.team_name,
  coalesce(at.appearances, 0)::integer as appearances,
  coalesce(at.starts, 0)::integer as starts,
  coalesce(at.minutes_played, 0)::integer as minutes_played,
  coalesce(et.goals, 0)::integer as goals,
  coalesce(ast.assists, 0)::integer as assists,
  coalesce(et.yellow_cards, 0)::integer as yellow_cards,
  coalesce(et.red_cards, 0)::integer as red_cards,
  coalesce(cst.clean_sheets, 0)::integer as clean_sheets
from active_players ap
left join appearance_totals at on at.competition_id = ap.competition_id and at.player_id = ap.player_id
left join event_totals et on et.competition_id = ap.competition_id and et.player_id = ap.player_id
left join assist_totals ast on ast.competition_id = ap.competition_id and ast.player_id = ap.player_id
left join clean_sheet_totals cst on cst.competition_id = ap.competition_id and cst.player_id = ap.player_id;

grant select on public.competition_player_stats to anon, authenticated;

create or replace function public.protect_competition_publication()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not public.is_super_admin() and new.status is distinct from old.status then
    raise exception 'Only a Super Admin can publish or archive a competition.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger competitions_protect_publication
  before update of status on public.competitions
  for each row execute function public.protect_competition_publication();

drop policy if exists matches_admin_update on public.matches;
create policy matches_admin_update on public.matches for update to authenticated
  using ((select public.can_manage_university(university_id)) and (
    (select public.is_super_admin()) or (not is_locked and exists (
      select 1 from public.competitions c where c.id = matches.competition_id and not c.is_locked
    ))
  ))
  with check ((select public.can_manage_university(university_id)) and (
    (select public.is_super_admin()) or (not is_locked and exists (
      select 1 from public.competitions c where c.id = matches.competition_id and not c.is_locked
    ))
  ));

drop policy if exists squad_announcement_players_admin_insert on public.squad_announcement_players;
create policy squad_announcement_players_admin_insert on public.squad_announcement_players for insert to authenticated
  with check (exists (
    select 1 from public.squad_announcements sa
    join public.teams t on t.id = sa.team_id
    join public.competitions c on c.id = sa.competition_id
    where sa.id = squad_announcement_players.announcement_id and not sa.is_published
      and (select public.can_manage_university(sa.university_id))
      and ((select public.is_super_admin()) or (not t.is_locked and not c.is_locked))
  ));

drop policy if exists squad_announcement_players_admin_update on public.squad_announcement_players;
create policy squad_announcement_players_admin_update on public.squad_announcement_players for update to authenticated
  using (exists (
    select 1 from public.squad_announcements sa
    join public.teams t on t.id = sa.team_id
    join public.competitions c on c.id = sa.competition_id
    where sa.id = squad_announcement_players.announcement_id and not sa.is_published
      and (select public.can_manage_university(sa.university_id))
      and ((select public.is_super_admin()) or (not t.is_locked and not c.is_locked))
  ))
  with check (exists (
    select 1 from public.squad_announcements sa
    join public.teams t on t.id = sa.team_id
    join public.competitions c on c.id = sa.competition_id
    where sa.id = squad_announcement_players.announcement_id and not sa.is_published
      and (select public.can_manage_university(sa.university_id))
      and ((select public.is_super_admin()) or (not t.is_locked and not c.is_locked))
  ));

drop policy if exists squad_announcement_players_admin_delete on public.squad_announcement_players;
create policy squad_announcement_players_admin_delete on public.squad_announcement_players for delete to authenticated
  using (exists (
    select 1 from public.squad_announcements sa
    join public.teams t on t.id = sa.team_id
    join public.competitions c on c.id = sa.competition_id
    where sa.id = squad_announcement_players.announcement_id and not sa.is_published
      and (select public.can_manage_university(sa.university_id))
      and ((select public.is_super_admin()) or (not t.is_locked and not c.is_locked))
  ));

create or replace function public.add_match_phase_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status and new.status in ('half_time', 'full_time') then
    insert into public.match_events(match_id, university_id, event_type, minute, recorded_by)
    values (new.id, new.university_id, new.status::text::public.match_event_type,
      case when new.status = 'half_time' then 45 else 90 end, (select auth.uid()))
    on conflict do nothing;
  end if;
  return new;
end;
$$;

create trigger matches_add_phase_event
  after update of status on public.matches
  for each row execute function public.add_match_phase_event();

revoke execute on function public.protect_competition_publication() from public, anon, authenticated;
revoke execute on function public.add_match_phase_event() from public, anon, authenticated;

create or replace function public.sync_match_score_from_events()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_match uuid;
  previous_match uuid;
begin
  if tg_op <> 'INSERT' then
    previous_match := old.match_id;
  end if;
  if tg_op = 'DELETE' then
    target_match := old.match_id;
  else
    target_match := new.match_id;
  end if;

  update public.matches m set
    home_score = (
      select count(*)::smallint from public.match_events e
      where e.match_id = target_match and not e.is_reversed
        and ((e.team_id = m.home_team_id and e.event_type in ('goal', 'penalty'))
          or (e.team_id = m.away_team_id and e.event_type = 'own_goal'))
    ),
    away_score = (
      select count(*)::smallint from public.match_events e
      where e.match_id = target_match and not e.is_reversed
        and ((e.team_id = m.away_team_id and e.event_type in ('goal', 'penalty'))
          or (e.team_id = m.home_team_id and e.event_type = 'own_goal'))
    )
  where m.id = target_match;

  if previous_match is not null and previous_match is distinct from target_match then
    update public.matches m set
      home_score = (
        select count(*)::smallint from public.match_events e
        where e.match_id = previous_match and not e.is_reversed
          and ((e.team_id = m.home_team_id and e.event_type in ('goal', 'penalty'))
            or (e.team_id = m.away_team_id and e.event_type = 'own_goal'))
      ),
      away_score = (
        select count(*)::smallint from public.match_events e
        where e.match_id = previous_match and not e.is_reversed
          and ((e.team_id = m.away_team_id and e.event_type in ('goal', 'penalty'))
            or (e.team_id = m.home_team_id and e.event_type = 'own_goal'))
      )
    where m.id = previous_match;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop policy if exists match_players_admin_update on public.match_players;
create policy match_players_admin_update on public.match_players for update to authenticated
  using ((select public.can_manage_university(university_id)) and exists (
    select 1 from public.matches m where m.id = match_players.match_id
      and ((select public.is_super_admin()) or (not m.is_locked and exists (
        select 1 from public.competitions c where c.id = m.competition_id and not c.is_locked
      )))
  ))
  with check ((select public.can_manage_university(university_id)) and exists (
    select 1 from public.matches m where m.id = match_players.match_id
      and ((select public.is_super_admin()) or (not m.is_locked and exists (
        select 1 from public.competitions c where c.id = m.competition_id and not c.is_locked
      )))
  ));

drop policy if exists match_events_admin_update on public.match_events;
create policy match_events_admin_update on public.match_events for update to authenticated
  using ((select public.can_manage_university(university_id)) and exists (
    select 1 from public.matches m where m.id = match_events.match_id
      and ((select public.is_super_admin()) or (not m.is_locked and exists (
        select 1 from public.competitions c where c.id = m.competition_id and not c.is_locked
      )))
  ))
  with check ((select public.can_manage_university(university_id)) and exists (
    select 1 from public.matches m where m.id = match_events.match_id
      and ((select public.is_super_admin()) or (not m.is_locked and exists (
        select 1 from public.competitions c where c.id = m.competition_id and not c.is_locked
      )))
  ));

comment on view public.competition_standings is 'Published match standings using the owning competition point rules; includes both legacy aliases and named metrics.';
comment on view public.competition_player_stats is 'Competition player statistics calculated from completed match lineups and non-reversed events.';