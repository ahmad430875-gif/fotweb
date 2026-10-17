import { useEffect, useState } from 'react'
import { Activity, ArrowLeft, ArrowRight, CalendarDays, CircleDot, Clock3, Goal, MapPin, Radio, Shield, Trophy, Users } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { PublicFrame } from './PublicPages'
import { supabase } from '../lib/supabase'
import { publicImageUrl } from '../lib/imageUrl'

type Match = { id: string; competition_id: string; home_team_id: string; away_team_id: string; kickoff_at: string; status: string; home_score: number; away_score: number; round: string | null; venue: string | null; referee: string | null }
type Side = { id: string; name: string; short_name: string; logo_url: string | null; university_id: string }
type Player = { id: string; full_name: string; photo_url: string | null }
type Event = { id: number; event_type: string; minute: number | null; stoppage_minute: number | null; team_id: string | null; player_id: string | null; related_player_id: string | null; assist_player_id: string | null; details: Record<string, unknown>; recorded_at: string }
type LineupEntry = { player_id: string; team_id: string; shirt_number: number | null; is_starter: boolean; is_captain: boolean; is_vice_captain: boolean; position: string | null }
type StandingsRow = { position: number; team_id: string; team_name: string; short_name: string; played: number; wins: number; draws: number; losses: number; goals_for: number; goals_against: number; goal_difference: number; points: number }
type FormEntry = { result: 'W' | 'D' | 'L'; opponent: string }
type TabId = 'facts' | 'commentary' | 'lineup' | 'table' | 'stats'

const tabs: Array<{ id: TabId; label: string }> = [
  { id: 'facts', label: 'Facts' },
  { id: 'commentary', label: 'Commentary' },
  { id: 'lineup', label: 'Lineup' },
  { id: 'table', label: 'Table' },
  { id: 'stats', label: 'Stats' },
]

