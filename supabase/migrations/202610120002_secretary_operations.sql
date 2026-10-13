alter table public.teams
  add column if not exists team_photo_url text,
  add column if not exists season text,
  add column if not exists coach_name text,
  add column if not exists captain_player_id uuid,
  add column if not exists vice_captain_player_id uuid;

alter table public.players
  add column if not exists student_identifier text,
  add column if not exists height_cm smallint,
  add column if not exists injury_status text not null default 'fit',
  add column if not exists public_injury_status boolean not null default false,
  add column if not exists is_available boolean not null default true;

alter table public.competitions
  add column if not exists is_primary boolean not null default false,
  add column if not exists points_for_win smallint not null default 3,
  add column if not exists points_for_draw smallint not null default 1,
  add column if not exists points_for_loss smallint not null default 0;

alter table public.match_players
  add column if not exists is_vice_captain boolean not null default false;

alter table public.match_events
  add column if not exists stoppage_minute smallint,
  add column if not exists is_reversed boolean not null default false,
  add column if not exists reversed_at timestamptz,
  add column if not exists reversed_by uuid references auth.users(id) on delete set null,
  add column if not exists correction_note text,
  add column if not exists action_key uuid not null default gen_random_uuid();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'players_injury_status_check' and conrelid = 'public.players'::regclass) then
    alter table public.players add constraint players_injury_status_check check (injury_status in ('fit', 'injured', 'recovering'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'players_height_cm_check' and conrelid = 'public.players'::regclass) then
    alter table public.players add constraint players_height_cm_check check (height_cm is null or height_cm between 100 and 240);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'competitions_points_check' and conrelid = 'public.competitions'::regclass) then
    alter table public.competitions add constraint competitions_points_check check (points_for_win between 0 and 10 and points_for_draw between 0 and 10 and points_for_loss between 0 and 10);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'match_events_stoppage_minute_check' and conrelid = 'public.match_events'::regclass) then
    alter table public.match_events add constraint match_events_stoppage_minute_check check (stoppage_minute is null or stoppage_minute between 0 and 30);
  end if;
end;
$$;

create unique index if not exists players_student_identifier_university_idx
  on public.players(university_id, lower(student_identifier))
  where student_identifier is not null and length(trim(student_identifier)) > 0;

create unique index if not exists match_events_action_key_idx on public.match_events(match_id, action_key);
create unique index if not exists match_events_prevent_duplicate_idx
  on public.match_events(match_id, event_type, minute, team_id, player_id)
  where not is_reversed and minute is not null and player_id is not null
    and event_type in ('goal', 'penalty', 'missed_penalty', 'own_goal', 'yellow_card', 'red_card');
create unique index if not exists match_events_one_half_time_idx on public.match_events(match_id) where event_type = 'half_time' and not is_reversed;
create unique index if not exists match_events_one_full_time_idx on public.match_events(match_id) where event_type = 'full_time' and not is_reversed;

alter table public.teams
  add constraint teams_captain_player_fk foreign key (captain_player_id) references public.players(id) on delete set null,
  add constraint teams_vice_captain_player_fk foreign key (vice_captain_player_id) references public.players(id) on delete set null;

