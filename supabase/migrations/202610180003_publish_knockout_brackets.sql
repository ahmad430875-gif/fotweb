alter table public.competitions
  add column if not exists knockout_published boolean not null default false;

grant select on public.tournament_stages, public.tournament_rounds, public.match_brackets to anon, authenticated;

create policy tournament_stages_public_knockout_read on public.tournament_stages
  for select to anon, authenticated
  using (
    stage_type = 'knockout'
    and exists (
      select 1
      from public.competitions c
      join public.universities u on u.id = c.university_id and u.is_active
      where c.id = competition_id
        and c.status = 'published'
        and c.knockout_published
    )
  );

create policy tournament_rounds_public_knockout_read on public.tournament_rounds
  for select to anon, authenticated
  using (exists (
    select 1
    from public.tournament_stages s
    join public.competitions c on c.id = s.competition_id
    join public.universities u on u.id = c.university_id and u.is_active
    where s.id = stage_id
      and s.stage_type = 'knockout'
      and c.status = 'published'
      and c.knockout_published
  ));

create policy match_brackets_public_knockout_read on public.match_brackets
  for select to anon, authenticated
  using (exists (
    select 1
    from public.tournament_rounds r
    join public.tournament_stages s on s.id = r.stage_id
    join public.competitions c on c.id = s.competition_id
    join public.universities u on u.id = c.university_id and u.is_active
    where r.id = round_id
      and s.stage_type = 'knockout'
      and c.id = match_brackets.competition_id
      and c.status = 'published'
      and c.knockout_published
  ));