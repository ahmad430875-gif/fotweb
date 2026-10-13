create function public.jwt_role()
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select auth.jwt() -> 'app_metadata' ->> 'role';
$$;

create function public.is_active_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_profiles p
    where p.id = (select auth.uid())
      and p.is_active
      and p.role::text = public.jwt_role()
  );
$$;

create function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.jwt_role() = 'super_admin' and public.is_active_admin();
$$;

create function public.is_university_admin_for(target_university uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.jwt_role() = 'university_admin'
    and public.is_active_admin()
    and (select auth.jwt() -> 'app_metadata' ->> 'university_id') = target_university::text
    and exists (
      select 1 from public.user_profiles p
      where p.id = (select auth.uid())
        and p.university_id = target_university
    )
    and exists (
      select 1 from public.universities u
      where u.id = target_university and u.is_active
    );
$$;

create function public.can_manage_university(target_university uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_super_admin() or public.is_university_admin_for(target_university);
$$;

create function public.protect_locked_record()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not public.is_super_admin() then
    if old.is_locked then
      raise exception 'This record is locked by a Super Admin.' using errcode = '42501';
    end if;
    if new.is_locked is distinct from old.is_locked then
      raise exception 'Only a Super Admin can change the lock state.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger competitions_protect_lock before update on public.competitions for each row execute function public.protect_locked_record();
create trigger teams_protect_lock before update on public.teams for each row execute function public.protect_locked_record();
create trigger players_protect_lock before update on public.players for each row execute function public.protect_locked_record();
create trigger matches_protect_lock before update on public.matches for each row execute function public.protect_locked_record();

create function public.validate_domain_ownership()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  expected_university uuid;
begin
  if tg_table_name = 'competition_teams' then
    select c.university_id into expected_university from public.competitions c where c.id = new.competition_id;
    if expected_university is null or new.university_id <> expected_university or not exists (
      select 1 from public.teams t where t.id = new.team_id and t.university_id = expected_university
    ) then
      raise exception 'Competition and team must belong to the same university.' using errcode = '23514';
    end if;
  elsif tg_table_name = 'player_registrations' then
    if not exists (select 1 from public.players p where p.id = new.player_id and p.university_id = new.university_id)
      or not exists (select 1 from public.teams t where t.id = new.team_id and t.university_id = new.university_id)
      or not exists (select 1 from public.competitions c where c.id = new.competition_id and c.university_id = new.university_id)
      or not exists (select 1 from public.competition_teams ct where ct.competition_id = new.competition_id and ct.team_id = new.team_id) then
      raise exception 'Player registration must match its university, team and competition.' using errcode = '23514';
    end if;
  elsif tg_table_name = 'matches' then
    if not exists (select 1 from public.competitions c where c.id = new.competition_id and c.university_id = new.university_id)
      or not exists (select 1 from public.competition_teams ct where ct.competition_id = new.competition_id and ct.team_id = new.home_team_id)
      or not exists (select 1 from public.competition_teams ct where ct.competition_id = new.competition_id and ct.team_id = new.away_team_id) then
      raise exception 'Match teams must be registered in its university competition.' using errcode = '23514';
    end if;
  elsif tg_table_name = 'match_players' then
    if not exists (select 1 from public.matches m where m.id = new.match_id and m.university_id = new.university_id)
      or not exists (select 1 from public.players p where p.id = new.player_id and p.university_id = new.university_id)
      or not exists (select 1 from public.competition_teams ct join public.matches m on m.competition_id = ct.competition_id where m.id = new.match_id and ct.team_id = new.team_id)
      or not exists (select 1 from public.player_registrations pr join public.matches m on m.competition_id = pr.competition_id where m.id = new.match_id and pr.player_id = new.player_id and pr.team_id = new.team_id) then
      raise exception 'Match player must be registered for its team and competition.' using errcode = '23514';
    end if;
  elsif tg_table_name = 'match_events' then
    if not exists (select 1 from public.matches m where m.id = new.match_id and m.university_id = new.university_id)
      or (new.team_id is not null and not exists (select 1 from public.competition_teams ct join public.matches m on m.competition_id = ct.competition_id where m.id = new.match_id and ct.team_id = new.team_id))
      or (new.player_id is not null and not exists (select 1 from public.match_players mp where mp.match_id = new.match_id and mp.player_id = new.player_id))
      or (new.related_player_id is not null and not exists (select 1 from public.match_players mp where mp.match_id = new.match_id and mp.player_id = new.related_player_id))
      or (new.assist_player_id is not null and not exists (select 1 from public.match_players mp where mp.match_id = new.match_id and mp.player_id = new.assist_player_id)) then
      raise exception 'Match event references must belong to the match.' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create trigger competition_teams_validate before insert or update on public.competition_teams for each row execute function public.validate_domain_ownership();
create trigger player_registrations_validate before insert or update on public.player_registrations for each row execute function public.validate_domain_ownership();
create trigger matches_validate before insert or update on public.matches for each row execute function public.validate_domain_ownership();
create trigger match_players_validate before insert or update on public.match_players for each row execute function public.validate_domain_ownership();
create trigger match_events_validate before insert or update on public.match_events for each row execute function public.validate_domain_ownership();

create function public.write_audit_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_json jsonb;
  new_json jsonb;
  entity jsonb;
  university uuid;
begin
  old_json := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  new_json := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  entity := coalesce(new_json, old_json);
  if entity ? 'university_id' then
    university := nullif(entity ->> 'university_id', '')::uuid;
  elsif entity ? 'id' and tg_table_name = 'universities' then
    university := nullif(entity ->> 'id', '')::uuid;
  elsif entity ? 'competition_id' then
    select c.university_id into university from public.competitions c where c.id = (entity ->> 'competition_id')::uuid;
  end if;
  insert into public.audit_logs(actor_id, university_id, action, entity_table, entity_id, old_data, new_data)
  values ((select auth.uid()), university, lower(tg_op), tg_table_name, entity ->> 'id', old_json, new_json);
  return coalesce(new, old);
end;
$$;

create trigger universities_audit after insert or update or delete on public.universities for each row execute function public.write_audit_log();
create trigger user_profiles_audit after insert or update or delete on public.user_profiles for each row execute function public.write_audit_log();
create trigger competitions_audit after insert or update or delete on public.competitions for each row execute function public.write_audit_log();
create trigger teams_audit after insert or update or delete on public.teams for each row execute function public.write_audit_log();
create trigger players_audit after insert or update or delete on public.players for each row execute function public.write_audit_log();
create trigger player_registrations_audit after insert or update or delete on public.player_registrations for each row execute function public.write_audit_log();
create trigger matches_audit after insert or update or delete on public.matches for each row execute function public.write_audit_log();
create trigger match_players_audit after insert or update or delete on public.match_players for each row execute function public.write_audit_log();
create trigger match_events_audit after insert or update or delete on public.match_events for each row execute function public.write_audit_log();
create trigger announcements_audit after insert or update or delete on public.announcements for each row execute function public.write_audit_log();

alter table public.universities enable row level security;
alter table public.user_profiles enable row level security;
alter table public.competitions enable row level security;
alter table public.teams enable row level security;
alter table public.competition_teams enable row level security;
alter table public.players enable row level security;
alter table public.player_registrations enable row level security;
alter table public.matches enable row level security;
alter table public.match_players enable row level security;
alter table public.match_events enable row level security;
alter table public.announcements enable row level security;
alter table public.audit_logs enable row level security;

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
grant select on public.universities, public.competitions, public.teams, public.competition_teams, public.players, public.player_registrations, public.matches, public.match_players, public.match_events, public.announcements to anon;
grant select (id, name, short_name, logo_url, location, is_active, created_at, updated_at) on public.universities to anon;
grant select on public.competitions, public.teams, public.competition_teams, public.player_registrations, public.matches, public.match_players, public.match_events, public.announcements to anon;
grant select (id, university_id, full_name, photo_url, academic_program, current_academic_year, position, preferred_foot, bio, is_active, created_at, updated_at) on public.players to anon;
grant select, insert, update, delete on public.universities, public.competitions, public.teams, public.competition_teams, public.players, public.player_registrations, public.matches, public.match_players, public.match_events, public.announcements to authenticated;
grant select on public.user_profiles, public.audit_logs to authenticated;
grant select on public.university_summaries to authenticated;
grant update (display_name) on public.user_profiles to authenticated;
grant select on public.player_career_stats to anon, authenticated;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
revoke execute on all functions in schema public from public, anon;
grant execute on function public.jwt_role() to authenticated;
grant execute on function public.is_active_admin() to authenticated;
grant execute on function public.is_super_admin() to authenticated;
grant execute on function public.is_university_admin_for(uuid) to authenticated;
grant execute on function public.can_manage_university(uuid) to authenticated;

create policy universities_public_read on public.universities for select to anon using (is_active);
create policy universities_admin_read on public.universities for select to authenticated using ((select public.is_super_admin()) or (select public.is_university_admin_for(id)));
create policy universities_super_insert on public.universities for insert to authenticated with check ((select public.is_super_admin()));
create policy universities_super_update on public.universities for update to authenticated using ((select public.is_super_admin())) with check ((select public.is_super_admin()));
create policy universities_super_delete on public.universities for delete to authenticated using ((select public.is_super_admin()) and not exists (select 1 from public.competitions c where c.university_id = universities.id) and not exists (select 1 from public.teams t where t.university_id = universities.id) and not exists (select 1 from public.players p where p.university_id = universities.id) and not exists (select 1 from public.matches m where m.university_id = universities.id) and not exists (select 1 from public.announcements a where a.university_id = universities.id) and not exists (select 1 from public.user_profiles up where up.university_id = universities.id));

create policy profiles_self_read on public.user_profiles for select to authenticated using (id = (select auth.uid()) or (select public.is_super_admin()));
create policy profiles_self_update on public.user_profiles for update to authenticated using (id = (select auth.uid()) and is_active) with check (id = (select auth.uid()) and is_active);
create policy profiles_super_read on public.user_profiles for select to authenticated using ((select public.is_super_admin()));

create policy competitions_public_read on public.competitions for select to anon, authenticated using (status = 'published' and exists (select 1 from public.universities u where u.id = competitions.university_id and u.is_active));
create policy competitions_admin_read on public.competitions for select to authenticated using ((select public.can_manage_university(university_id)));
create policy competitions_admin_insert on public.competitions for insert to authenticated with check ((select public.can_manage_university(university_id)) and not is_locked and ((select public.is_super_admin()) or status <> 'published'));
create policy competitions_admin_update on public.competitions for update to authenticated using ((select public.can_manage_university(university_id)) and ((select public.is_super_admin()) or not is_locked)) with check ((select public.can_manage_university(university_id)) and ((select public.is_super_admin()) or not is_locked));
create policy competitions_admin_delete on public.competitions for delete to authenticated using ((select public.can_manage_university(university_id)) and ((select public.is_super_admin()) or (not is_locked and status = 'draft')));

create policy teams_public_read on public.teams for select to anon, authenticated using (is_active and exists (select 1 from public.competition_teams ct join public.competitions c on c.id = ct.competition_id where ct.team_id = teams.id and c.status = 'published'));
create policy teams_admin_read on public.teams for select to authenticated using ((select public.can_manage_university(university_id)));
create policy teams_admin_insert on public.teams for insert to authenticated with check ((select public.can_manage_university(university_id)) and not is_locked);
create policy teams_admin_update on public.teams for update to authenticated using ((select public.can_manage_university(university_id)) and ((select public.is_super_admin()) or not is_locked)) with check ((select public.can_manage_university(university_id)) and ((select public.is_super_admin()) or not is_locked));
create policy teams_admin_delete on public.teams for delete to authenticated using ((select public.can_manage_university(university_id)) and ((select public.is_super_admin()) or not is_locked) and not exists (select 1 from public.competition_teams ct where ct.team_id = teams.id));

create policy competition_teams_public_read on public.competition_teams for select to anon, authenticated using (exists (select 1 from public.competitions c where c.id = competition_id and c.status = 'published'));
create policy competition_teams_admin_read on public.competition_teams for select to authenticated using ((select public.can_manage_university(university_id)));
create policy competition_teams_admin_insert on public.competition_teams for insert to authenticated with check ((select public.can_manage_university(university_id)) and exists (select 1 from public.competitions c where c.id = competition_id and (select public.is_super_admin() or not c.is_locked)));
create policy competition_teams_admin_update on public.competition_teams for update to authenticated using ((select public.can_manage_university(university_id)) and exists (select 1 from public.competitions c where c.id = competition_id and (select public.is_super_admin() or not c.is_locked))) with check ((select public.can_manage_university(university_id)) and exists (select 1 from public.competitions c where c.id = competition_id and (select public.is_super_admin() or not c.is_locked)));
create policy competition_teams_admin_delete on public.competition_teams for delete to authenticated using ((select public.can_manage_university(university_id)) and exists (select 1 from public.competitions c where c.id = competition_id and (select public.is_super_admin() or not c.is_locked)));

create policy players_public_read on public.players for select to anon, authenticated using (is_active and exists (select 1 from public.player_registrations pr join public.competitions c on c.id = pr.competition_id where pr.player_id = players.id and c.status = 'published'));
create policy players_admin_read on public.players for select to authenticated using ((select public.can_manage_university(university_id)));
create policy players_admin_insert on public.players for insert to authenticated with check ((select public.can_manage_university(university_id)) and not is_locked);
create policy players_admin_update on public.players for update to authenticated using ((select public.can_manage_university(university_id)) and ((select public.is_super_admin()) or not is_locked)) with check ((select public.can_manage_university(university_id)) and ((select public.is_super_admin()) or not is_locked));
create policy players_admin_delete on public.players for delete to authenticated using ((select public.can_manage_university(university_id)) and ((select public.is_super_admin()) or not is_locked) and not exists (select 1 from public.player_registrations pr where pr.player_id = players.id));

create policy player_registrations_public_read on public.player_registrations for select to anon, authenticated using (exists (select 1 from public.competitions c where c.id = competition_id and c.status = 'published'));
create policy player_registrations_admin_read on public.player_registrations for select to authenticated using ((select public.can_manage_university(university_id)));
create policy player_registrations_admin_insert on public.player_registrations for insert to authenticated with check ((select public.can_manage_university(university_id)) and exists (select 1 from public.competitions c where c.id = competition_id and (select public.is_super_admin() or not c.is_locked)));
create policy player_registrations_admin_update on public.player_registrations for update to authenticated using ((select public.can_manage_university(university_id)) and exists (select 1 from public.competitions c where c.id = competition_id and (select public.is_super_admin() or not c.is_locked))) with check ((select public.can_manage_university(university_id)) and exists (select 1 from public.competitions c where c.id = competition_id and (select public.is_super_admin() or not c.is_locked)));
create policy player_registrations_admin_delete on public.player_registrations for delete to authenticated using ((select public.can_manage_university(university_id)) and exists (select 1 from public.competitions c where c.id = competition_id and (select public.is_super_admin() or not c.is_locked)));

create policy matches_public_read on public.matches for select to anon, authenticated using (published_at is not null and exists (select 1 from public.competitions c where c.id = competition_id and c.status = 'published'));
create policy matches_admin_read on public.matches for select to authenticated using ((select public.can_manage_university(university_id)));
create policy matches_admin_insert on public.matches for insert to authenticated with check ((select public.can_manage_university(university_id)) and not is_locked and exists (select 1 from public.competitions c where c.id = competition_id and (select public.is_super_admin() or not c.is_locked)));
create policy matches_admin_update on public.matches for update to authenticated using ((select public.can_manage_university(university_id)) and ((select public.is_super_admin()) or (not is_locked and exists (select 1 from public.competitions c where c.id = competition_id and not c.is_locked)))) with check ((select public.can_manage_university(university_id)) and ((select public.is_super_admin()) or not is_locked));
create policy matches_admin_delete on public.matches for delete to authenticated using ((select public.can_manage_university(university_id)) and ((select public.is_super_admin()) or (not is_locked and status = 'scheduled')));

create policy match_players_public_read on public.match_players for select to anon, authenticated using (exists (select 1 from public.matches m where m.id = match_id and m.published_at is not null));
create policy match_players_admin_read on public.match_players for select to authenticated using ((select public.can_manage_university(university_id)));
create policy match_players_admin_insert on public.match_players for insert to authenticated with check ((select public.can_manage_university(university_id)) and exists (select 1 from public.matches m where m.id = match_id and (select public.is_super_admin() or (not m.is_locked and exists (select 1 from public.competitions c where c.id = m.competition_id and not c.is_locked)))));
create policy match_players_admin_update on public.match_players for update to authenticated using ((select public.can_manage_university(university_id)) and exists (select 1 from public.matches m where m.id = match_id and (select public.is_super_admin() or (not m.is_locked and exists (select 1 from public.competitions c where c.id = m.competition_id and not c.is_locked))))) with check ((select public.can_manage_university(university_id)));
create policy match_players_admin_delete on public.match_players for delete to authenticated using ((select public.can_manage_university(university_id)) and exists (select 1 from public.matches m where m.id = match_id and (select public.is_super_admin() or (not m.is_locked and status = 'scheduled' and exists (select 1 from public.competitions c where c.id = m.competition_id and not c.is_locked)))));

create policy match_events_public_read on public.match_events for select to anon, authenticated using (exists (select 1 from public.matches m where m.id = match_id and m.published_at is not null));
create policy match_events_admin_read on public.match_events for select to authenticated using ((select public.can_manage_university(university_id)));
create policy match_events_admin_insert on public.match_events for insert to authenticated with check ((select public.can_manage_university(university_id)) and exists (select 1 from public.matches m where m.id = match_id and (select public.is_super_admin() or (not m.is_locked and exists (select 1 from public.competitions c where c.id = m.competition_id and not c.is_locked)))));
create policy match_events_admin_update on public.match_events for update to authenticated using ((select public.can_manage_university(university_id)) and exists (select 1 from public.matches m where m.id = match_id and (select public.is_super_admin() or (not m.is_locked and exists (select 1 from public.competitions c where c.id = m.competition_id and not c.is_locked))))) with check ((select public.can_manage_university(university_id)));
create policy match_events_admin_delete on public.match_events for delete to authenticated using ((select public.can_manage_university(university_id)) and exists (select 1 from public.matches m where m.id = match_id and (select public.is_super_admin() or (not m.is_locked and status in ('scheduled', 'warm_up') and exists (select 1 from public.competitions c where c.id = m.competition_id and not c.is_locked)))));

create policy announcements_public_read on public.announcements for select to anon, authenticated using (is_published and exists (select 1 from public.universities u where u.id = announcements.university_id and u.is_active) and (announcements.competition_id is null or exists (select 1 from public.competitions c where c.id = announcements.competition_id and c.status = 'published')));
create policy announcements_admin_read on public.announcements for select to authenticated using ((select public.can_manage_university(university_id)));
create policy announcements_admin_insert on public.announcements for insert to authenticated with check ((select public.can_manage_university(university_id)));
create policy announcements_admin_update on public.announcements for update to authenticated using ((select public.can_manage_university(university_id))) with check ((select public.can_manage_university(university_id)));
create policy announcements_admin_delete on public.announcements for delete to authenticated using ((select public.can_manage_university(university_id)));

create policy audit_super_read on public.audit_logs for select to authenticated using ((select public.is_super_admin()));
create policy audit_university_read on public.audit_logs for select to authenticated using ((select public.is_university_admin_for(university_id)));

comment on function public.is_super_admin() is 'True only when the trusted app_metadata role matches an active server-managed profile.';
comment on function public.is_university_admin_for(uuid) is 'Checks trusted app_metadata university scope against an active server-managed profile.';
comment on table public.player_registrations is 'A time-bounded team/competition registration for a permanent player identity.';
comment on table public.match_events is 'Chronological match events refer to permanent player IDs for career statistics.';
