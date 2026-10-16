create table public.competition_participants (
  competition_id uuid not null references public.competitions(id) on delete cascade,
  university_id uuid not null references public.universities(id) on delete cascade,
  participation_status text not null default 'invited'
    check (participation_status in ('invited', 'accepted', 'declined')),
  invited_by uuid references auth.users(id) on delete set null,
  invited_at timestamptz not null default now(),
  responded_at timestamptz,
  primary key (competition_id, university_id),
  check (
    (participation_status = 'invited' and responded_at is null)
    or (participation_status in ('accepted', 'declined') and responded_at is not null)
  )
);

create index competition_participants_university_idx
  on public.competition_participants(university_id, participation_status);

create or replace function public.can_manage_competition(target_competition uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_super_admin() or exists (
    select 1 from public.competitions c
    where c.id = target_competition
      and public.is_university_admin_for(c.university_id)
  );
$$;

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
        and cp.university_id = (select auth.jwt() -> 'app_metadata' ->> 'university_id')::uuid
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
        or (
          target_university = (select auth.jwt() -> 'app_metadata' ->> 'university_id')::uuid
          and public.is_university_admin_for(target_university)
        )
      )
  );
$$;

create or replace function public.can_manage_competition_team(
  target_competition uuid,
  target_team uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_super_admin()
    or exists (
      select 1
      from public.competitions c
      join public.competition_teams ct on ct.competition_id = c.id
      join public.teams t on t.id = ct.team_id
      where c.id = target_competition
        and t.id = target_team
        and (
          public.is_university_admin_for(c.university_id)
          or (
            public.is_university_admin_for(t.university_id)
            and (
              t.university_id = c.university_id
              or public.is_accepted_competition_participant(c.id, t.university_id)
            )
          )
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
    where ct.team_id = target_team
      and (
        public.can_manage_competition(ct.competition_id)
        or public.is_accepted_competition_participant(
          ct.competition_id,
          (select auth.jwt() -> 'app_metadata' ->> 'university_id')::uuid
        )
      )
  );
$$;

create or replace function public.can_manage_competition_match(target_match uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_super_admin()
    or exists (
      select 1
      from public.matches m
      join public.competitions c on c.id = m.competition_id
      where m.id = target_match
        and (
          public.is_university_admin_for(c.university_id)
          or public.can_manage_competition_team(c.id, m.home_team_id)
          or public.can_manage_competition_team(c.id, m.away_team_id)
        )
    );
$$;

grant execute on function public.can_manage_competition(uuid) to authenticated;
grant execute on function public.can_access_competition(uuid) to authenticated;
grant execute on function public.is_accepted_competition_participant(uuid, uuid) to authenticated;
grant execute on function public.can_manage_competition_team(uuid, uuid) to authenticated;
grant execute on function public.can_view_competition_team(uuid) to authenticated;
grant execute on function public.can_manage_competition_match(uuid) to authenticated;
revoke execute on function public.can_manage_competition(uuid) from public, anon;
revoke execute on function public.can_access_competition(uuid) from public, anon;
revoke execute on function public.is_accepted_competition_participant(uuid, uuid) from public, anon;
revoke execute on function public.can_manage_competition_team(uuid, uuid) from public, anon;
revoke execute on function public.can_view_competition_team(uuid) from public, anon;
revoke execute on function public.can_manage_competition_match(uuid) from public, anon;

alter table public.competition_participants enable row level security;
grant select, insert, update, delete on public.competition_participants to authenticated;

create policy competition_participants_read on public.competition_participants
  for select to authenticated
  using (
    public.can_manage_competition(competition_id)
    or public.is_university_admin_for(university_id)
  );

create policy competition_participants_invite on public.competition_participants
  for insert to authenticated
  with check (
    public.can_manage_competition(competition_id)
    and invited_by = (select auth.uid())
    and participation_status = 'invited'
    and university_id <> (
      select c.university_id from public.competitions c where c.id = competition_id
    )
  );

create policy competition_participants_respond on public.competition_participants
  for update to authenticated
  using (
    public.is_university_admin_for(university_id)
    and participation_status = 'invited'
  )
  with check (
    public.is_university_admin_for(university_id)
    and participation_status in ('accepted', 'declined')
  );

create policy competition_participants_revoke on public.competition_participants
  for delete to authenticated
  using (public.can_manage_competition(competition_id));

create or replace function public.guard_competition_participant_response()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
    and not public.can_manage_competition(old.competition_id)
    and not public.is_super_admin() then
    if old.competition_id is distinct from new.competition_id
      or old.university_id is distinct from new.university_id
      or old.invited_by is distinct from new.invited_by
      or old.invited_at is distinct from new.invited_at
      or old.participation_status <> 'invited'
      or new.participation_status not in ('accepted', 'declined') then
      raise exception 'An invited university can only accept or decline its invitation.' using errcode = '42501';
    end if;
    new.responded_at := now();
  end if;
  return new;
end;
$$;

create trigger competition_participants_response_guard
  before update on public.competition_participants
  for each row execute function public.guard_competition_participant_response();

create policy competition_participants_organizer_update on public.competition_participants
  for update to authenticated
  using (public.can_manage_competition(competition_id))
  with check (public.can_manage_competition(competition_id));

create or replace function public.add_competition_organizer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.competition_participants (
    competition_id, university_id, participation_status, invited_by, responded_at
  ) values (
    new.id, new.university_id, 'accepted', new.created_by, now()
  )
  on conflict (competition_id, university_id) do nothing;
  return new;
end;
$$;

create trigger competitions_add_organizer
  after insert on public.competitions
  for each row execute function public.add_competition_organizer();

create or replace function public.protect_competition_publication()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.status is distinct from old.status
    and not public.is_super_admin()
    and not public.can_manage_competition(new.id) then
    raise exception 'Only the organizing university can publish or archive this competition.' using errcode = '42501';
  end if;
  return new;
end;
$$;

insert into public.competition_participants (
  competition_id, university_id, participation_status, invited_at, responded_at
)
select c.id, c.university_id, 'accepted', c.created_at, c.created_at
from public.competitions c
on conflict (competition_id, university_id) do nothing;

insert into public.competition_participants (
  competition_id, university_id, participation_status, invited_at, responded_at
)
select distinct ct.competition_id, ct.university_id, 'accepted', ct.registered_at, ct.registered_at
from public.competition_teams ct
on conflict (competition_id, university_id) do nothing;

drop policy if exists universities_directory_read on public.universities;
create policy universities_directory_read on public.universities
  for select to authenticated using (is_active);

drop policy if exists competitions_admin_read on public.competitions;
create policy competitions_admin_read on public.competitions
  for select to authenticated using (public.can_access_competition(id));

drop policy if exists competition_teams_admin_read on public.competition_teams;
drop policy if exists competition_teams_admin_insert on public.competition_teams;
drop policy if exists competition_teams_admin_update on public.competition_teams;
drop policy if exists competition_teams_admin_delete on public.competition_teams;

create policy competition_teams_secretary_read on public.competition_teams
  for select to authenticated
  using (
    public.can_manage_competition(competition_id)
    or (
      public.is_university_admin_for(university_id)
      and public.is_accepted_competition_participant(competition_id, university_id)
    )
  );

create policy competition_teams_secretary_insert on public.competition_teams
  for insert to authenticated
  with check (
    exists (
      select 1 from public.teams t
      where t.id = team_id and t.university_id = university_id
        and (public.is_super_admin() or not t.is_locked)
    )
    and exists (
      select 1 from public.competitions c
      where c.id = competition_id
        and (public.is_super_admin() or not c.is_locked)
    )
    and (
      public.is_super_admin()
      or public.can_manage_competition(competition_id)
      or (
        public.is_university_admin_for(university_id)
        and public.is_accepted_competition_participant(competition_id, university_id)
      )
    )
  );

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
    exists (
      select 1 from public.teams t
      where t.id = team_id and t.university_id = university_id
    )
    and exists (
      select 1
      from public.competitions c
      join public.teams t on t.id = competition_teams.team_id
      where c.id = competition_teams.competition_id
        and (public.is_super_admin() or (not c.is_locked and not t.is_locked))
    )
    and (
      public.can_manage_competition(competition_id)
      or (
        public.is_university_admin_for(university_id)
        and public.is_accepted_competition_participant(competition_id, university_id)
      )
    )
  );

create policy competition_teams_secretary_delete on public.competition_teams
  for delete to authenticated
  using (
    exists (
      select 1
      from public.competitions c
      join public.teams t on t.id = competition_teams.team_id
      where c.id = competition_teams.competition_id
        and (public.is_super_admin() or (not c.is_locked and not t.is_locked))
    )
    and (
      public.can_manage_competition(competition_id)
      or (
        public.is_university_admin_for(university_id)
        and public.is_accepted_competition_participant(competition_id, university_id)
      )
    )
  );

drop policy if exists teams_competition_secretary_read on public.teams;
create policy teams_competition_secretary_read on public.teams
  for select to authenticated
  using (public.can_view_competition_team(id));

create or replace function public.validate_domain_ownership()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  organizer_university uuid;
  team_university uuid;
  competition_category text;
  team_category text;
  home_team uuid;
  away_team uuid;
  normalized_team_class text;
  normalized_player_class text;
begin
  if tg_table_name = 'competition_teams' then
    select c.university_id, c.type::text into organizer_university, competition_category
    from public.competitions c where c.id = new.competition_id;
    select t.type::text into team_category
    from public.teams t where t.id = new.team_id;
    if organizer_university is null
      or not exists (
        select 1 from public.teams t
        where t.id = new.team_id and t.university_id = new.university_id
      )
      or (
        new.university_id <> organizer_university
        and not public.is_accepted_competition_participant(new.competition_id, new.university_id)
      )
      or (competition_category = 'inter_class' and team_category <> 'class_team')
      or (competition_category <> 'inter_class' and team_category <> 'university_team')
      or (team_category = 'class_team' and not exists (
        select 1 from public.teams t
        where t.id = new.team_id and nullif(trim(t.academic_class), '') is not null
      )) then
      raise exception 'Team type, university ownership, and accepted competition participation must match.' using errcode = '23514';
    end if;
  elsif tg_table_name = 'player_registrations' then
    select t.university_id,
      regexp_replace(regexp_replace(lower(trim(coalesce(t.academic_class, ''))), '[^a-z0-9]', '', 'g'), '^mbbs', '')
      into team_university, normalized_team_class
    from public.teams t where t.id = new.team_id;
    select regexp_replace(regexp_replace(lower(trim(coalesce(p.current_academic_year, ''))), '[^a-z0-9]', '', 'g'), '^mbbs', '')
      into normalized_player_class
    from public.players p where p.id = new.player_id;

    if not exists (
      select 1 from public.players p where p.id = new.player_id and p.university_id = new.university_id
    ) or team_university is distinct from new.university_id
      or not exists (
        select 1 from public.competitions c
        where c.id = new.competition_id
          and (
            c.university_id = new.university_id
            or public.is_accepted_competition_participant(c.id, new.university_id)
          )
      )
      or not exists (
        select 1 from public.competition_teams ct
        where ct.competition_id = new.competition_id
          and ct.team_id = new.team_id
          and ct.university_id = new.university_id
      ) then
      raise exception 'Player registration must match the participant university, team, and competition.' using errcode = '23514';
    end if;
    if exists (
      select 1 from public.teams t where t.id = new.team_id and t.type = 'class_team'
    ) and (
      coalesce(normalized_team_class, '') = ''
      or normalized_player_class is distinct from normalized_team_class
    ) then
      raise exception 'A class-team player must have the same academic year as the team.' using errcode = '23514';
    end if;
  elsif tg_table_name = 'matches' then
    if not exists (
      select 1 from public.competitions c
      where c.id = new.competition_id and c.university_id = new.university_id
    ) or not exists (
      select 1 from public.competition_teams ct
      where ct.competition_id = new.competition_id and ct.team_id = new.home_team_id
    ) or not exists (
      select 1 from public.competition_teams ct
      where ct.competition_id = new.competition_id and ct.team_id = new.away_team_id
    ) then
      raise exception 'The organizer must schedule a match between teams registered in the competition.' using errcode = '23514';
    end if;
  elsif tg_table_name = 'match_players' then
    select m.home_team_id, m.away_team_id into home_team, away_team
    from public.matches m where m.id = new.match_id;
    if not exists (
      select 1
      from public.matches m
      join public.competition_teams ct
        on ct.competition_id = m.competition_id and ct.team_id = new.team_id
      join public.players p
        on p.id = new.player_id and p.university_id = ct.university_id
      join public.player_registrations pr
        on pr.competition_id = m.competition_id
        and pr.team_id = new.team_id
        and pr.player_id = new.player_id
        and pr.university_id = ct.university_id
        and pr.released_at is null
      where m.id = new.match_id
        and new.team_id in (home_team, away_team)
        and new.university_id = ct.university_id
    ) then
      raise exception 'Match players must be actively registered to a participating team in this fixture.' using errcode = '23514';
    end if;
  elsif tg_table_name = 'match_events' then
    if not exists (
      select 1 from public.matches m
      where m.id = new.match_id
        and (
          (new.team_id is null and new.university_id = m.university_id)
          or (
            new.team_id in (m.home_team_id, m.away_team_id)
            and exists (
            select 1
            from public.competition_teams ct
            where ct.competition_id = m.competition_id
              and ct.team_id = new.team_id
              and ct.university_id = new.university_id
            )
          )
        )
    )
      or (new.player_id is not null and not exists (
        select 1 from public.match_players mp
        where mp.match_id = new.match_id
          and mp.player_id = new.player_id
          and (new.team_id is null or mp.team_id = new.team_id)
      ))
      or (new.related_player_id is not null and not exists (
        select 1 from public.match_players mp
        where mp.match_id = new.match_id and mp.player_id = new.related_player_id
      ))
      or (new.assist_player_id is not null and not exists (
        select 1 from public.match_players mp
        where mp.match_id = new.match_id and mp.player_id = new.assist_player_id
      )) then
      raise exception 'Match events must reference the fixture and its registered participants.' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.check_class_team_academic_year()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_player uuid;
  target_team uuid;
begin
  if tg_table_name = 'players' then
    target_player := new.id;
  else
    target_team := new.id;
  end if;

  if exists (
    select 1
    from public.player_registrations pr
    join public.players p on p.id = pr.player_id
    join public.teams t on t.id = pr.team_id
    where pr.released_at is null
      and t.type = 'class_team'
      and (target_player is null or p.id = target_player)
      and (target_team is null or t.id = target_team)
      and regexp_replace(regexp_replace(lower(trim(coalesce(p.current_academic_year, ''))), '[^a-z0-9]', '', 'g'), '^mbbs', '')
        <> regexp_replace(regexp_replace(lower(trim(coalesce(t.academic_class, ''))), '[^a-z0-9]', '', 'g'), '^mbbs', '')
  ) then
    raise exception 'Active class-team registrations must match the player academic year.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create constraint trigger players_class_team_year_check
  after insert or update on public.players
  deferrable initially deferred
  for each row execute function public.check_class_team_academic_year();

create constraint trigger teams_class_team_year_check
  after insert or update on public.teams
  deferrable initially deferred
  for each row execute function public.check_class_team_academic_year();

drop policy if exists matches_admin_read on public.matches;
drop policy if exists matches_admin_insert on public.matches;
drop policy if exists matches_admin_update on public.matches;
drop policy if exists matches_admin_delete on public.matches;

create policy matches_secretary_read on public.matches
  for select to authenticated
  using (public.can_manage_competition_match(id));
create policy matches_organizer_insert on public.matches
  for insert to authenticated
  with check (
    public.can_manage_competition(competition_id)
    and university_id = (
      select c.university_id from public.competitions c where c.id = competition_id
    )
    and not is_locked
  );
create policy matches_organizer_update on public.matches
  for update to authenticated
  using (
    public.can_manage_competition(competition_id)
    and (public.is_super_admin() or (not is_locked and exists (
      select 1 from public.competitions c where c.id = competition_id and not c.is_locked
    )))
  )
  with check (
    public.can_manage_competition(competition_id)
    and (public.is_super_admin() or not is_locked)
  );
create policy matches_organizer_delete on public.matches
  for delete to authenticated
  using (
    public.can_manage_competition(competition_id)
    and (public.is_super_admin() or (not is_locked and status = 'scheduled'))
  );

drop policy if exists match_players_admin_read on public.match_players;
drop policy if exists match_players_admin_insert on public.match_players;
drop policy if exists match_players_admin_update on public.match_players;
drop policy if exists match_players_admin_delete on public.match_players;

create policy match_players_participant_read on public.match_players
  for select to authenticated
  using (public.can_manage_competition_match(match_id));
create policy match_players_participant_insert on public.match_players
  for insert to authenticated
  with check (
    public.can_manage_competition_team(
      (select m.competition_id from public.matches m where m.id = match_id), team_id
    )
    and exists (
      select 1 from public.matches m
      join public.competitions c on c.id = m.competition_id
      where m.id = match_id
        and (public.is_super_admin() or (not m.is_locked and not c.is_locked))
    )
  );
create policy match_players_participant_update on public.match_players
  for update to authenticated
  using (
    public.can_manage_competition_team(
      (select m.competition_id from public.matches m where m.id = match_id), team_id
    )
    and exists (
      select 1 from public.matches m
      join public.competitions c on c.id = m.competition_id
      where m.id = match_players.match_id
        and (public.is_super_admin() or (not m.is_locked and not c.is_locked))
    )
  )
  with check (
    public.can_manage_competition_team(
      (select m.competition_id from public.matches m where m.id = match_id), team_id
    )
    and exists (
      select 1 from public.matches m
      join public.competitions c on c.id = m.competition_id
      where m.id = match_players.match_id
        and (public.is_super_admin() or (not m.is_locked and not c.is_locked))
    )
  );
create policy match_players_participant_delete on public.match_players
  for delete to authenticated
  using (
    public.can_manage_competition_team(
      (select m.competition_id from public.matches m where m.id = match_id), team_id
    )
    and exists (
      select 1 from public.matches m
      join public.competitions c on c.id = m.competition_id
      where m.id = match_players.match_id
        and (public.is_super_admin() or (
          not m.is_locked and not c.is_locked and m.status in ('scheduled', 'warm_up')
        ))
    )
  );

drop policy if exists match_events_admin_read on public.match_events;
drop policy if exists match_events_admin_insert on public.match_events;
drop policy if exists match_events_admin_update on public.match_events;
drop policy if exists match_events_admin_delete on public.match_events;

create policy match_events_participant_read on public.match_events
  for select to authenticated
  using (public.can_manage_competition_match(match_id));
create policy match_events_participant_insert on public.match_events
  for insert to authenticated
  with check (
    case when team_id is null
      then public.can_manage_competition((select m.competition_id from public.matches m where m.id = match_id))
      else public.can_manage_competition_team(
        (select m.competition_id from public.matches m where m.id = match_id), team_id
      )
    end
    and exists (
      select 1 from public.matches m
      join public.competitions c on c.id = m.competition_id
      where m.id = match_events.match_id
        and (public.is_super_admin() or (not m.is_locked and not c.is_locked))
    )
  );
create policy match_events_participant_update on public.match_events
  for update to authenticated
  using (
    case when team_id is null
      then public.can_manage_competition((select m.competition_id from public.matches m where m.id = match_id))
      else public.can_manage_competition_team(
        (select m.competition_id from public.matches m where m.id = match_id), team_id
      )
    end
    and exists (
      select 1 from public.matches m
      join public.competitions c on c.id = m.competition_id
      where m.id = match_events.match_id
        and (public.is_super_admin() or (not m.is_locked and not c.is_locked))
    )
  )
  with check (
    case when team_id is null
      then public.can_manage_competition((select m.competition_id from public.matches m where m.id = match_id))
      else public.can_manage_competition_team(
        (select m.competition_id from public.matches m where m.id = match_id), team_id
      )
    end
    and exists (
      select 1 from public.matches m
      join public.competitions c on c.id = m.competition_id
      where m.id = match_events.match_id
        and (public.is_super_admin() or (not m.is_locked and not c.is_locked))
    )
  );
create policy match_events_participant_delete on public.match_events
  for delete to authenticated
  using (
    case when team_id is null
      then public.can_manage_competition((select m.competition_id from public.matches m where m.id = match_id))
      else public.can_manage_competition_team(
        (select m.competition_id from public.matches m where m.id = match_id), team_id
      )
    end
    and exists (
      select 1 from public.matches m
      join public.competitions c on c.id = m.competition_id
      where m.id = match_events.match_id
        and (public.is_super_admin() or (
          not m.is_locked and not c.is_locked and m.status in ('scheduled', 'warm_up')
        ))
    )
  );

create or replace function public.validate_squad_announcement()
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
    select 1
    from public.teams t
    join public.competition_teams ct
      on ct.team_id = t.id
      and ct.competition_id = new.competition_id
      and ct.university_id = new.university_id
    join public.competitions c on c.id = new.competition_id
    where t.id = new.team_id
      and t.university_id = new.university_id
      and (
        c.university_id = new.university_id
        or public.is_accepted_competition_participant(c.id, new.university_id)
      )
  ) then
    raise exception 'Team must belong to an accepted university participant in this competition.' using errcode = '23514';
  end if;
  if new.match_id is not null and not exists (
    select 1 from public.matches m
    where m.id = new.match_id
      and m.competition_id = new.competition_id
      and new.team_id in (m.home_team_id, m.away_team_id)
  ) then
    raise exception 'The selected match must belong to this competition and include this team.' using errcode = '23514';
  end if;
  if new.is_published then
    select count(*) filter (where sap.squad_role = 'starting_xi'),
      count(*) filter (where sap.is_captain and sap.squad_role = 'starting_xi'),
      count(*) filter (where sap.is_goalkeeper and sap.squad_role = 'starting_xi')
      into starter_count, captain_count, goalkeeper_count
      from public.squad_announcement_players sap
      where sap.announcement_id = new.id;
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

drop policy if exists squad_announcements_admin_read on public.squad_announcements;
drop policy if exists squad_announcements_admin_insert on public.squad_announcements;
drop policy if exists squad_announcements_admin_update on public.squad_announcements;
drop policy if exists squad_announcements_admin_delete on public.squad_announcements;

create policy squad_announcements_participant_read on public.squad_announcements
  for select to authenticated
  using (public.can_manage_competition_team(competition_id, team_id));
create policy squad_announcements_participant_insert on public.squad_announcements
  for insert to authenticated
  with check (
    public.is_university_admin_for(university_id)
    and public.can_manage_competition_team(competition_id, team_id)
    and (public.is_super_admin() or not exists (
      select 1 from public.teams t join public.competitions c on c.id = competition_id
      where t.id = team_id and (t.is_locked or c.is_locked)
    ))
  );
create policy squad_announcements_participant_update on public.squad_announcements
  for update to authenticated
  using (
    public.is_university_admin_for(university_id)
    and public.can_manage_competition_team(competition_id, team_id)
    and (public.is_super_admin() or not exists (
      select 1 from public.teams t join public.competitions c on c.id = competition_id
      where t.id = team_id and (t.is_locked or c.is_locked)
    ))
  )
  with check (
    public.is_university_admin_for(university_id)
    and public.can_manage_competition_team(competition_id, team_id)
    and (public.is_super_admin() or not exists (
      select 1 from public.teams t join public.competitions c on c.id = competition_id
      where t.id = team_id and (t.is_locked or c.is_locked)
    ))
  );
create policy squad_announcements_participant_delete on public.squad_announcements
  for delete to authenticated
  using (
    public.is_university_admin_for(university_id)
    and public.can_manage_competition_team(competition_id, team_id)
    and (public.is_super_admin() or not exists (
      select 1 from public.teams t join public.competitions c on c.id = competition_id
      where t.id = team_id and (t.is_locked or c.is_locked)
    ))
  );

drop policy if exists squad_announcement_players_admin_read on public.squad_announcement_players;
drop policy if exists squad_announcement_players_admin_insert on public.squad_announcement_players;
drop policy if exists squad_announcement_players_admin_update on public.squad_announcement_players;
drop policy if exists squad_announcement_players_admin_delete on public.squad_announcement_players;

create policy squad_announcement_players_participant_read on public.squad_announcement_players
  for select to authenticated
  using (exists (
    select 1 from public.squad_announcements sa
    where sa.id = announcement_id
      and public.can_manage_competition_team(sa.competition_id, sa.team_id)
  ));
create policy squad_announcement_players_participant_insert on public.squad_announcement_players
  for insert to authenticated
  with check (exists (
    select 1 from public.squad_announcements sa
    join public.teams t on t.id = sa.team_id
    join public.competitions c on c.id = sa.competition_id
    where sa.id = announcement_id and not sa.is_published
      and public.can_manage_competition_team(sa.competition_id, sa.team_id)
      and (public.is_super_admin() or (not t.is_locked and not c.is_locked))
  ));
create policy squad_announcement_players_participant_update on public.squad_announcement_players
  for update to authenticated
  using (exists (
    select 1 from public.squad_announcements sa
    join public.teams t on t.id = sa.team_id
    join public.competitions c on c.id = sa.competition_id
    where sa.id = announcement_id and not sa.is_published
      and public.can_manage_competition_team(sa.competition_id, sa.team_id)
      and (public.is_super_admin() or (not t.is_locked and not c.is_locked))
  ))
  with check (exists (
    select 1 from public.squad_announcements sa
    join public.teams t on t.id = sa.team_id
    join public.competitions c on c.id = sa.competition_id
    where sa.id = announcement_id and not sa.is_published
      and public.can_manage_competition_team(sa.competition_id, sa.team_id)
      and (public.is_super_admin() or (not t.is_locked and not c.is_locked))
  ));
create policy squad_announcement_players_participant_delete on public.squad_announcement_players
  for delete to authenticated
  using (exists (
    select 1 from public.squad_announcements sa
    join public.teams t on t.id = sa.team_id
    join public.competitions c on c.id = sa.competition_id
    where sa.id = announcement_id and not sa.is_published
      and public.can_manage_competition_team(sa.competition_id, sa.team_id)
      and (public.is_super_admin() or (not t.is_locked and not c.is_locked))
  ));

drop policy if exists squad_locks_secretary_all on public.squad_locks;
create policy squad_locks_secretary_all on public.squad_locks
  for all to authenticated
  using (public.can_manage_competition_team(competition_id, team_id))
  with check (public.can_manage_competition_team(competition_id, team_id));

drop policy if exists match_cards_secretary_all on public.match_cards;
create policy match_cards_secretary_all on public.match_cards
  for all to authenticated
  using (
    exists (
      select 1
      from public.player_registrations pr
      join public.teams t on t.id = pr.team_id
      join public.match_brackets b on b.id = match_cards.match_id
      join public.matches m on m.id = b.match_id
      join public.competitions c on c.id = m.competition_id
      where pr.player_id = match_cards.player_id
        and pr.competition_id = match_cards.competition_id
        and pr.released_at is null
        and (public.is_super_admin() or (not t.is_locked and not m.is_locked and not c.is_locked))
        and public.can_manage_competition_team(pr.competition_id, pr.team_id)
    )
  )
  with check (
    exists (
      select 1
      from public.player_registrations pr
      join public.teams t on t.id = pr.team_id
      join public.match_brackets b on b.id = match_cards.match_id
      join public.matches m on m.id = b.match_id
      join public.competitions c on c.id = m.competition_id
      where pr.player_id = match_cards.player_id
        and pr.competition_id = match_cards.competition_id
        and pr.released_at is null
        and (public.is_super_admin() or (not t.is_locked and not m.is_locked and not c.is_locked))
        and public.can_manage_competition_team(pr.competition_id, pr.team_id)
    )
  );

alter table public.match_brackets
  add column if not exists match_id uuid references public.matches(id) on delete cascade;

alter table public.matches
  add column if not exists score_source text not null default 'events';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.matches'::regclass
      and conname = 'matches_score_source_check'
  ) then
    alter table public.matches
      add constraint matches_score_source_check
      check (score_source in ('events', 'manual'));
  end if;
