create table public.tournament_stages (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  name text not null check (length(trim(name)) between 2 and 120),
  stage_type text not null check (stage_type in ('group', 'knockout', 'league')),
  sequence_order smallint not null check (sequence_order > 0),
  created_at timestamptz not null default now(),
  unique (competition_id, sequence_order)
);

create index tournament_stages_competition_order_idx
  on public.tournament_stages(competition_id, sequence_order);

create table public.tournament_rounds (
  id uuid primary key default gen_random_uuid(),
  stage_id uuid not null references public.tournament_stages(id) on delete cascade,
  name text not null check (length(trim(name)) between 2 and 120),
  round_number smallint not null check (round_number > 0),
  created_at timestamptz not null default now(),
  unique (stage_id, round_number)
);

create index tournament_rounds_stage_order_idx
  on public.tournament_rounds(stage_id, round_number);

create table public.match_brackets (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.tournament_rounds(id) on delete cascade,
  competition_id uuid not null references public.competitions(id) on delete cascade,
  home_team_id uuid not null references public.teams(id) on delete cascade,
  away_team_id uuid not null references public.teams(id) on delete cascade,
  home_score smallint not null default 0 check (home_score >= 0),
  away_score smallint not null default 0 check (away_score >= 0),
  match_status public.match_status not null default 'scheduled',
  winner_team_id uuid references public.teams(id) on delete set null,
  venue text,
  match_date timestamptz,
  next_match_id uuid references public.match_brackets(id) on delete set null,
  created_at timestamptz not null default now(),
  check (home_team_id <> away_team_id),
  check (winner_team_id is null or winner_team_id in (home_team_id, away_team_id))
);

create index match_brackets_competition_idx on public.match_brackets(competition_id);
create index match_brackets_round_idx on public.match_brackets(round_id);
create index match_brackets_next_match_idx on public.match_brackets(next_match_id) where next_match_id is not null;

create table public.match_cards (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  competition_id uuid not null references public.competitions(id) on delete cascade,
  match_id uuid not null references public.match_brackets(id) on delete cascade,
  card_type text not null check (card_type in ('yellow', 'red')),
  issued_at timestamptz not null default now(),
  suspension_served_at timestamptz
);

create index match_cards_player_competition_idx on public.match_cards(player_id, competition_id);
create index match_cards_active_suspensions_idx
  on public.match_cards(player_id, competition_id)
  where card_type = 'red' and suspension_served_at is null;

create table public.squad_locks (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  competition_id uuid not null references public.competitions(id) on delete cascade,
  is_locked boolean not null default false,
  locked_at timestamptz,
  locked_by uuid references auth.users(id) on delete set null,
  unique (team_id, competition_id)
);

create index squad_locks_competition_idx on public.squad_locks(competition_id);

create table public.match_officials (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null unique references public.match_brackets(id) on delete cascade,
  referee_name text,
  venue_supervisor text,
  updated_at timestamptz not null default now()
);

alter table public.players
  add column if not exists academic_enrollment_status text not null default 'inactive';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.players'::regclass
      and conname = 'players_academic_enrollment_status_check'
  ) then
    alter table public.players
      add constraint players_academic_enrollment_status_check
      check (academic_enrollment_status in ('active', 'inactive'));
  end if;
end;
$$;

create or replace function public.validate_tournament_control_refs()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  stage_competition uuid;
  match_competition uuid;
  home_team uuid;
  away_team uuid;
