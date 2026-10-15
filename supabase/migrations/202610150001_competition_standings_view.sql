-- Keep the established view columns in place and append the public page aliases.
create or replace view public.competition_standings with (security_invoker = true) as
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
  logo_url, wins, draws, losses, goals_for as gf, goals_against as ga,
  goal_difference as gd, points as pts
from totals;