end;
$$;

create unique index if not exists match_brackets_match_id_unique
  on public.match_brackets(match_id)
  where match_id is not null;

create or replace function public.sync_bracket_fixture_to_match()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  competition_university uuid;
  round_name text;
begin
  if tg_op = 'UPDATE'
    and old.match_id is not null
    and new.match_id is distinct from old.match_id then
    raise exception 'A bracket fixture cannot be relinked to a different public match.' using errcode = '23514';
  end if;

  if new.match_id is null then
    select c.university_id into competition_university
    from public.competitions c where c.id = new.competition_id;
    select r.name into round_name
    from public.tournament_rounds r where r.id = new.round_id;
    insert into public.matches (
        competition_id, university_id, home_team_id, away_team_id, round,
        kickoff_at, venue, status, home_score, away_score, created_by
    ) values (
        new.competition_id, competition_university, new.home_team_id, new.away_team_id,
        round_name, coalesce(new.match_date, now()), new.venue, new.match_status,
        new.home_score, new.away_score, (select auth.uid())
    ) returning id into new.match_id;
  elsif not exists (
    select 1 from public.matches m
    where m.id = new.match_id and m.competition_id = new.competition_id
  ) then
    raise exception 'The linked public match must belong to this competition.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger match_brackets_create_match
  before insert or update on public.match_brackets
  for each row execute function public.sync_bracket_fixture_to_match();