export function MatchDetailPage() {
  const { id } = useParams()
  const [match, setMatch] = useState<Match | null>(null)
  const [competition, setCompetition] = useState<{ id: string; name: string; season: string } | null>(null)
  const [teams, setTeams] = useState<Record<string, Side>>({})
  const [players, setPlayers] = useState<Record<string, Player>>({})
  const [lineup, setLineup] = useState<LineupEntry[]>([])
  const [events, setEvents] = useState<Event[]>([])
  const [squads, setSquads] = useState<Array<{ id: string; title: string; team_id: string; formation: string }>>([])
  const [standings, setStandings] = useState<StandingsRow[]>([])
  const [standingsError, setStandingsError] = useState(false)
  const [formByTeam, setFormByTeam] = useState<Record<string, FormEntry[]>>({})
  const [activeTab, setActiveTab] = useState<TabId>('facts')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!supabase || !id) {
      setError('Match information is unavailable.')
      setLoading(false)
      return
    }

    let active = true
    const client = supabase
    async function load() {
      const { data: matchRow, error: matchError } = await client.from('matches')
        .select('id, competition_id, home_team_id, away_team_id, kickoff_at, status, home_score, away_score, round, venue, referee')
        .eq('id', id)
        .not('published_at', 'is', null)
        .maybeSingle()
      if (!active) return
      if (matchError || !matchRow) {
        setError('This match is not available publicly.')
        setLoading(false)
        return
      }

      const [competitionResult, teamResult, eventResult, lineupResult, squadResult, standingsResult, homeFormResult, awayFormResult] = await Promise.all([
        client.from('competitions').select('id, name, season').eq('id', matchRow.competition_id).maybeSingle(),
        client.from('teams').select('id, name, short_name, logo_url, university_id').in('id', [matchRow.home_team_id, matchRow.away_team_id]),
        client.from('match_events').select('id, event_type, minute, stoppage_minute, team_id, player_id, related_player_id, assist_player_id, details, recorded_at').eq('match_id', id).order('minute').order('stoppage_minute').order('recorded_at'),
        client.from('match_players').select('player_id, team_id, shirt_number, is_starter, is_captain, is_vice_captain, position').eq('match_id', id).order('is_starter', { ascending: false }).order('shirt_number'),
        client.from('squad_announcements').select('id, title, team_id, formation').eq('match_id', id).eq('is_published', true),
        client.from('competition_standings').select('position, team_id, team_name, short_name, played, wins, draws, losses, goals_for, goals_against, goal_difference, points').eq('competition_id', matchRow.competition_id).order('position'),
        loadRecentForm(client, matchRow.home_team_id),
        loadRecentForm(client, matchRow.away_team_id),
      ])
      if (!active) return

      const teamMap = Object.fromEntries((teamResult.data ?? []).map((team) => [team.id, team as Side]))
      const eventsData = (eventResult.data ?? []) as Event[]
      const lineupData = (lineupResult.data ?? []) as LineupEntry[]
      setMatch(matchRow as Match)
      setCompetition(competitionResult.data)
      setTeams(teamMap)
      setEvents(eventsData)
      setLineup(lineupData)
      setSquads((squadResult.data ?? []) as typeof squads)
      setStandings((standingsResult.data ?? []) as StandingsRow[])
      setStandingsError(Boolean(standingsResult.error))
      setFormByTeam({
        [matchRow.home_team_id]: toFormEntries(homeFormResult.data ?? [], matchRow.home_team_id),
        [matchRow.away_team_id]: toFormEntries(awayFormResult.data ?? [], matchRow.away_team_id),
      })

      const playerIds = [...new Set([
        ...lineupData.map((entry) => entry.player_id),
        ...eventsData.flatMap((event) => [event.player_id, event.related_player_id, event.assist_player_id].filter((value): value is string => Boolean(value))),
      ])]
      if (playerIds.length) {
        const { data: playerRows } = await client.from('public_player_profiles').select('id, full_name, photo_url').in('id', playerIds)
        if (!active) return
        setPlayers(Object.fromEntries((playerRows ?? []).map((player) => [player.id, player as Player])))
      } else {
        setPlayers({})
      }
      setLoading(false)
    }

    void load()
    const channel = client.channel(`public-match-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches', filter: `id=eq.${id}` }, () => { void load() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'match_events', filter: `match_id=eq.${id}` }, () => { void load() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'match_players', filter: `match_id=eq.${id}` }, () => { void load() })
      .subscribe()
    const refreshTimer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load()
    }, 30000)
    return () => {
      active = false
      window.clearInterval(refreshTimer)
      void client.removeChannel(channel)
    }
  }, [id])

  const home = match ? teams[match.home_team_id] : undefined
  const away = match ? teams[match.away_team_id] : undefined
  const live = match ? ['live', 'half_time'].includes(match.status) : false
  const homeLineup = lineup.filter((entry) => entry.team_id === match?.home_team_id)
  const awayLineup = lineup.filter((entry) => entry.team_id === match?.away_team_id)
  const squadsByTeam = Object.fromEntries(squads.map((squad) => [squad.team_id, squad]))
  const scoreEvents = match ? events.filter((event) => isScoringEvent(event) && creditedTeamId(event, match)) : []

  return <PublicFrame>
    <main className="public-detail-page public-match-detail mc-shell">
      <Link className="public-detail-back" to={competition ? `/competitions/${competition.id}` : '/'}><ArrowLeft size={15} /> Back to competition</Link>
      {loading && <div className="public-loading">Loading published match centre…</div>}
      {error && <div className="public-notice" role="alert"><CircleDot size={16} /><span>{error}</span></div>}
      {match && !error && <>
        <header className="mc-scoreboard">
          <div className="mc-scoreboard-topline">
            <Link to={`/competitions/${match.competition_id}`} className="mc-competition-link">
              <Trophy size={14} />{competition?.name ?? 'Competition'}{competition?.season ? ` · ${competition.season}` : ''}
            </Link>
            <StatusBadge status={match.status} label={matchTimeStatus(match.status, events)} />
          </div>
          <div className="mc-scoreline">
            <TeamIdentity team={home} fallback="HOME" />
            <div className="mc-score-center">
              <div className="mc-score-numbers"><strong>{match.home_score}</strong><span>:</span><strong>{match.away_score}</strong></div>
              <span className="mc-score-status">{matchTimeStatus(match.status, events)}</span>
            </div>
            <TeamIdentity team={away} fallback="AWAY" />
          </div>
          <div className="mc-goal-summary">
            <ScorerSummary teamId={match.home_team_id} events={events} match={match} players={players} />
            <span className="mc-summary-caption">SCORERS</span>
            <ScorerSummary teamId={match.away_team_id} events={events} match={match} players={players} align="right" />
          </div>
          <div className="mc-match-meta">
            <span><CalendarDays size={14} />{formatKickoff(match.kickoff_at)}</span>
            {match.round && <span><Clock3 size={14} />{match.round}</span>}
            {match.venue && <span><MapPin size={14} />{match.venue}</span>}
            {match.referee && <span><Shield size={14} />{match.referee}</span>}
          </div>
        </header>

        <nav className="mc-tabs" role="tablist" aria-label="Match centre sections">
          {tabs.map((tab) => <button
            className={`mc-tab ${activeTab === tab.id ? 'mc-tab-active' : ''}`}
            type="button"
            role="tab"
            id={`match-tab-${tab.id}`}
            aria-controls={`match-panel-${tab.id}`}
            aria-selected={activeTab === tab.id}
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
          >{tab.label}</button>)}
        </nav>

        <div className="mc-tab-panel" id={`match-panel-${activeTab}`} role="tabpanel" aria-labelledby={`match-tab-${activeTab}`}>
          {activeTab === 'facts' && <div className="mc-facts-layout">
            <div className="mc-main-column">
              <section className="mc-panel mc-momentum-panel">
                <div className="mc-panel-heading"><div><span className="public-overline">MATCH TRACKER</span><h2>Scoreline swing</h2></div>{live && <span className="mc-live-pill"><i /> LIVE</span>}</div>
                <ScorelineChart events={scoreEvents} match={match} teams={{ home, away }} />
                <p className="mc-chart-note">Based on recorded goals only. Possession and chance momentum are not tracked for this match.</p>
              </section>
              <section className="mc-panel mc-facts-events">
                <div className="mc-panel-heading"><div><span className="public-overline">MATCHDAY</span><h2>Key events</h2></div><button className="mc-inline-button" type="button" onClick={() => setActiveTab('commentary')}>All commentary <ArrowRight size={14} /></button></div>
                {events.length ? <MatchTimeline events={events.slice(-5).reverse()} teams={teams} players={players} /> : <EmptyBlock icon="events" title="No events recorded" message="Published goals, cards, and match updates will appear here." />}
              </section>
            </div>
            <aside className="mc-side-column">
              <section className="mc-panel mc-form-panel">
                <div className="mc-panel-heading"><div><span className="public-overline">RECENT RESULTS</span><h2>Team form</h2></div></div>
                <TeamForm team={home} form={formByTeam[match.home_team_id] ?? []} />
                <TeamForm team={away} form={formByTeam[match.away_team_id] ?? []} />
              </section>
              <section className="mc-panel mc-info-panel">
                <div className="mc-panel-heading"><div><span className="public-overline">MATCH DETAILS</span><h2>At a glance</h2></div><Activity size={17} /></div>
                <dl className="mc-info-list">
                  <div><dt>Competition</dt><dd>{competition?.name ?? '—'}</dd></div>
                  {competition?.season && <div><dt>Season</dt><dd>{competition.season}</dd></div>}
                  <div><dt>Status</dt><dd>{statusLabel(match.status)}</dd></div>
                  {match.round && <div><dt>Round</dt><dd>{match.round}</dd></div>}
                  {match.venue && <div><dt>Venue</dt><dd>{match.venue}</dd></div>}
                </dl>
              </section>
            </aside>
          </div>}

          {activeTab === 'commentary' && <section className="mc-panel mc-commentary-panel">
            <div className="mc-panel-heading"><div><span className="public-overline">PLAY-BY-PLAY</span><h2>{live ? 'Live commentary' : 'Commentary'}</h2></div>{live && <span className="mc-live-pill"><i /> LIVE</span>}</div>
            {events.length ? <MatchTimeline events={[...events].reverse()} teams={teams} players={players} /> : <EmptyBlock icon="events" title="No commentary yet" message="Match events will appear here as they are recorded." />}
          </section>}

          {activeTab === 'lineup' && <div className="mc-lineup-view">
            {!lineup.length ? <section className="mc-panel"><EmptyBlock icon="lineup" title="Lineups not published" message="Official matchday team sheets will appear here after they are published." /></section> : <div className="mc-pitch-grid">
              <TeamSheet team={home} entries={homeLineup} formation={squadsByTeam[match.home_team_id]?.formation} players={players} announcement={squadsByTeam[match.home_team_id]} />
              <TeamSheet team={away} entries={awayLineup} formation={squadsByTeam[match.away_team_id]?.formation} players={players} announcement={squadsByTeam[match.away_team_id]} />
            </div>}
          </div>}

          {activeTab === 'table' && <section className="mc-panel mc-table-panel">
            <div className="mc-panel-heading"><div><span className="public-overline">{competition?.name ?? 'COMPETITION'}</span><h2>League table</h2></div><Link className="mc-inline-button" to={`/competitions/${match.competition_id}`}>Competition page <ArrowRight size={14} /></Link></div>
            {standingsError ? <EmptyBlock icon="table" title="Table unavailable" message="The published competition table could not be loaded." /> : !standings.length ? <EmptyBlock icon="table" title="No table available" message="This competition may use a knockout format or does not have published standings yet." /> : <div className="mc-table-wrap"><table className="mc-table">
              <thead><tr><th>#</th><th>Team</th><th>P</th><th>W</th><th>D</th><th>L</th><th>GD</th><th>Pts</th></tr></thead>
              <tbody>{standings.map((row) => <tr className={row.team_id === match.home_team_id || row.team_id === match.away_team_id ? 'mc-table-current' : ''} key={row.team_id}>
                <td>{row.position}</td><td><Link to={`/teams/${row.team_id}`}>{row.team_name}</Link></td><td>{row.played}</td><td>{row.wins}</td><td>{row.draws}</td><td>{row.losses}</td><td>{row.goal_difference > 0 ? `+${row.goal_difference}` : row.goal_difference}</td><td><strong>{row.points}</strong></td>
              </tr>)}</tbody>
            </table></div>}
          </section>}

          {activeTab === 'stats' && <StatsPanel events={events} match={match} teams={{ home, away }} />}
        </div>
      </>}
    </main>
  </PublicFrame>
}

function StatusBadge({ status, label }: { status: string; label: string }) {
  const live = status === 'live' || status === 'half_time'
  return <span className={`mc-status-badge ${live ? 'mc-status-live' : ''}`}>{live && <i />}{label}</span>
}

function TeamIdentity({ team, fallback }: { team?: Side; fallback: string }) {
  const badge = <span className="mc-team-badge">{team?.logo_url ? <img src={publicImageUrl(team.logo_url)} alt="" /> : <Shield size={27} />}</span>
  return <div className="mc-team-identity">
    {team ? <Link to={`/teams/${team.id}`} aria-label={`${team.name} team page`}>{badge}</Link> : badge}
    <strong>{team?.name ?? fallback}</strong>
    <span>{team?.short_name ?? '—'}</span>
  </div>
}

function ScorerSummary({ teamId, events, match, players, align = 'left' }: { teamId: string; events: Event[]; match: Match; players: Record<string, Player>; align?: 'left' | 'right' }) {
  const scorers = events.filter((event) => isScoringEvent(event) && creditedTeamId(event, match) === teamId)
  return <div className={`mc-scorer-list mc-scorer-${align}`}>
    {scorers.length ? scorers.map((event) => <span key={event.id}>{players[event.player_id ?? '']?.full_name ?? eventLabel(event.event_type)} <b>{minuteLabel(event)}</b>{event.event_type === 'own_goal' && <small> OG</small>}</span>) : <span className="mc-no-scorers">No goals</span>}
  </div>
}

function ScorelineChart({ events, match, teams }: { events: Event[]; match: Match; teams: { home?: Side; away?: Side } }) {
  const sorted = [...events].sort((a, b) => eventMinute(a) - eventMinute(b))
  let difference = 0
  const scorePoints = [{ minute: 0, difference: 0 }]
  sorted.forEach((event) => {
    const credited = creditedTeamId(event, match)
    if (credited === match.home_team_id) difference += 1
    if (credited === match.away_team_id) difference -= 1
    scorePoints.push({ minute: eventMinute(event), difference })
  })
  const maxDifference = Math.max(1, ...scorePoints.map((point) => Math.abs(point.difference)))
  const plotPoints = scorePoints.map((point) => {
    const x = Math.min(100, point.minute / 90 * 100)
    const y = 50 - point.difference / maxDifference * 38
    return `${x},${y}`
  })

  return <div className="mc-chart-wrap">
    <div className="mc-chart-legend"><span><i className="mc-home-key" />{teams.home?.short_name ?? 'Home'}</span><span><i className="mc-away-key" />{teams.away?.short_name ?? 'Away'}</span></div>
    <svg className="mc-score-chart" viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="Score difference over match time, derived from recorded goal events">
      <line x1="0" y1="50" x2="100" y2="50" className="mc-chart-zero" />
      <line x1="0" y1="12" x2="100" y2="12" className="mc-chart-guide" />
      <line x1="0" y1="88" x2="100" y2="88" className="mc-chart-guide" />
      {scorePoints.slice(1).map((point, index) => {
        const previous = scorePoints[index]
        return <line
          key={`${point.minute}-${index}`}
          x1={Math.min(100, previous.minute / 90 * 100)}
          y1={50 - previous.difference / maxDifference * 38}
          x2={Math.min(100, point.minute / 90 * 100)}
          y2={50 - point.difference / maxDifference * 38}
          className={`mc-chart-segment ${point.difference >= 0 ? 'mc-chart-home-lead' : 'mc-chart-away-lead'}`}
        />
      })}
      {plotPoints.length === 1 && <line x1="0" y1="50" x2="100" y2="50" className="mc-chart-idle" />}
      {scorePoints.slice(1).map((point, index) => <circle key={`${point.minute}-${index}`} cx={Math.min(100, point.minute / 90 * 100)} cy={50 - point.difference / maxDifference * 38} r="1.7" className="mc-chart-point" />)}
    </svg>
    <div className="mc-chart-axis"><span>0′</span><span>45′</span><span>90′</span></div>
    {!events.length && <span className="mc-chart-empty-label">Waiting for recorded goal events</span>}
  </div>
}

function MatchTimeline({ events, teams, players }: { events: Event[]; teams: Record<string, Side>; players: Record<string, Player> }) {
  return <ol className="mc-timeline">{events.map((event) => {
    const player = event.player_id ? players[event.player_id] : undefined
    const related = event.related_player_id ? players[event.related_player_id] : undefined
    const assist = event.assist_player_id ? players[event.assist_player_id] : undefined
    const detail = typeof event.details?.note === 'string' ? event.details.note : ''
    return <li className={`mc-timeline-event mc-event-${event.event_type}`} key={event.id}>
      <time>{minuteLabel(event)}</time>
      <span className="mc-event-icon">{eventIcon(event.event_type)}</span>
      <span className="mc-event-content"><strong>{eventLabel(event.event_type)}</strong>
        {player && <Link to={`/players/${player.id}`}>{player.full_name}</Link>}
        {related && <span>{player ? 'off' : 'on'} {related.full_name}</span>}
        {assist && <span className="mc-event-assist">Assist: {assist.full_name}</span>}
        {event.team_id && teams[event.team_id] && <small>{teams[event.team_id].name}</small>}
        {detail && <small>{detail}</small>}
      </span>
    </li>
  })}</ol>
}

function TeamForm({ team, form }: { team?: Side; form: FormEntry[] }) {
  return <div className="mc-form-team">
    <div className="mc-form-team-name"><span>{team?.short_name ?? '—'}</span><strong>{team?.name ?? 'Team'}</strong></div>
    {form.length ? <div className="mc-form-dots" aria-label={`Recent form for ${team?.name ?? 'team'}`}>{form.map((entry, index) => <span className={`mc-form-dot mc-form-${entry.result.toLowerCase()}`} title={`${entry.result} vs ${entry.opponent}`} key={`${entry.opponent}-${index}`}>{entry.result}</span>)}</div> : <span className="mc-form-empty">No recent results</span>}
  </div>
}

function TeamSheet({ team, entries, formation, players, announcement }: { team?: Side; entries: LineupEntry[]; formation?: string; players: Record<string, Player>; announcement?: { id: string; title: string; team_id: string; formation: string } }) {
  const starters = entries.filter((entry) => entry.is_starter)
  const substitutes = entries.filter((entry) => !entry.is_starter)
  const grouped = {
    forwards: starters.filter((entry) => positionGroup(entry.position) === 'forwards'),
    midfielders: starters.filter((entry) => positionGroup(entry.position) === 'midfielders'),
    defenders: starters.filter((entry) => positionGroup(entry.position) === 'defenders'),
    goalkeeper: starters.filter((entry) => positionGroup(entry.position) === 'goalkeeper'),
    other: starters.filter((entry) => positionGroup(entry.position) === 'other'),
  }
  return <section className="mc-panel mc-team-sheet">
    <div className="mc-panel-heading"><div><span className="public-overline">STARTING XI</span><h2>{team?.name ?? 'Team'}</h2></div>{announcement && <span className="mc-formation">{formation}</span>}</div>
    {announcement && <Link className="mc-lineup-announcement" to={`/squads/${announcement.id}`}>{announcement.title}<ArrowRight size={13} /></Link>}
    <div className="mc-pitch">
      <div className="mc-pitch-half-line" />
      <PitchLine entries={grouped.forwards} players={players} label="Forwards" />
      <PitchLine entries={grouped.midfielders} players={players} label="Midfielders" />
      <PitchLine entries={grouped.defenders} players={players} label="Defenders" />
      <PitchLine entries={grouped.goalkeeper} players={players} label="Goalkeeper" />
      <PitchLine entries={grouped.other} players={players} label="Other positions" />
    </div>
    <div className="mc-substitutes"><h3>Substitutes <span>{substitutes.length}</span></h3>
      {substitutes.length ? <div className="mc-sub-list">{substitutes.map((entry) => <PlayerLine key={entry.player_id} entry={entry} player={players[entry.player_id]} />)}</div> : <p>No substitutes listed.</p>}
    </div>
  </section>
}

function PitchLine({ entries, players, label }: { entries: LineupEntry[]; players: Record<string, Player>; label: string }) {
  if (!entries.length) return null
  return <div className="mc-pitch-line" aria-label={label}>{entries.map((entry) => <Link className="mc-pitch-player" to={`/players/${entry.player_id}`} key={entry.player_id} title={players[entry.player_id]?.full_name ?? 'Player'}>
    <b>{entry.shirt_number ?? '—'}</b><span>{players[entry.player_id]?.full_name ?? 'Player'}</span>{entry.is_captain && <i>C</i>}{entry.is_vice_captain && <i>VC</i>}
  </Link>)}</div>
}

function PlayerLine({ entry, player }: { entry: LineupEntry; player?: Player }) {
  return <Link className="mc-sub-player" to={`/players/${entry.player_id}`}><b>{entry.shirt_number ?? '—'}</b><span><strong>{player?.full_name ?? 'Player'}</strong><small>{entry.position ?? 'Substitute'}{entry.is_captain ? ' · Captain' : entry.is_vice_captain ? ' · Vice-captain' : ''}</small></span></Link>
}

function StatsPanel({ events, match, teams }: { events: Event[]; match: Match; teams: { home?: Side; away?: Side } }) {
  const stats = [
    { label: 'Goals', home: countScoringEvents(events, match.home_team_id, match), away: countScoringEvents(events, match.away_team_id, match) },
    { label: 'Yellow cards', home: countTeamEvents(events, match.home_team_id, 'yellow_card'), away: countTeamEvents(events, match.away_team_id, 'yellow_card') },
    { label: 'Red cards', home: countTeamEvents(events, match.home_team_id, 'red_card'), away: countTeamEvents(events, match.away_team_id, 'red_card') },
    { label: 'Substitutions', home: countTeamEvents(events, match.home_team_id, 'substitution'), away: countTeamEvents(events, match.away_team_id, 'substitution') },
  ]
  return <div className="mc-stats-layout">
    <section className="mc-panel mc-event-stats">
      <div className="mc-panel-heading"><div><span className="public-overline">FROM MATCH EVENTS</span><h2>Recorded stats</h2></div><Activity size={17} /></div>
      <div className="mc-stats-teams"><span>{teams.home?.short_name ?? 'Home'}</span><span>STAT</span><span>{teams.away?.short_name ?? 'Away'}</span></div>
      {stats.map((stat) => <StatBar key={stat.label} {...stat} />)}
    </section>
    <section className="mc-panel mc-untracked-stats">
      <div className="mc-panel-heading"><div><span className="public-overline">NOT RECORDED</span><h2>Match metrics</h2></div></div>
      <p>These metrics aren’t stored for this match, so no values are estimated.</p>
      <div className="mc-untracked-grid">{['Possession', 'Expected goals (xG)', 'Total shots', 'Touches in opposition box'].map((label) => <div key={label}><strong>—</strong><span>{label}</span><small>Not tracked</small></div>)}</div>
    </section>
  </div>
}

function StatBar({ label, home, away }: { label: string; home: number; away: number }) {
  const total = home + away
  const homeWidth = total ? `${home / total * 100}%` : '0%'
  const awayWidth = total ? `${away / total * 100}%` : '0%'
  return <div className="mc-stat-row">
    <div className="mc-stat-values"><strong>{home}</strong><span>{label}</span><strong>{away}</strong></div>
    <div className="mc-stat-bars"><i className="mc-stat-home" style={{ width: homeWidth }} /><i className="mc-stat-away" style={{ width: awayWidth }} /></div>
  </div>
}

function EmptyBlock({ icon, title, message }: { icon: 'events' | 'lineup' | 'table'; title: string; message: string }) {
  const Icon = icon === 'lineup' ? Users : icon === 'table' ? Trophy : Radio
  return <div className="mc-empty"><Icon size={20} /><strong>{title}</strong><span>{message}</span></div>
}

async function loadRecentForm(client: NonNullable<typeof supabase>, teamId: string) {
  const result = await client.from('matches')
    .select('id, home_team_id, away_team_id, home_score, away_score')
    .eq('status', 'full_time')
    .not('published_at', 'is', null)
    .or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`)
    .order('kickoff_at', { ascending: false })
    .limit(5)
  const opponentIds = [...new Set((result.data ?? []).map((row) => row.home_team_id === teamId ? row.away_team_id : row.home_team_id))]
  const { data: opponentRows } = opponentIds.length
    ? await client.from('teams').select('id, name').in('id', opponentIds)
    : { data: [] }
  const opponentNames = Object.fromEntries((opponentRows ?? []).map((team) => [team.id, team.name]))
  return {
    error: result.error,
    data: (result.data ?? []).map((row) => ({
      ...row,
      opponent_name: opponentNames[row.home_team_id === teamId ? row.away_team_id : row.home_team_id] ?? 'Opponent',
    })),
  }
}

