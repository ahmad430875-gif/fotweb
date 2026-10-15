-- Migration: create competition_standings view
-- Generates aggregated league table rows per competition and team from finished matches

create or replace view public.competition_standings with (security_invoker = true) as
with finished_matches as (
  select * from public.matches where status = 'full_time'
),
per_side as (
  -- home side contributions
  select
    fm.competition_id,
    fm.home_team_id as team_id,
    1 as played,
    case when fm.home_score > fm.away_score then 1 else 0 end as wins,
    case when fm.home_score = fm.away_score then 1 else 0 end as draws,
    case when fm.home_score < fm.away_score then 1 else 0 end as losses,
    coalesce(fm.home_score,0) as gf,
    coalesce(fm.away_score,0) as ga
  from finished_matches fm
  union all
  -- away side contributions
  select
    fm.competition_id,
    fm.away_team_id as team_id,
    1 as played,
    case when fm.away_score > fm.home_score then 1 else 0 end as wins,
    case when fm.away_score = fm.home_score then 1 else 0 end as draws,
    case when fm.away_score < fm.home_score then 1 else 0 end as losses,
    coalesce(fm.away_score,0) as gf,
    coalesce(fm.home_score,0) as ga
  from finished_matches fm
)
select
  ps.competition_id,
  ps.team_id,
  t.name as team_name,
  t.short_name,
  t.logo_url,
  sum(ps.played)::integer as played,
  sum(ps.wins)::integer as wins,
  sum(ps.draws)::integer as draws,
  sum(ps.losses)::integer as losses,
  sum(ps.gf)::integer as gf,
  sum(ps.ga)::integer as ga,
  (sum(ps.gf) - sum(ps.ga))::integer as gd,
  (sum(ps.wins) * 3 + sum(ps.draws))::integer as pts
from per_side ps
left join public.teams t on t.id = ps.team_id
group by ps.competition_id, ps.team_id, t.name, t.short_name, t.logo_url
order by ps.competition_id, pts desc, gd desc, gf desc;