create or replace function public.sync_match_to_bracket()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_stage uuid;
  target_round uuid;
  target_round_name text;
  target_bracket uuid;
  next_round_number smallint;
begin
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  target_round_name := coalesce(nullif(trim(new.round), ''), 'Matchday 1');
  select r.id into target_round
  from public.match_brackets b
  join public.tournament_rounds r on r.id = b.round_id
  where b.match_id = new.id and r.name = target_round_name
  limit 1;

  select s.id into target_stage
  from public.tournament_stages s
  where s.competition_id = new.competition_id
  order by s.sequence_order
  limit 1;
  if target_round is null and target_stage is null then
    insert into public.tournament_stages (competition_id, name, stage_type, sequence_order)
    values (new.competition_id, 'League stage', 'league', 1)
    on conflict (competition_id, sequence_order) do update set name = excluded.name
    returning id into target_stage;
  end if;

  if target_round is null then
    perform 1 from public.tournament_stages s where s.id = target_stage for update;
    select r.id into target_round
    from public.tournament_rounds r
    where r.stage_id = target_stage and r.name = target_round_name
    limit 1;
  end if;
  if target_round is null then
    select coalesce(max(r.round_number), 0) + 1 into next_round_number
    from public.tournament_rounds r where r.stage_id = target_stage;
    insert into public.tournament_rounds (stage_id, name, round_number)
    values (target_stage, target_round_name, next_round_number)
    on conflict (stage_id, round_number) do update set name = excluded.name
    returning id into target_round;
  end if;

  if tg_op = 'INSERT' then
    insert into public.match_brackets (
        round_id, competition_id, home_team_id, away_team_id,
        home_score, away_score, match_status, winner_team_id, venue, match_date, match_id
    ) values (
        target_round, new.competition_id, new.home_team_id, new.away_team_id,
        new.home_score, new.away_score, new.status,
        case
          when new.status = 'full_time' and new.home_score > new.away_score then new.home_team_id
          when new.status = 'full_time' and new.away_score > new.home_score then new.away_team_id
          else null
        end,
        new.venue, new.kickoff_at, new.id
    )
    on conflict (match_id) where match_id is not null do nothing;
  else
    update public.match_brackets
    set round_id = target_round,
        home_team_id = new.home_team_id,
        away_team_id = new.away_team_id,
        home_score = new.home_score,
        away_score = new.away_score,
        match_status = new.status,
        winner_team_id = case
          when new.status = 'full_time' and new.home_score > new.away_score then new.home_team_id
          when new.status = 'full_time' and new.away_score > new.home_score then new.away_team_id
          else null
        end,
        venue = new.venue,
        match_date = new.kickoff_at
    where match_id = new.id;
  end if;

  select b.id into target_bracket
  from public.match_brackets b
  where b.match_id = new.id;
  if target_bracket is not null then
    insert into public.match_officials (match_id, referee_name)
    values (target_bracket, new.referee)
    on conflict (match_id) do update
      set referee_name = excluded.referee_name;
  end if;
  return new;
