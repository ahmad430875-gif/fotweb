import { useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, CalendarDays, CircleDot, MapPin, Radio, Shield, Users } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { PublicFrame } from './PublicPages'
import { supabase } from '../lib/supabase'

type Match = { id: string; competition_id: string; home_team_id: string; away_team_id: string; kickoff_at: string; status: string; home_score: number; away_score: number; round: string | null; venue: string | null }
type Side = { id: string; name: string; short_name: string; logo_url: string | null; university_id: string }
type Player = { id: string; full_name: string; photo_url: string | null }
type Event = { id: number; event_type: string; minute: number | null; stoppage_minute: number | null; team_id: string | null; player_id: string | null; related_player_id: string | null; assist_player_id: string | null; details: Record<string, unknown>; recorded_at: string }

export function MatchDetailPage() {
  const { id } = useParams()
  const [match, setMatch] = useState<Match | null>(null)
  const [competition, setCompetition] = useState<{ id: string; name: string; season: string } | null>(null)
  const [teams, setTeams] = useState<Record<string, Side>>({})
  const [players, setPlayers] = useState<Record<string, Player>>({})
  const [lineup, setLineup] = useState<Array<{ player_id: string; team_id: string; shirt_number: number | null; is_starter: boolean; is_captain: boolean; is_vice_captain: boolean; position: string | null }>>([])
  const [events, setEvents] = useState<Event[]>([])
  const [squads, setSquads] = useState<Array<{ id: string; title: string; team_id: string }>>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    async function load() {
      if (!supabase || !id) { setError('Match information is unavailable.'); setLoading(false); return }
      const client = supabase
      const { data: matchRow, error: matchError } = await client.from('matches').select('id, competition_id, home_team_id, away_team_id, kickoff_at, status, home_score, away_score, round, venue').eq('id', id).not('published_at', 'is', null).maybeSingle()
      if (!active) return
      if (matchError || !matchRow) { setError('This match is not available publicly.'); setLoading(false); return }
      setMatch(matchRow as Match)

      const [competitionResult, teamResult, eventResult, lineupResult, squadResult] = await Promise.all([
        client.from('competitions').select('id, name, season').eq('id', matchRow.competition_id).maybeSingle(),
        client.from('teams').select('id, name, short_name, logo_url, university_id').in('id', [matchRow.home_team_id, matchRow.away_team_id]),
        client.from('match_events').select('id, event_type, minute, stoppage_minute, team_id, player_id, related_player_id, assist_player_id, details, recorded_at').eq('match_id', id).order('minute').order('stoppage_minute').order('recorded_at'),
        client.from('match_players').select('player_id, team_id, shirt_number, is_starter, is_captain, is_vice_captain, position').eq('match_id', id).order('is_starter', { ascending: false }).order('shirt_number'),
        client.from('squad_announcements').select('id, title, team_id').eq('match_id', id).eq('is_published', true),
      ])
      if (!active) return
      setCompetition(competitionResult.data)
      const teamMap = Object.fromEntries((teamResult.data ?? []).map((team) => [team.id, team as Side]))
      setTeams(teamMap)
      const eventsData = (eventResult.data ?? []) as Event[]
      setEvents(eventsData)
      const lineupData = (lineupResult.data ?? []) as typeof lineup
      setLineup(lineupData)
      setSquads(squadResult.data ?? [])
      const playerIds = [...new Set([...lineupData.map((row) => row.player_id), ...eventsData.flatMap((event) => [event.player_id, event.related_player_id, event.assist_player_id].filter((value): value is string => Boolean(value)))])]
      if (playerIds.length) {
        const { data: playerRows } = await client.from('public_player_profiles').select('id, full_name, photo_url').in('id', playerIds)
        if (!active) return
        setPlayers(Object.fromEntries((playerRows ?? []).map((player) => [player.id, player as Player])))
      }
      setLoading(false)
    }
    void load()
    return () => { active = false }
  }, [id])

  const home = match ? teams[match.home_team_id] : undefined
  const away = match ? teams[match.away_team_id] : undefined
  const live = match ? ['live', 'half_time'].includes(match.status) : false
  const homeLineup = lineup.filter((entry) => entry.team_id === match?.home_team_id)
  const awayLineup = lineup.filter((entry) => entry.team_id === match?.away_team_id)
  const squadsByTeam = Object.fromEntries(squads.map((squad) => [squad.team_id, squad]))

  return <PublicFrame>
    <main className="public-detail-page public-match-detail">
      <Link className="public-detail-back" to={competition ? `/competitions/${competition.id}` : '/'}><ArrowLeft size={15} /> Back to competition</Link>
      {loading && <div className="public-loading">Loading published match centre…</div>}
      {error && <div className="public-notice" role="alert"><CircleDot size={16} /><span>{error}</span></div>}
      {match && !error && <>
        <section className="public-match-scoreboard">
          <div className="public-match-detail-context">
            <Link to={`/competitions/${match.competition_id}`}>{competition?.name ?? 'Competition'}{competition?.season ? ` · ${competition.season}` : ''}</Link>
            <span className={live ? 'public-live-label' : 'public-match-date'}>{live && <i />}{formatLabel(match.status)}</span>
          </div>
          <div className="public-match-scoreline">
            <Link className="public-score-team" to={home ? `/teams/${home.id}` : '#'}>
              <span>{home?.logo_url ? <img src={home.logo_url} alt="" /> : <Shield size={30} />}</span><strong>{home?.name ?? 'Home team'}</strong>
            </Link>
            <div className="public-score-value"><strong>{match.home_score}</strong><span>:</span><strong>{match.away_score}</strong><small>{live ? 'LIVE SCORE' : formatLabel(match.status)}</small></div>
            <Link className="public-score-team" to={away ? `/teams/${away.id}` : '#'}>
              <span>{away?.logo_url ? <img src={away.logo_url} alt="" /> : <Shield size={30} />}</span><strong>{away?.name ?? 'Away team'}</strong>
            </Link>
          </div>
          <div className="public-match-detail-meta"><span><CalendarDays size={14} />{new Intl.DateTimeFormat('en', { dateStyle: 'full', timeStyle: 'short' }).format(new Date(match.kickoff_at))}</span>{match.venue && <span><MapPin size={14} />{match.venue}</span>}{match.round && <span>{match.round}</span>}</div>
        </section>

        <section className="public-detail-section">
          <div className="public-section-heading"><div><span className="public-overline">MATCHDAY</span><h2>{live ? 'Live timeline' : 'Match timeline'}</h2></div>{live && <span className="public-live-label"><i /> Live</span>}</div>
          {!events.length ? <div className="public-empty"><Radio size={18} /><strong>No match events yet</strong><span>Goals, cards and match updates will appear here.</span></div> : <ol className="public-match-timeline">{events.map((event) => {
            const player = event.player_id ? players[event.player_id] : undefined
            const related = event.related_player_id ? players[event.related_player_id] : undefined
            const assist = event.assist_player_id ? players[event.assist_player_id] : undefined
            const detail = typeof event.details?.note === 'string' ? event.details.note : ''
            return <li key={event.id}>
              <time>{event.minute ?? '—'}{event.stoppage_minute ? `+${event.stoppage_minute}` : "'"}</time>
              <span className={`public-event-marker public-event-${event.event_type}`}><CircleDot size={14} /></span>
              <span className="public-event-copy"><strong>{eventLabel(event.event_type)}</strong>{player && <Link to={`/players/${player.id}`}>{player.full_name}</Link>}{related && <span>{player ? 'off' : 'on'} {related.full_name}</span>}{assist && <span>Assist: {assist.full_name}</span>}{event.team_id && teams[event.team_id] && <small>{teams[event.team_id].name}</small>}{detail && <small>{detail}</small>}</span>
            </li>
          })}</ol>}
        </section>

        <section className="public-detail-section">
          <div className="public-section-heading"><div><span className="public-overline">TEAM SHEETS</span><h2>Lineups</h2></div><Users size={17} /></div>
          {!lineup.length ? <div className="public-empty"><Users size={18} /><strong>Lineups not published</strong><span>Official matchday squads will appear here once announced.</span></div> : <div className="public-match-lineups">{[[home, homeLineup], [away, awayLineup]].map(([team, rows]) => {
            const side = team as Side | undefined
            const entries = rows as typeof lineup
            const announcement = side ? squadsByTeam[side.id] : undefined
            return <div className="public-lineup-side" key={side?.id ?? 'unknown'}>
              <h3>{side?.name ?? 'Team'}{announcement && <Link to={`/squads/${announcement.id}`}>Official squad <ArrowRight size={13} /></Link>}</h3>
              <div className="public-lineup-list">{entries.map((entry) => <Link to={`/players/${entry.player_id}`} className="public-lineup-player" key={entry.player_id}><b>{entry.shirt_number ?? '—'}</b><span><strong>{players[entry.player_id]?.full_name ?? 'Player'}</strong><small>{entry.position ?? (entry.is_starter ? 'Starter' : 'Substitute')}{entry.is_captain ? ' · Captain' : entry.is_vice_captain ? ' · Vice-captain' : ''}</small></span></Link>)}</div>
            </div>
          })}</div>}
        </section>
      </>}
    </main>
  </PublicFrame>
}

function formatLabel(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function eventLabel(value: string) {
  const labels: Record<string, string> = { goal: 'Goal', penalty: 'Penalty goal', own_goal: 'Own goal', missed_penalty: 'Missed penalty', yellow_card: 'Yellow card', red_card: 'Red card', substitution: 'Substitution', half_time: 'Half-time', full_time: 'Full-time', var_review: 'VAR review' }
  return labels[value] ?? formatLabel(value)
}