begin
  if tg_table_name = 'tournament_rounds' then
    if not exists (
      select 1 from public.tournament_stages s
      where s.id = new.stage_id
    ) then
      raise exception 'Tournament round must belong to an existing stage.' using errcode = '23514';
    end if;
  elsif tg_table_name = 'match_brackets' then
    select s.competition_id into stage_competition
    from public.tournament_rounds r
    join public.tournament_stages s on s.id = r.stage_id
    where r.id = new.round_id;
    if stage_competition is null or stage_competition <> new.competition_id then
      raise exception 'Bracket round and competition must match.' using errcode = '23514';
    end if;
    if not exists (
      select 1 from public.competition_teams ct
      where ct.competition_id = new.competition_id
        and ct.team_id = new.home_team_id
    ) or not exists (
      select 1 from public.competition_teams ct
      where ct.competition_id = new.competition_id
        and ct.team_id = new.away_team_id
    ) then
      raise exception 'Both match teams must be registered in this competition.' using errcode = '23514';
    end if;
    if new.next_match_id is not null and not exists (
      select 1 from public.match_brackets next_match
      where next_match.id = new.next_match_id
        and next_match.competition_id = new.competition_id
    ) then
      raise exception 'The next bracket match must belong to the same competition.' using errcode = '23514';
    end if;
  elsif tg_table_name = 'match_cards' then
    if tg_op = 'UPDATE'
      and new.player_id is not distinct from old.player_id
      and new.competition_id is not distinct from old.competition_id
      and new.match_id is not distinct from old.match_id then
      return new;
    end if;
    select m.competition_id, m.home_team_id, m.away_team_id
      into match_competition, home_team, away_team
    from public.match_brackets m
    where m.id = new.match_id;
    if match_competition is null or match_competition <> new.competition_id
      or not exists (
        select 1
        from public.player_registrations pr
        where pr.player_id = new.player_id
          and pr.competition_id = new.competition_id
          and pr.released_at is null
          and pr.team_id in (home_team, away_team)
      ) then
      raise exception 'Card player and fixture must belong to the same active competition registration.' using errcode = '23514';
    end if;
  elsif tg_table_name = 'squad_locks' then
    if not exists (
      select 1
      from public.competition_teams ct
      join public.teams t on t.id = ct.team_id
      where ct.competition_id = new.competition_id
        and ct.team_id = new.team_id
    ) then
      raise exception 'Squad lock team must be registered in the competition.' using errcode = '23514';
    end if;
    if new.is_locked then
      new.locked_at := coalesce(new.locked_at, now());
      new.locked_by := coalesce(new.locked_by, (select auth.uid()));
    else
      new.locked_at := null;
      new.locked_by := null;
    end if;
  elsif tg_table_name = 'match_officials' then
    if not exists (
      select 1 from public.match_brackets m where m.id = new.match_id
    ) then
      raise exception 'Officials must be assigned to an existing bracket match.' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create trigger tournament_rounds_validate
  before insert or update on public.tournament_rounds
  for each row execute function public.validate_tournament_control_refs();
create trigger match_brackets_validate
  before insert or update on public.match_brackets
  for each row execute function public.validate_tournament_control_refs();
create trigger match_cards_validate
  before insert or update on public.match_cards
  for each row execute function public.validate_tournament_control_refs();
create trigger squad_locks_validate
  before insert or update on public.squad_locks
  for each row execute function public.validate_tournament_control_refs();
create trigger match_officials_validate
  before insert or update on public.match_officials
  for each row execute function public.validate_tournament_control_refs();

create or replace function public.guard_locked_squad_announcement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  announcement_id uuid;
begin
  if tg_table_name = 'squad_announcements' then
    if tg_op = 'DELETE' then
      announcement_id := old.id;
      if not public.is_super_admin() and exists (
        select 1 from public.squad_locks sl
        where sl.team_id = old.team_id
          and sl.competition_id = old.competition_id
          and sl.is_locked
      ) then
        raise exception 'This squad is locked for its competition.' using errcode = '42501';
      end if;
    else
      announcement_id := new.id;
      if not public.is_super_admin() and exists (
        select 1 from public.squad_locks sl
        where sl.team_id = new.team_id
          and sl.competition_id = new.competition_id
          and sl.is_locked
      ) then
        raise exception 'This squad is locked for its competition.' using errcode = '42501';
      end if;
    end if;
  else
    announcement_id := case when tg_op = 'DELETE' then old.announcement_id else new.announcement_id end;
    if tg_op = 'UPDATE' and old.announcement_id is distinct from new.announcement_id
      and not public.is_super_admin() and exists (
        select 1
        from public.squad_announcements sa
        join public.squad_locks sl
          on sl.team_id = sa.team_id
          and sl.competition_id = sa.competition_id
          and sl.is_locked
        where sa.id = old.announcement_id
      ) then
      raise exception 'This squad is locked for its competition.' using errcode = '42501';
    end if;
  end if;

  if not public.is_super_admin() and exists (
    select 1
    from public.squad_announcements sa
    join public.squad_locks sl
      on sl.team_id = sa.team_id
      and sl.competition_id = sa.competition_id
      and sl.is_locked
    where sa.id = announcement_id
  ) then
    raise exception 'This squad is locked for its competition.' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger squad_announcements_lock_guard
  before insert or update or delete on public.squad_announcements
  for each row execute function public.guard_locked_squad_announcement();