end;
$$;

create trigger matches_sync_bracket
  after insert or update on public.matches
  for each row execute function public.sync_match_to_bracket();

create or replace function public.sync_bracket_to_match()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if pg_trigger_depth() > 1 then
    return new;
  end if;
  update public.matches
  set home_team_id = new.home_team_id,
    away_team_id = new.away_team_id,
    home_score = new.home_score,
    away_score = new.away_score,
    score_source = case
      when new.home_score is distinct from old.home_score
        or new.away_score is distinct from old.away_score then 'manual'
      else score_source
    end,
    status = new.match_status,
    venue = new.venue,
    kickoff_at = coalesce(new.match_date, kickoff_at),
    round = (select r.name from public.tournament_rounds r where r.id = new.round_id)
  where id = new.match_id;
  return new;
end;
$$;

create trigger match_brackets_sync_match
  after update on public.match_brackets
  for each row execute function public.sync_bracket_to_match();

create or replace function public.sync_official_to_match()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if pg_trigger_depth() > 1 then
    return new;
  end if;
  update public.matches m
  set referee = new.referee_name
  from public.match_brackets b
  where b.id = new.match_id and m.id = b.match_id;
  return new;
end;
$$;

create trigger match_officials_sync_match
  after insert or update on public.match_officials
  for each row execute function public.sync_official_to_match();

