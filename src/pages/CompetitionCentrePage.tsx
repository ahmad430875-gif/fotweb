import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, CalendarDays, CircleDot, Newspaper, Shield, Star, Trophy, Users } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { PublicFrame } from './PublicPages'
import { supabase } from '../lib/supabase'
import { publicImageUrl } from '../lib/imageUrl'
import { PublicKnockoutBracket, type PublicBracketFixture, type PublicBracketStage } from './PublicKnockoutBracket'

type Competition = { id: string; university_id: string; name: string; season: string; type: string; format: string; start_date: string; end_date: string; ended_at: string | null; venue: string | null; description: string; logo_url: string | null; banner_url: string | null; points_for_win: number; points_for_draw: number; points_for_loss: number; qualifiers_per_group: number; knockout_published: boolean }
type Team = { id: string; name: string; short_name: string; logo_url: string | null }
type Match = { id: string; competition_id: string; home_team_id: string; away_team_id: string; kickoff_at: string; status: string; home_score: number; away_score: number; round: string | null; venue: string | null; published_at: string | null }
type Standing = { position: number; team_id: string; team_name: string; short_name: string; logo_url: string | null; played: number; wins: number; draws: number; losses: number; goals_for: number; goals_against: number; goal_difference: number; points: number }
type GroupStanding = Standing & { group_name: string; qualified: boolean }
type PlayerStat = { player_id: string; full_name: string; photo_url: string | null; team_id: string; team_name: string; appearances: number; goals: number; assists: number; clean_sheets: number; yellow_cards: number; red_cards: number }
type NewsItem = { id: string; title: string; body: string; published_at: string | null; created_at: string; team_id: string | null; match_id: string | null }
type TabId = 'table' | 'fixtures' | 'knockout' | 'players' | 'teams' | 'seasons' | 'news'
type TableMode = 'all' | 'home' | 'away' | 'xg'

const tabs: Array<{ id: TabId; label: string }> = [
  { id: 'table', label: 'Table' },
  { id: 'fixtures', label: 'Fixtures' },
  { id: 'knockout', label: 'Knockout' },
  { id: 'players', label: 'Player stats' },
  { id: 'teams', label: 'Team stats' },
  { id: 'seasons', label: 'Seasons' },
  { id: 'news', label: 'News' },
]