function toFormEntries(rows: Array<{ home_team_id: string; away_team_id: string; home_score: number; away_score: number; opponent_name: string }>, teamId: string): FormEntry[] {
  return rows.map((row) => {
    const isHome = row.home_team_id === teamId
    const scored = isHome ? row.home_score : row.away_score
    const conceded = isHome ? row.away_score : row.home_score
    return { result: scored > conceded ? 'W' : scored < conceded ? 'L' : 'D', opponent: row.opponent_name }
  })
}

function positionGroup(position: string | null) {
  const value = (position ?? '').toLowerCase()
  if (value.includes('keeper') || value === 'gk') return 'goalkeeper'
  if (value.includes('forward') || value.includes('striker') || value.includes('centre-forward')) return 'forwards'
  if (value.includes('midfield') || value.includes('winger') || value.includes('wide')) return 'midfielders'
  if (value.includes('defend') || value.includes('back')) return 'defenders'
  return 'other'
}

function isScoringEvent(event: Event) {
  return ['goal', 'penalty', 'own_goal'].includes(event.event_type)
}

function creditedTeamId(event: Event, match: Match) {
  if (event.event_type !== 'own_goal') return event.team_id
  if (event.team_id === match.home_team_id) return match.away_team_id
  if (event.team_id === match.away_team_id) return match.home_team_id
  return null
}