create or replace function public.sync_card_to_match_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  match_row public.matches%rowtype;
  registration_row public.player_registrations%rowtype;
begin
  if tg_op = 'DELETE' then
    delete from public.match_events e
    where e.details ->> 'match_card_id' = old.id::text;
    return old;
  end if;

  select m.* into match_row
  from public.match_brackets b
  join public.matches m on m.id = b.match_id
  where b.id = new.match_id;
  select pr.* into registration_row
  from public.player_registrations pr
  where pr.player_id = new.player_id
    and pr.competition_id = new.competition_id
    and pr.released_at is null
    and pr.team_id in (match_row.home_team_id, match_row.away_team_id)
  order by pr.registered_at desc
  limit 1;

  insert into public.match_players (match_id, player_id, team_id, university_id)
  values (match_row.id, new.player_id, registration_row.team_id, registration_row.university_id)
  on conflict (match_id, player_id) do nothing;

  insert into public.match_events (
    match_id, university_id, event_type, team_id, player_id, details, recorded_by
  ) values (
    match_row.id, registration_row.university_id,
    case when new.card_type = 'yellow' then 'yellow_card'::public.match_event_type else 'red_card'::public.match_event_type end,
    registration_row.team_id, new.player_id,
    jsonb_build_object('match_card_id', new.id), (select auth.uid())
  );
  return new;