export function CompetitionCentrePage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [competition, setCompetition] = useState<Competition | null>(null)
  const [universityName, setUniversityName] = useState('University football')
  const [matches, setMatches] = useState<Match[]>([])
  const [teams, setTeams] = useState<Record<string, Team>>({})
  const [standings, setStandings] = useState<Standing[]>([])
  const [groupStandings, setGroupStandings] = useState<GroupStanding[]>([])
  const [knockoutStages, setKnockoutStages] = useState<PublicBracketStage[]>([])
  const [knockoutError, setKnockoutError] = useState(false)
  const [standingsError, setStandingsError] = useState(false)
  const [playerStats, setPlayerStats] = useState<PlayerStat[]>([])
  const [seasons, setSeasons] = useState<Competition[]>([])
  const [news, setNews] = useState<NewsItem[]>([])
  const [newsError, setNewsError] = useState(false)
  const [activeTab, setActiveTab] = useState<TabId>('table')
  const [tableMode, setTableMode] = useState<TableMode>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [followed, setFollowed] = useState(() => {
    if (typeof window === 'undefined' || !id) return false
    return window.localStorage.getItem(`fotweb-follow-${id}`) === 'true'
  })

  useEffect(() => {
    if (!supabase || !id) {
      setError('Competition data is unavailable. Check the Supabase connection.')
      setLoading(false)
      return
    }
    let active = true
    const client = supabase
    async function load() {
      setLoading(true)
      setError('')
      const { data: comp, error: compError } = await client.from('competitions')
        .select('id, university_id, name, season, type, format, start_date, end_date, ended_at, venue, description, logo_url, banner_url, points_for_win, points_for_draw, points_for_loss, qualifiers_per_group, knockout_published')
        .eq('id', id)
        .maybeSingle()
      if (!active) return
      if (compError || !comp) {
        setError(compError?.message ?? 'This competition is not published.')
        setLoading(false)
        return
      }
      setCompetition(comp as Competition)

      const knockoutStageRequest = comp.knockout_published
        ? client.from('tournament_stages').select('id, name, sequence_order').eq('competition_id', id).eq('stage_type', 'knockout').order('sequence_order')
        : Promise.resolve({ data: [], error: null })
      const [universityResult, matchResult, memberResult, standingsResult, statsResult, seasonsResult, newsResult, groupStandingsResult, knockoutStageResult] = await Promise.all([
        client.from('universities').select('name').eq('id', comp.university_id).maybeSingle(),
        client.from('matches').select('id, competition_id, home_team_id, away_team_id, kickoff_at, status, home_score, away_score, round, venue, published_at').eq('competition_id', id).not('published_at', 'is', null).order('kickoff_at'),
        client.from('competition_teams').select('team_id').eq('competition_id', id),
        client.from('competition_standings').select('position, team_id, team_name, short_name, logo_url, played, wins, draws, losses, goals_for, goals_against, goal_difference, points').eq('competition_id', id).order('position'),
        client.from('competition_player_stats').select('player_id, full_name, photo_url, team_id, team_name, appearances, goals, assists, clean_sheets, yellow_cards, red_cards').eq('competition_id', id),
        client.from('competitions').select('id, university_id, name, season, type, format, start_date, end_date, ended_at, venue, description, logo_url, banner_url, points_for_win, points_for_draw, points_for_loss, qualifiers_per_group, knockout_published').eq('university_id', comp.university_id).eq('name', comp.name).order('start_date', { ascending: false }),
        client.from('announcements').select('id, title, body, published_at, created_at, team_id, match_id').eq('competition_id', id).eq('is_published', true).order('published_at', { ascending: false }),
        client.from('competition_group_standings').select('position, competition_id, group_name, team_id, team_name, short_name, logo_url, played, wins, draws, losses, goals_for, goals_against, goal_difference, points, qualified').eq('competition_id', id).order('group_name').order('position'),
        knockoutStageRequest,
      ])
      if (!active) return
      setUniversityName(universityResult.data?.name ?? 'University football')
      const matchRows = (matchResult.data ?? []) as Match[]
      setMatches(matchRows)
      setStandings((standingsResult.data ?? []) as Standing[])
      setStandingsError(Boolean(standingsResult.error))
      setGroupStandings(groupStandingsResult.error ? [] : groupStandingsResult.data as GroupStanding[])
      setPlayerStats((statsResult.data ?? []) as PlayerStat[])
      setSeasons((seasonsResult.data ?? []) as Competition[])
      setNews((newsResult.data ?? []) as NewsItem[])
      setNewsError(Boolean(newsResult.error))

      const stageRows = (knockoutStageResult.data ?? []) as Array<{ id: string; name: string; sequence_order: number }>
      const stageIds = stageRows.map((stage) => stage.id)
      let rounds: Array<{ id: string; name: string; round_number: number; stage_id: string }> = []
      let bracketFixtures: PublicBracketFixture[] = []
      let bracketError = Boolean(knockoutStageResult.error)
      if (stageIds.length) {
        const roundResult = await client.from('tournament_rounds').select('id, name, round_number, stage_id').in('stage_id', stageIds).order('round_number')
        if (!active) return
        if (roundResult.error) bracketError = true
        else {
          rounds = (roundResult.data ?? []) as typeof rounds
          const roundIds = rounds.map((round) => round.id)
          if (roundIds.length) {
            const fixtureResult = await client.from('match_brackets').select('id, match_id, round_id, home_team_id, away_team_id, home_score, away_score, match_status, winner_team_id, match_date').in('round_id', roundIds).order('match_date')
            if (!active) return
            if (fixtureResult.error) bracketError = true
            else bracketFixtures = (fixtureResult.data ?? []) as PublicBracketFixture[]
          }
        }
      }
      setKnockoutStages(stageRows.map((stage) => ({
        ...stage,
        rounds: rounds.filter((round) => round.stage_id === stage.id).map((round) => ({
          ...round,
          fixtures: bracketFixtures.filter((fixture) => fixture.round_id === round.id),
        })),
      })))
      setKnockoutError(bracketError)

      const teamIds = [...new Set([
        ...(memberResult.data ?? []).map((row) => row.team_id),
        ...matchRows.flatMap((row) => [row.home_team_id, row.away_team_id]),
        ...bracketFixtures.flatMap((fixture) => [fixture.home_team_id, fixture.away_team_id]),
      ])]
      if (teamIds.length) {
        const { data: teamRows } = await client.from('teams').select('id, name, short_name, logo_url').in('id', teamIds)
        if (!active) return
        setTeams(Object.fromEntries((teamRows ?? []).map((team) => [team.id, team as Team])))
      } else {
        setTeams({})
      }
      setLoading(false)
    }
    void load()
    return () => { active = false }
  }, [id])

  useEffect(() => {
    if (!id || typeof window === 'undefined') return
    setFollowed(window.localStorage.getItem(`fotweb-follow-${id}`) === 'true')
  }, [id])

  const computedStandings = useMemo(() => calculateStandings(teams, matches, competition), [competition, matches, teams])
  const fullStandings = standings.length ? standings : computedStandings
  const displayedStandings = useMemo(() => {
    if (tableMode === 'all' || tableMode === 'xg') return fullStandings
    return calculateStandings(teams, matches, competition, tableMode)
  }, [competition, fullStandings, matches, tableMode, teams])
  const teamNames = Object.fromEntries(Object.entries(teams).map(([teamId, team]) => [teamId, team.name]))
  const groupedFixtures = useMemo(() => groupFixtures(matches), [matches])
  const sortedPlayerStats = useMemo(() => [...playerStats].sort((a, b) => b.goals - a.goals || b.assists - a.assists), [playerStats])

  useEffect(() => {
    if (competition?.knockout_published) setActiveTab('knockout')
  }, [competition?.id, competition?.knockout_published])

  function toggleFollow() {
    const next = !followed
    setFollowed(next)
    if (id) window.localStorage.setItem(`fotweb-follow-${id}`, String(next))
  }

  if (loading) return <PublicFrame><main className="public-detail-page"><div className="public-loading">Loading competition centre…</div></main></PublicFrame>
  if (error || !competition) return <PublicFrame><main className="public-detail-page"><div className="public-empty"><CircleDot size={19} /><strong>Competition unavailable</strong><span>{error || 'This competition is not publicly available.'}</span><Link className="public-detail-inline" to="/competitions">Browse competitions <ArrowRight size={14} /></Link></div></main></PublicFrame>

  const visibleTabs = tabs.filter((tab) => tab.id !== 'knockout' || competition.knockout_published)

  return <PublicFrame>
    <main className="public-detail-page league-centre">
      <Link to="/competitions" className="public-detail-back"><ArrowLeft size={15} /> Competitions</Link>
      <header className={`league-hero ${competition.banner_url ? 'league-hero-with-banner' : ''}`}>
        {competition.banner_url && <img className="league-hero-banner" src={publicImageUrl(competition.banner_url)} alt="" />}
        <span className="league-badge">{competition.logo_url ? <img src={publicImageUrl(competition.logo_url)} alt="" /> : <Trophy size={25} />}</span>
        <div className="league-hero-copy"><span className="public-overline">{universityName} · {label(competition.type)}{competition.ended_at ? ' · ENDED' : ''}</span><h1>{competition.name}</h1><p>{label(competition.format)} · {competition.venue || 'University competition'}</p></div>
        <div className="league-hero-actions">
          <label className="league-season-select"><span>Season</span><select value={competition.id} onChange={(event) => navigate(`/competitions/${event.target.value}`)} aria-label="Select historical season">
            {(seasons.length ? seasons : [competition]).map((season) => <option value={season.id} key={season.id}>{season.season}</option>)}
          </select></label>
          <button className={`league-follow ${followed ? 'league-follow-active' : ''}`} type="button" onClick={toggleFollow} aria-pressed={followed}><Star size={15} fill={followed ? 'currentColor' : 'none'} />{followed ? 'Following' : 'Follow'}</button>
        </div>
      </header>

      <nav className="league-tabs" role="tablist" aria-label="Competition sections">
        {visibleTabs.map((tab) => <button type="button" role="tab" aria-selected={activeTab === tab.id} aria-controls={`league-panel-${tab.id}`} id={`league-tab-${tab.id}`} className={`league-tab ${activeTab === tab.id ? 'league-tab-active' : ''}`} key={tab.id} onClick={() => setActiveTab(tab.id)}>{tab.id === 'table' && competition.knockout_published ? 'Group table' : tab.label}</button>)}
      </nav>

      <div className="league-tab-panel" role="tabpanel" id={`league-panel-${activeTab}`} aria-labelledby={`league-tab-${activeTab}`}>
        {activeTab === 'table' && <section className="league-content-section">
          <div className="league-section-heading"><div><span className="public-overline">{competition.season} SEASON</span><h2>{groupStandings.length ? 'Group standings' : competition.knockout_published ? 'Group stage · final table' : 'League table'}</h2></div><span className="league-team-total">{groupStandings.length ? `${groupStandings.length} teams · ${new Set(groupStandings.map((row) => row.group_name)).size} groups` : `${fullStandings.length} teams`}</span></div>
          {!groupStandings.length && <>
          <div className="league-filters" role="group" aria-label="Table split">
            {([{ id: 'all', label: 'All' }, { id: 'home', label: 'Home' }, { id: 'away', label: 'Away' }, { id: 'xg', label: 'xG' }] as const).map((filter) => <button type="button" key={filter.id} className={`league-filter ${tableMode === filter.id ? 'league-filter-active' : ''} ${filter.id === 'xg' ? 'league-filter-unavailable' : ''}`} aria-pressed={tableMode === filter.id} onClick={() => setTableMode(filter.id)}>{filter.label}{filter.id === 'xg' && <small>not tracked</small>}</button>)}
          </div>
          {tableMode === 'xg' ? <div className="league-empty"><CircleDot size={18} /><strong>Expected goals aren’t recorded</strong><span>This competition has no xG data, so no xG table can be calculated.</span></div> : standingsError && !fullStandings.length ? <div className="league-empty"><CircleDot size={18} /><strong>Standings unavailable</strong><span>Published match results will populate the table.</span></div> : !displayedStandings.length ? <div className="league-empty"><Trophy size={18} /><strong>No standings yet</strong><span>Participating teams will appear once registered.</span></div> : <div className="league-table-wrap"><table className="league-table">
            <thead><tr><th>#</th><th>Team</th><th>PL</th><th>W</th><th>D</th><th>L</th><th>GF</th><th>GA</th><th>GD</th><th>PTS</th><th>Form</th><th>Next</th></tr></thead>
            <tbody>{displayedStandings.map((row, index) => {
              const form = recentForm(row.team_id, matches)
              const next = nextMatch(row.team_id, matches)
              const nextTeamId = next ? (next.home_team_id === row.team_id ? next.away_team_id : next.home_team_id) : ''
              return <tr className={index === 0 ? 'league-row-leader' : ''} key={row.team_id}>
                <td>{row.position ?? index + 1}</td>
                <td><Link className="league-team-cell" to={`/teams/${row.team_id}`}><span className="league-team-badge">{row.logo_url || teams[row.team_id]?.logo_url ? <img src={publicImageUrl(row.logo_url || teams[row.team_id]?.logo_url)} alt="" /> : <Shield size={16} />}</span><strong>{row.team_name || teams[row.team_id]?.name}</strong></Link></td>
                <td>{row.played}</td><td>{row.wins}</td><td>{row.draws}</td><td>{row.losses}</td><td>{row.goals_for}</td><td>{row.goals_against}</td><td>{row.goal_difference > 0 ? `+${row.goal_difference}` : row.goal_difference}</td><td><strong>{row.points}</strong></td>
                <td><div className="league-form-dots" aria-label="Recent form">{form.map((value, formIndex) => <span className={`league-form-${value.toLowerCase()}`} key={`${value}-${formIndex}`} title={formTitle(value)}>{value}</span>)}</div></td>
                <td>{next ? <Link className="league-next-opponent" to={`/matches/${next.id}`} title={`Next: ${teamNames[nextTeamId] ?? 'opponent'}`}>{teams[nextTeamId]?.short_name ?? teams[nextTeamId]?.name ?? '—'}</Link> : <span className="league-muted">—</span>}</td>
              </tr>
            })}</tbody>
          </table></div>}
          </>}
          {groupStandings.length > 0 && <section className="league-group-tables">
            <div className="league-section-heading"><div><span className="public-overline">GROUP STAGE</span><h2>Qualification tables</h2></div><span className="league-team-total">Top {competition.qualifiers_per_group} advance</span></div>
            {[...new Set(groupStandings.map((row) => row.group_name))].map((groupName) => <div className="league-group-table" key={groupName}>
              <h3>Group {groupName}</h3>
              <div className="league-table-wrap"><table className="league-table"><thead><tr><th>#</th><th>Team</th><th>PL</th><th>W</th><th>D</th><th>L</th><th>GD</th><th>PTS</th><th>Qualification</th></tr></thead><tbody>
                {groupStandings.filter((row) => row.group_name === groupName).map((row) => {
                  const qualified = row.position <= competition.qualifiers_per_group
                  return <tr className={qualified ? 'league-row-qualified' : ''} key={row.team_id}>
                  <td>{row.position}</td><td><Link className="league-team-cell" to={`/teams/${row.team_id}`}><span className="league-team-badge">{row.logo_url ? <img src={publicImageUrl(row.logo_url)} alt="" /> : <Shield size={16} />}</span><strong>{row.team_name}</strong></Link></td>
                  <td>{row.played}</td><td>{row.wins}</td><td>{row.draws}</td><td>{row.losses}</td><td>{row.goal_difference > 0 ? `+${row.goal_difference}` : row.goal_difference}</td><td><strong>{row.points}</strong></td><td>{qualified ? 'Qualified' : '—'}</td>
                </tr>})}
              </tbody></table></div>
            </div>)}
          </section>}
          <p className="league-table-note"><span className="league-zone-marker" />{groupStandings.length ? 'Green-highlighted teams qualify from their group.' : 'Current table leader.'}</p>
        </section>}

        {activeTab === 'fixtures' && <section className="league-content-section">
          <div className="league-section-heading"><div><span className="public-overline">MATCH SCHEDULE</span><h2>Fixtures & results</h2></div><span className="league-team-total">{matches.length} matches</span></div>
          {!matches.length ? <div className="league-empty"><CalendarDays size={18} /><strong>No published fixtures</strong><span>Fixtures will appear here when they’re published.</span></div> : <div className="league-fixture-groups">{groupedFixtures.map(([date, fixtureRows]) => <section className="league-fixture-group" key={date}>
            <h3>{date}</h3><div>{fixtureRows.map((match) => <FixtureRow match={match} teams={teams} key={match.id} />)}</div>
          </section>)}</div>}
        </section>}

        {activeTab === 'knockout' && <section className="league-content-section">
          {knockoutError ? <div className="league-empty"><CircleDot size={18} /><strong>Knockout bracket unavailable</strong><span>Couldn’t load the published tournament rounds.</span></div> : <PublicKnockoutBracket stages={knockoutStages} teams={teams} />}
        </section>}

        {activeTab === 'players' && <section className="league-content-section">
          <div className="league-section-heading"><div><span className="public-overline">SEASON LEADERS</span><h2>Player statistics</h2></div></div>
          {!playerStats.length ? <div className="league-empty"><Users size={18} /><strong>Player stats not available yet</strong><span>Statistics appear after published matches are completed.</span></div> : <div className="league-leaderboard-grid">
            <Leaderboard title="Top scorers" rows={sortedPlayerStats} value="goals" />
            <Leaderboard title="Top assists" rows={[...playerStats].sort((a, b) => b.assists - a.assists)} value="assists" />
            <Leaderboard title="Most appearances" rows={[...playerStats].sort((a, b) => b.appearances - a.appearances)} value="appearances" />
            <Leaderboard title="Clean sheets" rows={[...playerStats].sort((a, b) => b.clean_sheets - a.clean_sheets)} value="clean_sheets" />
            <Leaderboard title="Yellow cards" rows={[...playerStats].sort((a, b) => b.yellow_cards - a.yellow_cards)} value="yellow_cards" />
            <Leaderboard title="Red cards" rows={[...playerStats].sort((a, b) => b.red_cards - a.red_cards)} value="red_cards" />
          </div>}
        </section>}

        {activeTab === 'teams' && <section className="league-content-section">
          <div className="league-section-heading"><div><span className="public-overline">TEAM PERFORMANCE</span><h2>Team statistics</h2></div></div>
          {!fullStandings.length ? <div className="league-empty"><Trophy size={18} /><strong>Team stats not available yet</strong><span>Published full-time results are needed to calculate team totals.</span></div> : <div className="league-team-stats-grid">
            {[
              { label: 'Goals scored', key: 'goals_for' as const, highest: true },
              { label: 'Goals conceded', key: 'goals_against' as const, highest: false },
              { label: 'Wins', key: 'wins' as const, highest: true },
              { label: 'Points', key: 'points' as const, highest: true },
            ].map((stat) => {
              const sorted = [...fullStandings].sort((a, b) => stat.highest ? b[stat.key] - a[stat.key] : a[stat.key] - b[stat.key]).slice(0, 5)
              const max = Math.max(1, ...sorted.map((row) => row[stat.key]))
              return <section className="league-team-stat-panel" key={stat.key}><h3>{stat.label}</h3>{sorted.map((row) => <div className="league-team-stat-row" key={row.team_id}><span>{row.team_name}</span><i><b style={{ width: `${row[stat.key] / max * 100}%` }} /></i><strong>{row[stat.key]}</strong></div>)}</section>
            })}
            <div className="league-data-note"><CircleDot size={15} />Possession and xG aren’t recorded in this competition’s data.</div>
          </div>}
        </section>}

        {activeTab === 'seasons' && <section className="league-content-section">
          <div className="league-section-heading"><div><span className="public-overline">HISTORICAL ARCHIVE</span><h2>Seasons</h2></div><span className="league-team-total">{seasons.length} editions</span></div>
          <div className="league-season-list">{seasons.map((season) => <Link className={`league-season-row ${season.id === competition.id ? 'league-season-current' : ''}`} to={`/competitions/${season.id}`} key={season.id}>
            <span className="league-season-mark"><Trophy size={17} /></span><span><strong>{season.season}</strong><small>{season.name} · {label(season.format)}</small></span><span className="league-season-range">{formatShortDate(season.start_date)} – {formatShortDate(season.end_date)}</span><ArrowRight size={16} />
          </Link>)}</div>
        </section>}

        {activeTab === 'news' && <section className="league-content-section">
          <div className="league-section-heading"><div><span className="public-overline">LATEST UPDATES</span><h2>Competition news</h2></div><Newspaper size={18} /></div>
          {newsError ? <div className="league-empty"><CircleDot size={18} /><strong>News unavailable</strong><span>Couldn’t load published competition announcements.</span></div> : !news.length ? <div className="league-empty"><Newspaper size={18} /><strong>No news published</strong><span>Competition announcements will appear here.</span></div> : <div className="league-news-grid">{news.map((article) => <article className="league-news-card" key={article.id}>
            <div className="league-news-meta"><span>{teams[article.team_id ?? '']?.name ?? universityName}</span><time>{formatShortDate(article.published_at ?? article.created_at)}</time></div><h3>{article.title}</h3><p>{article.body}</p>{article.match_id && <Link to={`/matches/${article.match_id}`}>Match details <ArrowRight size={13} /></Link>}
          </article>)}</div>}
        </section>}
      </div>
    </main>
  </PublicFrame>
}