create trigger squad_announcement_players_lock_guard
  before insert or update or delete on public.squad_announcement_players
  for each row execute function public.guard_locked_squad_announcement();

alter table public.tournament_stages enable row level security;
alter table public.tournament_rounds enable row level security;
alter table public.match_brackets enable row level security;
alter table public.match_cards enable row level security;
alter table public.squad_locks enable row level security;
alter table public.match_officials enable row level security;

grant select, insert, update, delete on public.tournament_stages to authenticated;
grant select, insert, update, delete on public.tournament_rounds to authenticated;
grant select, insert, update, delete on public.match_brackets to authenticated;
grant select, insert, update, delete on public.match_cards to authenticated;
grant select, insert, update, delete on public.squad_locks to authenticated;
grant select, insert, update, delete on public.match_officials to authenticated;

create policy tournament_stages_secretary_all on public.tournament_stages
  for all to authenticated
  using (exists (
    select 1 from public.competitions c
    where c.id = competition_id and (select public.can_manage_university(c.university_id))
  ))
  with check (exists (
    select 1 from public.competitions c
    where c.id = competition_id and (select public.can_manage_university(c.university_id))
  ));

create policy tournament_rounds_secretary_all on public.tournament_rounds
  for all to authenticated
  using (exists (
    select 1 from public.tournament_stages s
    join public.competitions c on c.id = s.competition_id
    where s.id = stage_id and (select public.can_manage_university(c.university_id))
  ))
  with check (exists (
    select 1 from public.tournament_stages s
    join public.competitions c on c.id = s.competition_id
    where s.id = stage_id and (select public.can_manage_university(c.university_id))
  ));

create policy match_brackets_secretary_all on public.match_brackets
  for all to authenticated
  using (exists (
    select 1 from public.competitions c
    where c.id = competition_id and (select public.can_manage_university(c.university_id))
  ))
  with check (exists (
    select 1 from public.competitions c
    where c.id = competition_id and (select public.can_manage_university(c.university_id))
  ));

create policy match_cards_secretary_all on public.match_cards
  for all to authenticated
  using (exists (
    select 1 from public.competitions c
    where c.id = competition_id and (select public.can_manage_university(c.university_id))
  ))
  with check (exists (
    select 1 from public.competitions c
    where c.id = competition_id and (select public.can_manage_university(c.university_id))
  ));

create policy squad_locks_secretary_all on public.squad_locks
  for all to authenticated
  using (
    exists (
      select 1 from public.competitions c
      where c.id = competition_id and (select public.can_manage_university(c.university_id))
    )
    and exists (
      select 1 from public.teams t
      where t.id = team_id and (select public.can_manage_university(t.university_id))
    )
  )
  with check (
    exists (
      select 1 from public.competitions c
      where c.id = competition_id and (select public.can_manage_university(c.university_id))
    )
    and exists (
      select 1 from public.teams t
      where t.id = team_id and (select public.can_manage_university(t.university_id))
    )
  );

create policy match_officials_secretary_all on public.match_officials
  for all to authenticated
  using (exists (
    select 1
    from public.match_brackets m
    join public.competitions c on c.id = m.competition_id
    where m.id = match_id and (select public.can_manage_university(c.university_id))
  ))
  with check (exists (
    select 1
    from public.match_brackets m
    join public.competitions c on c.id = m.competition_id
    where m.id = match_id and (select public.can_manage_university(c.university_id))
  ));
