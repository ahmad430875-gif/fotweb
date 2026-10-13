create extension if not exists pgcrypto with schema extensions;

create type public.app_role as enum ('super_admin', 'university_admin');
create type public.competition_type as enum ('inter_class', 'inter_university', 'inter_college', 'other');
create type public.competition_format as enum ('league', 'group_stage', 'knockout', 'league_knockout', 'round_robin');
create type public.competition_status as enum ('draft', 'published', 'archived');
create type public.team_type as enum ('class_team', 'university_team');
create type public.match_status as enum ('scheduled', 'warm_up', 'live', 'half_time', 'full_time', 'postponed', 'cancelled');
create type public.match_event_type as enum ('goal', 'penalty', 'missed_penalty', 'own_goal', 'yellow_card', 'red_card', 'substitution', 'var_review', 'injury', 'half_time', 'full_time', 'other');

create table public.universities (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 180),
  short_name text not null check (length(trim(short_name)) between 2 and 40),
  logo_url text,
  location text not null check (length(trim(location)) between 2 and 180),
  contact_email text,
  contact_phone text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create unique index universities_short_name_lower_idx on public.universities(lower(short_name));

create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role public.app_role not null,
  university_id uuid references public.universities(id) on delete restrict,
  display_name text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_profile_role_scope_check check ((role = 'super_admin' and university_id is null) or (role = 'university_admin' and university_id is not null))
);

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'user_profiles'
      and column_name = 'role' and udt_name <> 'app_role'
  ) then
    alter table public.user_profiles alter column role drop default;
    alter table public.user_profiles
      alter column role type public.app_role using role::public.app_role;
  end if;

  alter table public.user_profiles
    add column if not exists updated_at timestamptz not null default now();
  alter table public.user_profiles alter column display_name set default '';

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.user_profiles'::regclass
      and conname = 'user_profile_role_scope_check'
  ) then
    alter table public.user_profiles
      add constraint user_profile_role_scope_check
      check ((role = 'super_admin' and university_id is null)
        or (role = 'university_admin' and university_id is not null));
  end if;
end;
$$;

create index user_profiles_university_id_idx on public.user_profiles(university_id);
create unique index user_profiles_one_secretary_per_university_idx on public.user_profiles(university_id) where role = 'university_admin' and is_active;

create table public.competitions (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities(id) on delete restrict,
  name text not null check (length(trim(name)) between 2 and 180),
  season text not null check (length(trim(season)) between 4 and 30),
  type public.competition_type not null,
  start_date date not null,
  end_date date not null,
  venue text,
  format public.competition_format not null,
  status public.competition_status not null default 'draft',
  logo_url text,
  banner_url text,
  description text not null default '',
  is_locked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  check (end_date >= start_date)
);

create index competitions_university_status_idx on public.competitions(university_id, status);
create index competitions_season_idx on public.competitions(season);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities(id) on delete restrict,
  name text not null check (length(trim(name)) between 2 and 120),
  short_name text not null check (length(trim(short_name)) between 2 and 30),
  logo_url text,
  type public.team_type not null,
  academic_class text,
  is_active boolean not null default true,
  is_locked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  unique (university_id, name),
  check ((type = 'class_team' and academic_class is not null) or type = 'university_team')
);

create index teams_university_idx on public.teams(university_id);

create table public.competition_teams (
  competition_id uuid not null references public.competitions(id) on delete restrict,
  team_id uuid not null references public.teams(id) on delete restrict,
  university_id uuid not null references public.universities(id) on delete restrict,
  group_name text,
  registered_at timestamptz not null default now(),
  primary key (competition_id, team_id)
);

create index competition_teams_university_idx on public.competition_teams(university_id);

create table public.players (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities(id) on delete restrict,
  full_name text not null check (length(trim(full_name)) between 2 and 160),
  photo_url text,
  date_of_birth date,
  academic_program text,
  current_academic_year text,
  position text,
  preferred_foot text check (preferred_foot is null or preferred_foot in ('left', 'right', 'both')),
  bio text not null default '',
  is_active boolean not null default true,
  is_locked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create index players_university_name_idx on public.players(university_id, full_name);

create table public.player_registrations (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete restrict,
  team_id uuid not null references public.teams(id) on delete restrict,
  competition_id uuid not null references public.competitions(id) on delete restrict,
  university_id uuid not null references public.universities(id) on delete restrict,
  shirt_number smallint check (shirt_number between 1 and 99),
  registered_at timestamptz not null default now(),
  released_at timestamptz,
  check (released_at is null or released_at >= registered_at),
  unique (player_id, team_id, competition_id)
);

create index player_registrations_player_idx on public.player_registrations(player_id);
create index player_registrations_team_competition_idx on public.player_registrations(team_id, competition_id);
create unique index player_registration_shirt_unique on public.player_registrations(team_id, competition_id, shirt_number) where released_at is null and shirt_number is not null;

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id) on delete restrict,
  university_id uuid not null references public.universities(id) on delete restrict,
  home_team_id uuid not null references public.teams(id) on delete restrict,
  away_team_id uuid not null references public.teams(id) on delete restrict,
  round text,
  kickoff_at timestamptz not null,
  venue text,
  referee text,
  status public.match_status not null default 'scheduled',
  home_score smallint not null default 0 check (home_score >= 0),
  away_score smallint not null default 0 check (away_score >= 0),
  is_locked boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  check (home_team_id <> away_team_id)
);

