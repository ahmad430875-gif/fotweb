alter table public.squad_announcement_players
  add column is_vice_captain boolean not null default false;

create unique index squad_announcement_one_vice_captain_idx
  on public.squad_announcement_players(announcement_id)
  where is_vice_captain;

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
  vice_captain_count integer;
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
    select count(*) filter (where squad_role = 'starting_xi'),
      count(*) filter (where is_captain and squad_role = 'starting_xi'),
      count(*) filter (where is_goalkeeper and squad_role = 'starting_xi'),
      count(*) filter (where is_vice_captain and squad_role = 'starting_xi')
      into starter_count, captain_count, goalkeeper_count, vice_captain_count
      from public.squad_announcement_players where announcement_id = new.id;
    if starter_count <> 11 or captain_count <> 1 or goalkeeper_count <> 1 or vice_captain_count > 1 then
      raise exception 'A published squad needs eleven starters, one captain, one goalkeeper, and at most one vice-captain.' using errcode = '23514';
    end if;
    new.published_at := coalesce(new.published_at, now());
  else
    new.published_at := null;
  end if;
  return new;
end;
$$;

create or replace function public.publish_squad_announcement(target_announcement uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  squad public.squad_announcements%rowtype;
begin
  select * into squad from public.squad_announcements where id = target_announcement for update;
  if squad.id is null or not public.can_manage_university(squad.university_id) then
    raise exception 'You cannot publish this squad.' using errcode = '42501';
  end if;
  if not public.is_super_admin() and exists (
    select 1 from public.teams t join public.competitions c on c.id = squad.competition_id
    where t.id = squad.team_id and (t.is_locked or c.is_locked)
  ) then
    raise exception 'This team or competition is locked by a Super Admin.' using errcode = '42501';
  end if;

  update public.squad_announcements set is_published = true, published_at = now() where id = squad.id;

  if squad.match_id is not null then
    if exists (
      select 1 from public.squad_announcement_players sap
      join public.match_players mp on mp.match_id = squad.match_id and mp.player_id = sap.player_id
      where sap.announcement_id = squad.id and mp.team_id <> squad.team_id
    ) then
      raise exception 'A selected player is already assigned to the opposing team.' using errcode = '23514';
    end if;
    insert into public.match_players(match_id, player_id, team_id, university_id, shirt_number, is_starter, is_captain, is_vice_captain, position)
    select squad.match_id, sap.player_id, squad.team_id, squad.university_id, sap.shirt_number,
      sap.squad_role = 'starting_xi', sap.is_captain, sap.is_vice_captain, sap.position
    from public.squad_announcement_players sap
    where sap.announcement_id = squad.id
    on conflict (match_id, player_id) do update set
      team_id = excluded.team_id,
      shirt_number = excluded.shirt_number,
      is_starter = excluded.is_starter,
      is_captain = excluded.is_captain,
      is_vice_captain = excluded.is_vice_captain,
      position = excluded.position;
  end if;
end;
$$;

revoke execute on function public.publish_squad_announcement(uuid) from public, anon;
grant execute on function public.publish_squad_announcement(uuid) to authenticated;