create table public.squad_announcements (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities(id) on delete restrict,
  team_id uuid not null references public.teams(id) on delete restrict,
  competition_id uuid not null references public.competitions(id) on delete restrict,
  match_id uuid references public.matches(id) on delete restrict,
  title text not null check (length(trim(title)) between 3 and 180),
  description text not null default '',
  formation text not null default '4-3-3',
  is_published boolean not null default false,
  published_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index squad_announcements_public_idx on public.squad_announcements(competition_id, published_at desc) where is_published;

create table public.squad_announcement_players (
  announcement_id uuid not null references public.squad_announcements(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete restrict,
  squad_role text not null check (squad_role in ('starting_xi', 'substitute')),
  shirt_number smallint check (shirt_number between 1 and 99),
  position text,
  is_captain boolean not null default false,
  is_goalkeeper boolean not null default false,
  sort_order smallint not null default 0,
  primary key (announcement_id, player_id)
);

create unique index squad_announcement_one_captain_idx on public.squad_announcement_players(announcement_id) where is_captain;
create unique index squad_announcement_shirt_idx on public.squad_announcement_players(announcement_id, shirt_number) where shirt_number is not null;

create function public.validate_team_leaders()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.captain_player_id is not null and not exists (
    select 1 from public.players p where p.id = new.captain_player_id and p.university_id = new.university_id
  ) then
    raise exception 'Team captain must be a player from the same university.' using errcode = '23514';
  end if;
  if new.vice_captain_player_id is not null and not exists (
    select 1 from public.players p where p.id = new.vice_captain_player_id and p.university_id = new.university_id
  ) then
    raise exception 'Team vice-captain must be a player from the same university.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger teams_validate_leaders before insert or update of university_id, captain_player_id, vice_captain_player_id
  on public.teams for each row execute function public.validate_team_leaders();

create function public.validate_squad_announcement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  starter_count integer;
  captain_count integer;
  goalkeeper_count integer;
begin
  if not exists (
    select 1 from public.teams t
    join public.competitions c on c.id = new.competition_id and c.university_id = new.university_id
    join public.competition_teams ct on ct.competition_id = c.id and ct.team_id = t.id
    where t.id = new.team_id and t.university_id = new.university_id
  ) then
    raise exception 'Team must be registered in this university competition.' using errcode = '23514';
  end if;
  if new.match_id is not null and not exists (
    select 1 from public.matches m where m.id = new.match_id and m.competition_id = new.competition_id and new.team_id in (m.home_team_id, m.away_team_id)
  ) then
    raise exception 'The selected match must belong to this competition and include this team.' using errcode = '23514';
  end if;
  if new.is_published then
    select count(*) filter (where squad_role = 'starting_xi'), count(*) filter (where is_captain and squad_role = 'starting_xi'), count(*) filter (where is_goalkeeper and squad_role = 'starting_xi')
      into starter_count, captain_count, goalkeeper_count
      from public.squad_announcement_players where announcement_id = new.id;
    if starter_count <> 11 or captain_count <> 1 or goalkeeper_count <> 1 then
      raise exception 'A published squad needs eleven starters, one captain, and one goalkeeper.' using errcode = '23514';
    end if;
    new.published_at := coalesce(new.published_at, now());
  else
    new.published_at := null;
  end if;
  return new;
end;
$$;

create trigger squad_announcements_validate before insert or update on public.squad_announcements
  for each row execute function public.validate_squad_announcement();

create function public.validate_squad_announcement_player()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  announcement public.squad_announcements%rowtype;
begin
  select * into announcement from public.squad_announcements where id = new.announcement_id;
  if announcement.id is null then
    raise exception 'Squad announcement not found.' using errcode = '23503';
  end if;
  if announcement.is_published then
    raise exception 'Withdraw the squad announcement before editing its lineup.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.players p
    join public.player_registrations pr on pr.player_id = p.id
    where p.id = new.player_id and p.university_id = announcement.university_id and p.is_active
      and pr.team_id = announcement.team_id and pr.competition_id = announcement.competition_id and pr.released_at is null
  ) then
    raise exception 'Player must be active and registered for this team and competition.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger squad_announcement_players_validate before insert or update on public.squad_announcement_players
  for each row execute function public.validate_squad_announcement_player();

create function public.sync_match_score_from_events()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_match uuid;
begin
  if tg_op = 'DELETE' then
    target_match := old.match_id;
  else
    target_match := new.match_id;
  end if;
  update public.matches m set
    home_score = (select count(*)::smallint from public.match_events e where e.match_id = target_match and not e.is_reversed and e.team_id = m.home_team_id and e.event_type in ('goal', 'penalty', 'own_goal')),
    away_score = (select count(*)::smallint from public.match_events e where e.match_id = target_match and not e.is_reversed and e.team_id = m.away_team_id and e.event_type in ('goal', 'penalty', 'own_goal'))
  where m.id = target_match;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger match_events_sync_score after insert or update or delete on public.match_events
  for each row execute function public.sync_match_score_from_events();

create or replace view public.competition_standings with (security_invoker = true) as
with completed_matches as (
  select m.competition_id, m.home_team_id as team_id, m.home_score as goals_for, m.away_score as goals_against
  from public.matches m where m.status = 'full_time' and m.published_at is not null
  union all
  select m.competition_id, m.away_team_id, m.away_score, m.home_score
  from public.matches m where m.status = 'full_time' and m.published_at is not null
), totals as (
  select ct.competition_id, c.university_id, t.id as team_id, t.name as team_name, t.short_name,
    count(cm.team_id)::integer as played,
    count(*) filter (where cm.goals_for > cm.goals_against)::integer as won,
    count(*) filter (where cm.goals_for = cm.goals_against)::integer as drawn,
    count(*) filter (where cm.goals_for < cm.goals_against)::integer as lost,
    coalesce(sum(cm.goals_for), 0)::integer as goals_for,
    coalesce(sum(cm.goals_against), 0)::integer as goals_against,
    (coalesce(sum(cm.goals_for), 0) - coalesce(sum(cm.goals_against), 0))::integer as goal_difference,
    (count(*) filter (where cm.goals_for > cm.goals_against) * c.points_for_win
      + count(*) filter (where cm.goals_for = cm.goals_against) * c.points_for_draw
      + count(*) filter (where cm.goals_for < cm.goals_against) * c.points_for_loss)::integer as points
  from public.competition_teams ct
  join public.competitions c on c.id = ct.competition_id and c.status = 'published'
  join public.universities u on u.id = c.university_id and u.is_active
  join public.teams t on t.id = ct.team_id
  left join completed_matches cm on cm.competition_id = ct.competition_id and cm.team_id = ct.team_id
  group by ct.competition_id, c.university_id, t.id, t.name, t.short_name, c.points_for_win, c.points_for_draw, c.points_for_loss
)
select row_number() over (partition by competition_id order by points desc, goal_difference desc, goals_for desc, team_name)::integer as position,
  competition_id, university_id, team_id, team_name, short_name, played, won, drawn, lost, goals_for, goals_against, goal_difference, points
from totals;

create or replace view public.competition_player_stats with (security_invoker = true) as
with active_players as (
  select distinct pr.competition_id, p.university_id, p.id as player_id, p.full_name, p.photo_url, pr.team_id, t.name as team_name
  from public.player_registrations pr
  join public.players p on p.id = pr.player_id and p.is_active
  join public.teams t on t.id = pr.team_id
  join public.competitions c on c.id = pr.competition_id and c.status = 'published'
  where pr.released_at is null
), appearances as (
  select mp.match_id, m.competition_id, mp.player_id, count(*)::integer as appearances,
    count(*) filter (where mp.is_starter)::integer as starts,
    coalesce(sum(mp.minutes_played), 0)::integer as minutes_played
  from public.match_players mp
  join public.matches m on m.id = mp.match_id and m.status = 'full_time' and m.published_at is not null
  group by mp.match_id, m.competition_id, mp.player_id
), appearance_totals as (
  select competition_id, player_id, sum(appearances)::integer as appearances, sum(starts)::integer as starts, sum(minutes_played)::integer as minutes_played
  from appearances group by competition_id, player_id
), event_totals as (
  select m.competition_id, e.player_id,
    count(*) filter (where e.event_type in ('goal', 'penalty') and e.team_id is not null)::integer as goals,
    count(*) filter (where e.event_type = 'goal' and e.assist_player_id is not null)::integer as assists,
    count(*) filter (where e.event_type = 'yellow_card')::integer as yellow_cards,
    count(*) filter (where e.event_type = 'red_card')::integer as red_cards
  from public.match_events e join public.matches m on m.id = e.match_id and m.status = 'full_time' and m.published_at is not null
  where not e.is_reversed and e.player_id is not null
  group by m.competition_id, e.player_id
)
select ap.competition_id, ap.university_id, ap.player_id, ap.full_name, ap.photo_url, ap.team_id, ap.team_name,
  coalesce(at.appearances, 0) as appearances, coalesce(at.starts, 0) as starts, coalesce(at.minutes_played, 0) as minutes_played,
  coalesce(et.goals, 0) as goals, coalesce(et.assists, 0) as assists, coalesce(et.yellow_cards, 0) as yellow_cards, coalesce(et.red_cards, 0) as red_cards
from active_players ap
left join appearance_totals at on at.competition_id = ap.competition_id and at.player_id = ap.player_id
left join event_totals et on et.competition_id = ap.competition_id and et.player_id = ap.player_id;

create view public.public_player_profiles with (security_barrier = true) as
select p.id, p.university_id, p.full_name, p.photo_url, p.academic_program, p.current_academic_year,
  p.position, p.preferred_foot, p.bio,
  case when p.public_injury_status then p.injury_status else null end as injury_status,
  p.is_active
from public.players p
where p.is_active and exists (
  select 1 from public.player_registrations pr
  join public.competitions c on c.id = pr.competition_id and c.status = 'published'
  join public.universities u on u.id = c.university_id and u.is_active
  where pr.player_id = p.id and pr.released_at is null
);

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
drop policy if exists competitions_admin_update on public.competitions;
create policy competitions_admin_insert on public.competitions for insert to authenticated
  with check ((select public.can_manage_university(university_id)) and not is_locked);
create policy competitions_admin_update on public.competitions for update to authenticated
  using ((select public.can_manage_university(university_id)) and ((select public.is_super_admin()) or not is_locked))
  with check ((select public.can_manage_university(university_id)) and ((select public.is_super_admin()) or not is_locked));

drop policy if exists competition_teams_admin_insert on public.competition_teams;
drop policy if exists competition_teams_admin_update on public.competition_teams;
drop policy if exists competition_teams_admin_delete on public.competition_teams;
create policy competition_teams_admin_insert on public.competition_teams for insert to authenticated
  with check ((select public.can_manage_university(university_id)) and exists (
    select 1 from public.competitions c join public.teams t on t.id = competition_teams.team_id
    where c.id = competition_teams.competition_id and c.university_id = competition_teams.university_id
      and ((select public.is_super_admin()) or (not c.is_locked and not t.is_locked))
  ));
create policy competition_teams_admin_update on public.competition_teams for update to authenticated
  using ((select public.can_manage_university(university_id))) with check (
    (select public.can_manage_university(university_id)) and exists (
      select 1 from public.competitions c join public.teams t on t.id = competition_teams.team_id
      where c.id = competition_teams.competition_id and c.university_id = competition_teams.university_id
        and ((select public.is_super_admin()) or (not c.is_locked and not t.is_locked))
    ));
create policy competition_teams_admin_delete on public.competition_teams for delete to authenticated
  using ((select public.can_manage_university(university_id)) and exists (
    select 1 from public.competitions c join public.teams t on t.id = competition_teams.team_id
    where c.id = competition_teams.competition_id and ((select public.is_super_admin()) or (not c.is_locked and not t.is_locked))
  ));

drop policy if exists match_events_public_read on public.match_events;
create policy match_events_public_read on public.match_events for select to anon, authenticated
  using (not is_reversed and exists (
    select 1 from public.matches m join public.competitions c on c.id = m.competition_id
    join public.universities u on u.id = c.university_id
    where m.id = match_events.match_id and m.published_at is not null and c.status = 'published' and u.is_active
  ));

alter table public.squad_announcements enable row level security;
alter table public.squad_announcement_players enable row level security;

revoke select on public.players from anon;
grant select (id, university_id, full_name, photo_url, academic_program, current_academic_year, position, preferred_foot, bio, is_active, created_at, updated_at) on public.players to anon;
grant select on public.squad_announcements, public.squad_announcement_players, public.competition_standings, public.competition_player_stats, public.public_player_profiles to anon, authenticated;
grant select, insert, update, delete on public.squad_announcements, public.squad_announcement_players to authenticated;
grant select on public.competition_standings, public.competition_player_stats to authenticated;

create policy squad_announcements_public_read on public.squad_announcements for select to anon, authenticated
  using (is_published and exists (
    select 1 from public.competitions c join public.universities u on u.id = c.university_id
    where c.id = squad_announcements.competition_id and c.status = 'published' and u.is_active
  ));
create policy squad_announcements_admin_read on public.squad_announcements for select to authenticated
  using ((select public.can_manage_university(university_id)));
create policy squad_announcements_admin_insert on public.squad_announcements for insert to authenticated
  with check ((select public.can_manage_university(university_id)) and not exists (
    select 1 from public.teams t join public.competitions c on c.id = squad_announcements.competition_id
    where t.id = squad_announcements.team_id and (t.is_locked or c.is_locked)
  ));
create policy squad_announcements_admin_update on public.squad_announcements for update to authenticated
  using ((select public.can_manage_university(university_id)) and (select public.is_super_admin() or not exists (
    select 1 from public.teams t join public.competitions c on c.id = squad_announcements.competition_id
    where t.id = squad_announcements.team_id and (t.is_locked or c.is_locked)
  )))
  with check ((select public.can_manage_university(university_id)) and (select public.is_super_admin() or not exists (
    select 1 from public.teams t join public.competitions c on c.id = squad_announcements.competition_id
    where t.id = squad_announcements.team_id and (t.is_locked or c.is_locked)
  )));
create policy squad_announcements_admin_delete on public.squad_announcements for delete to authenticated
  using ((select public.can_manage_university(university_id)) and (select public.is_super_admin() or not exists (
    select 1 from public.teams t join public.competitions c on c.id = squad_announcements.competition_id
    where t.id = squad_announcements.team_id and (t.is_locked or c.is_locked)
  )));

create policy squad_announcement_players_public_read on public.squad_announcement_players for select to anon, authenticated
  using (exists (
    select 1 from public.squad_announcements sa join public.competitions c on c.id = sa.competition_id
    where sa.id = squad_announcement_players.announcement_id and sa.is_published and c.status = 'published'
  ));
create policy squad_announcement_players_admin_read on public.squad_announcement_players for select to authenticated
  using (exists (select 1 from public.squad_announcements sa where sa.id = squad_announcement_players.announcement_id and (select public.can_manage_university(sa.university_id))));
create policy squad_announcement_players_admin_insert on public.squad_announcement_players for insert to authenticated
  with check (exists (select 1 from public.squad_announcements sa where sa.id = squad_announcement_players.announcement_id and not sa.is_published and (select public.can_manage_university(sa.university_id))));
create policy squad_announcement_players_admin_update on public.squad_announcement_players for update to authenticated
  using (exists (select 1 from public.squad_announcements sa where sa.id = squad_announcement_players.announcement_id and not sa.is_published and (select public.can_manage_university(sa.university_id))))
  with check (exists (select 1 from public.squad_announcements sa where sa.id = squad_announcement_players.announcement_id and not sa.is_published and (select public.can_manage_university(sa.university_id))));
create policy squad_announcement_players_admin_delete on public.squad_announcement_players for delete to authenticated
  using (exists (select 1 from public.squad_announcements sa where sa.id = squad_announcement_players.announcement_id and not sa.is_published and (select public.can_manage_university(sa.university_id))));

create trigger squad_announcements_set_updated_at before update on public.squad_announcements for each row execute function public.set_updated_at();

revoke select on public.public_player_profiles from public, anon;
grant select on public.public_player_profiles to anon, authenticated;
revoke execute on function public.validate_team_leaders() from public, anon, authenticated;
revoke execute on function public.validate_squad_announcement() from public, anon, authenticated;
revoke execute on function public.validate_squad_announcement_player() from public, anon, authenticated;
revoke execute on function public.sync_match_score_from_events() from public, anon, authenticated;

comment on table public.squad_announcements is 'Published starting XIs and substitutes for a team, competition, or match.';
comment on view public.competition_standings is 'Standings calculated from published full-time matches and competition point rules.';
comment on view public.public_player_profiles is 'Publicly visible registered player fields; injury status is exposed only by per-player opt-in.';