create index matches_competition_kickoff_idx on public.matches(competition_id, kickoff_at);
create index matches_university_status_idx on public.matches(university_id, status, kickoff_at);

create table public.match_players (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete restrict,
  player_id uuid not null references public.players(id) on delete restrict,
  team_id uuid not null references public.teams(id) on delete restrict,
  university_id uuid not null references public.universities(id) on delete restrict,
  shirt_number smallint check (shirt_number between 1 and 99),
  is_starter boolean not null default false,
  is_captain boolean not null default false,
  position text,
  minutes_played smallint not null default 0 check (minutes_played between 0 and 150),
  created_at timestamptz not null default now(),
  unique (match_id, player_id)
);

create index match_players_player_idx on public.match_players(player_id);
create index match_players_team_match_idx on public.match_players(team_id, match_id);

create table public.match_events (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete restrict,
  university_id uuid not null references public.universities(id) on delete restrict,
  event_type public.match_event_type not null,
  minute smallint check (minute between 0 and 150),
  team_id uuid references public.teams(id) on delete restrict,
  player_id uuid references public.players(id) on delete restrict,
  related_player_id uuid references public.players(id) on delete restrict,
  assist_player_id uuid references public.players(id) on delete restrict,
  details jsonb not null default '{}'::jsonb,
  recorded_at timestamptz not null default now(),
  recorded_by uuid references auth.users(id) on delete set null
);

create index match_events_timeline_idx on public.match_events(match_id, minute, recorded_at);
create index match_events_player_idx on public.match_events(player_id, event_type);
create index match_events_assist_idx on public.match_events(assist_player_id) where assist_player_id is not null;

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities(id) on delete restrict,
  competition_id uuid references public.competitions(id) on delete restrict,
  team_id uuid references public.teams(id) on delete restrict,
  match_id uuid references public.matches(id) on delete restrict,
  player_id uuid references public.players(id) on delete restrict,
  title text not null check (length(trim(title)) between 3 and 180),
  body text not null check (length(trim(body)) between 1 and 10000),
  is_published boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create index announcements_university_published_idx on public.announcements(university_id, is_published, published_at desc);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id) on delete set null,
  university_id uuid references public.universities(id) on delete set null,
  action text not null,
  entity_table text not null,
  entity_id text,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);

create index audit_logs_created_at_idx on public.audit_logs(created_at desc);
create index audit_logs_university_created_at_idx on public.audit_logs(university_id, created_at desc);

create view public.player_career_stats with (security_invoker = true) as
select p.id as player_id,
  coalesce(mp.appearances, 0)::integer as appearances,
  coalesce(mp.starts, 0)::integer as starts,
  coalesce(mp.minutes_played, 0)::integer as minutes_played,
  coalesce(me.goals, 0)::integer as goals,
  coalesce(me.assists, 0)::integer as assists,
  coalesce(me.yellow_cards, 0)::integer as yellow_cards,
  coalesce(me.red_cards, 0)::integer as red_cards
from public.players p
left join lateral (
  select count(*) as appearances,
    count(*) filter (where mp.is_starter) as starts,
    sum(mp.minutes_played) as minutes_played
  from public.match_players mp
  join public.matches m on m.id = mp.match_id and m.status = 'full_time'
  where mp.player_id = p.id
) mp on true
left join lateral (
  select count(*) filter (where me.event_type in ('goal', 'penalty') and me.player_id = p.id) as goals,
    count(*) filter (where me.event_type = 'goal' and me.assist_player_id = p.id) as assists,
    count(*) filter (where me.event_type = 'yellow_card' and me.player_id = p.id) as yellow_cards,
    count(*) filter (where me.event_type = 'red_card' and me.player_id = p.id) as red_cards
  from public.match_events me
  join public.matches m on m.id = me.match_id and m.status = 'full_time'
  where me.player_id = p.id or me.assist_player_id = p.id
) me on true;

create view public.university_summaries with (security_invoker = true) as
select u.id, u.name, u.short_name, u.logo_url, u.location, u.contact_email,
  u.contact_phone, u.is_active, u.created_at, u.updated_at,
  (select count(*)::integer from public.competitions c where c.university_id = u.id) as competition_count,
  (select count(*)::integer from public.teams t where t.university_id = u.id) as team_count,
  (select count(*)::integer from public.players p where p.university_id = u.id) as player_count,
  (select count(*)::integer from public.matches m where m.university_id = u.id) as match_count,
  (select count(*)::integer from public.user_profiles up where up.university_id = u.id and up.role = 'university_admin') as secretary_count
from public.universities u;

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger universities_set_updated_at before update on public.universities for each row execute function public.set_updated_at();
create trigger user_profiles_set_updated_at before update on public.user_profiles for each row execute function public.set_updated_at();
create trigger competitions_set_updated_at before update on public.competitions for each row execute function public.set_updated_at();
create trigger teams_set_updated_at before update on public.teams for each row execute function public.set_updated_at();
create trigger players_set_updated_at before update on public.players for each row execute function public.set_updated_at();
create trigger matches_set_updated_at before update on public.matches for each row execute function public.set_updated_at();
create trigger announcements_set_updated_at before update on public.announcements for each row execute function public.set_updated_at();