function FixtureRow({ match, teams }: { match: Match; teams: Record<string, Team> }) {
  const home = teams[match.home_team_id]
  const away = teams[match.away_team_id]
  const final = match.status === 'full_time'
  const live = match.status === 'live' || match.status === 'half_time'
  return <Link to={`/matches/${match.id}`} className="league-fixture-row">
    <span className="league-kickoff">{new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit' }).format(new Date(match.kickoff_at))}{match.round && <small>{match.round}</small>}</span>
    <span className="league-fixture-side"><TeamBadge team={home} /><strong>{home?.name ?? 'Home team'}</strong></span>
    <span className={`league-fixture-score ${live ? 'league-score-live' : ''}`}>{final || live ? `${match.home_score} – ${match.away_score}` : 'vs'}{live && <small>{match.status === 'half_time' ? 'HT' : 'LIVE'}</small>}</span>
    <span className="league-fixture-side league-fixture-away"><TeamBadge team={away} /><strong>{away?.name ?? 'Away team'}</strong></span>
    {match.venue && <span className="league-fixture-venue">{match.venue}</span>}
  </Link>
}

function TeamBadge({ team }: { team?: Team }) {
  return <span className="league-team-badge">{team?.logo_url ? <img src={publicImageUrl(team.logo_url)} alt="" /> : <Shield size={15} />}</span>
}

function Leaderboard({ title, rows, value }: { title: string; rows: PlayerStat[]; value: keyof Pick<PlayerStat, 'goals' | 'assists' | 'appearances' | 'clean_sheets' | 'yellow_cards' | 'red_cards'> }) {
  const sorted = rows.filter((row) => row[value] > 0).slice(0, 5)
  return <section className="league-leaderboard"><h3>{title}</h3>{sorted.length ? sorted.map((row, index) => <Link className="league-leader-row" to={`/players/${row.player_id}`} key={row.player_id}>
    <span className="league-leader-rank">{index + 1}</span><span className="league-player-avatar">{row.photo_url ? <img src={publicImageUrl(row.photo_url)} alt="" /> : <Users size={15} />}</span><span className="league-player-copy"><strong>{row.full_name}</strong><small>{row.team_name}</small></span><b>{row[value]}</b>
  </Link>) : <p className="league-leader-empty">No recorded stats</p>}</section>
}

function calculateStandings(teams: Record<string, Team>, matches: Match[], competition: Competition | null, split: 'home' | 'away' | 'all' = 'all'): Standing[] {
  const table = new Map<string, Standing>()
  Object.values(teams).forEach((team) => table.set(team.id, { position: 0, team_id: team.id, team_name: team.name, short_name: team.short_name, logo_url: team.logo_url, played: 0, wins: 0, draws: 0, losses: 0, goals_for: 0, goals_against: 0, goal_difference: 0, points: 0 }))
  const finished = matches.filter((match) => match.status === 'full_time')
  finished.forEach((match) => {
    const home = table.get(match.home_team_id)
    const away = table.get(match.away_team_id)
    if (!home || !away) return
    if (split !== 'away') applyResult(home, match.home_score, match.away_score, competition)
    if (split !== 'home') applyResult(away, match.away_score, match.home_score, competition)
  })
  const sorted = [...table.values()].map((row) => ({ ...row, goal_difference: row.goals_for - row.goals_against })).sort((a, b) => b.points - a.points || b.goal_difference - a.goal_difference || b.goals_for - a.goals_for || a.team_name.localeCompare(b.team_name))
  return sorted.map((row, index) => ({ ...row, position: index + 1 }))
}

function applyResult(row: Standing, goalsFor: number, goalsAgainst: number, competition: Competition | null) {
  row.played += 1
  row.goals_for += goalsFor
  row.goals_against += goalsAgainst
  if (goalsFor > goalsAgainst) {
    row.wins += 1
    row.points += Number(competition?.points_for_win ?? 3)
  } else if (goalsFor < goalsAgainst) {
    row.losses += 1
    row.points += Number(competition?.points_for_loss ?? 0)
  } else {
    row.draws += 1
    row.points += Number(competition?.points_for_draw ?? 1)
  }
}

function recentForm(teamId: string, matches: Match[]) {
  return matches.filter((match) => match.status === 'full_time' && [match.home_team_id, match.away_team_id].includes(teamId))
    .sort((a, b) => b.kickoff_at.localeCompare(a.kickoff_at))
    .slice(0, 5)
    .reverse()
    .map((match) => {
      const home = match.home_team_id === teamId
      const scored = home ? match.home_score : match.away_score
      const conceded = home ? match.away_score : match.home_score
      return scored > conceded ? 'W' : scored < conceded ? 'L' : 'D'
    })
}

function nextMatch(teamId: string, matches: Match[]) {
  return matches.filter((match) => match.status !== 'full_time' && match.status !== 'cancelled' && [match.home_team_id, match.away_team_id].includes(teamId))
    .sort((a, b) => a.kickoff_at.localeCompare(b.kickoff_at))[0]
}

function groupFixtures(matches: Match[]) {
  const groups = new Map<string, Match[]>()
  matches.forEach((match) => {
    const date = new Intl.DateTimeFormat('en', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(match.kickoff_at))
    groups.set(date, [...(groups.get(date) ?? []), match])
  })
  return [...groups.entries()]
}

function formTitle(value: string) {
  return value === 'W' ? 'Win' : value === 'D' ? 'Draw' : 'Loss'
}

function label(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function formatShortDate(value: string | null) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('en', { month: 'short', year: 'numeric' }).format(new Date(value))
}
