update public.matches m
set published_at = now()
from public.match_brackets b
where b.match_id = m.id
  and m.published_at is null;

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
        kickoff_at, venue, status, home_score, away_score, created_by, published_at
    ) values (
        new.competition_id, competition_university, new.home_team_id, new.away_team_id,
        round_name, coalesce(new.match_date, now()), new.venue, new.match_status,
        new.home_score, new.away_score, (select auth.uid()), now()
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