end;
$$;

create trigger match_cards_sync_match_event
  after insert or delete on public.match_cards
  for each row execute function public.sync_card_to_match_event();

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
  if tg_op <> 'INSERT' and old.event_type in ('goal', 'penalty', 'own_goal') then
    previous_match := old.match_id;
  end if;
  if tg_op <> 'DELETE' and new.event_type in ('goal', 'penalty', 'own_goal') then
    target_match := new.match_id;
  end if;

  if target_match is null and previous_match is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if target_match is not null then
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
      ),
      score_source = 'events'
    where m.id = target_match;
  end if;

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
      ),
      score_source = 'events'
    where m.id = previous_match and m.score_source = 'events';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

insert into public.tournament_stages (competition_id, name, stage_type, sequence_order)
select distinct m.competition_id, 'League stage', 'league', 1
from public.matches m
where not exists (
  select 1 from public.tournament_stages s where s.competition_id = m.competition_id
)
on conflict (competition_id, sequence_order) do nothing;

insert into public.tournament_rounds (stage_id, name, round_number)
select s.id, grouped.round_name,
  (coalesce(max(r.round_number), 0) + row_number() over (partition by s.id order by grouped.round_name))::smallint
from (
  select distinct m.competition_id, coalesce(nullif(trim(m.round), ''), 'Matchday 1') as round_name
  from public.matches m
) grouped
join lateral (
  select stage.id
  from public.tournament_stages stage
  where stage.competition_id = grouped.competition_id
  order by stage.sequence_order
  limit 1
) s on true
left join public.tournament_rounds r on r.stage_id = s.id
where not exists (
  select 1 from public.tournament_rounds r
  where r.stage_id = s.id and r.name = grouped.round_name
)
group by s.id, grouped.round_name
on conflict (stage_id, round_number) do nothing;