function countScoringEvents(events: Event[], teamId: string, match: Match) {
  return events.filter((event) => isScoringEvent(event) && creditedTeamId(event, match) === teamId).length
}

function countTeamEvents(events: Event[], teamId: string, eventType: string) {
  return events.filter((event) => event.team_id === teamId && event.event_type === eventType).length
}

function eventMinute(event: Event) {
  return (event.minute ?? 0) + (event.stoppage_minute ?? 0)
}

function minuteLabel(event: Event) {
  if (event.event_type === 'half_time') return 'HT'
  if (event.event_type === 'full_time') return 'FT'
  if (event.minute === null) return '—'
  return `${event.minute}${event.stoppage_minute ? `+${event.stoppage_minute}` : ''}′`
}

function statusLabel(status: string) {
  const labels: Record<string, string> = { scheduled: 'Scheduled', warm_up: 'Warm-up', live: 'Live', half_time: 'Half-time', full_time: 'Full-time', postponed: 'Postponed', cancelled: 'Cancelled' }
  return labels[status] ?? formatLabel(status)
}

function matchTimeStatus(status: string, events: Event[]) {
  if (status === 'live') {
    const latest = events
      .filter((event) => event.minute !== null && !['half_time', 'full_time'].includes(event.event_type))
      .sort((first, second) => eventMinute(first) - eventMinute(second))
      .at(-1)
    if (!latest || latest.minute === null) return 'Live'
    return `Live · ${latest.minute}${latest.stoppage_minute ? `+${latest.stoppage_minute}` : ''}′`
  }
  return statusLabel(status)
}

function formatKickoff(value: string) {
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function formatLabel(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function eventLabel(value: string) {
  const labels: Record<string, string> = { goal: 'Goal', penalty: 'Penalty goal', own_goal: 'Own goal', missed_penalty: 'Missed penalty', yellow_card: 'Yellow card', red_card: 'Red card', substitution: 'Substitution', half_time: 'Half-time', full_time: 'Full-time', var_review: 'VAR review' }
  return labels[value] ?? formatLabel(value)
}

function eventIcon(value: string) {
  if (['goal', 'penalty', 'own_goal'].includes(value)) return <Goal size={16} />
  if (value.includes('card')) return <span className={`mc-card-icon mc-${value}`} />
  if (value === 'substitution') return <Users size={16} />
  return <CircleDot size={16} />
}