insert into public.match_brackets (
  round_id, competition_id, home_team_id, away_team_id,
  home_score, away_score, match_status, winner_team_id, venue, match_date, match_id
)
select r.id, m.competition_id, m.home_team_id, m.away_team_id,
  m.home_score, m.away_score, m.status,
  case
    when m.status = 'full_time' and m.home_score > m.away_score then m.home_team_id
    when m.status = 'full_time' and m.away_score > m.home_score then m.away_team_id
    else null
  end,
  m.venue, m.kickoff_at, m.id
from public.matches m
join lateral (
  select stage.id
  from public.tournament_stages stage
  where stage.competition_id = m.competition_id
  order by stage.sequence_order
  limit 1
) s on true
join public.tournament_rounds r on r.stage_id = s.id
  and r.name = coalesce(nullif(trim(m.round), ''), 'Matchday 1')
on conflict (match_id) where match_id is not null do nothing;

insert into public.match_officials (match_id, referee_name)
select b.id, m.referee
from public.match_brackets b
join public.matches m on m.id = b.match_id
where m.referee is not null
on conflict (match_id) do update set referee_name = excluded.referee_name;

update public.match_brackets
set home_score = home_score
where match_id is null;

create or replace function public.protect_competition_publication()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.status is distinct from old.status
    and not public.is_super_admin()
    and not public.can_manage_competition(new.id) then
    raise exception 'Only the organizing university can publish or archive this competition.' using errcode = '42501';
  end if;
  return new;
end;
$$;
