import { useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, CalendarDays, CircleDot, MapPin, Shield, Users } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { PublicFrame } from './PublicPages'
import { supabase } from '../lib/supabase'
import { publicImageUrl } from '../lib/imageUrl'

type PublicTeam = { id: string; name: string; short_name: string; logo_url: string | null; team_photo_url?: string | null; university_id: string; type?: string; academic_class?: string | null }
type PublicPlayer = { id: string; university_id?: string; full_name: string; photo_url: string | null; position: string | null; academic_program?: string | null; current_academic_year?: string | null; injury_status?: string | null; bio?: string | null }

function PublicState({ loading, error, empty }: { loading: boolean; error: string; empty?: boolean }) {
  if (loading) return <div className="public-loading">Loading published football data…</div>
  if (error) return <div className="public-notice" role="alert"><CircleDot size={16} /><span>{error}</span></div>
  if (empty) return <div className="public-empty"><CircleDot size={18} /><strong>No published information yet</strong><span>Published university football information will appear here.</span></div>
  return null
}

function PublicBackLink({ to = '/universities' }: { to?: string }) {
  return <Link className="public-detail-back" to={to}><ArrowLeft size={15} /> Back</Link>
}

export function PublicUniversityDetailPage() {
  const { id } = useParams()
  const [university, setUniversity] = useState<any>(null)
  const [competitions, setCompetitions] = useState<any[]>([])
  const [teams, setTeams] = useState<PublicTeam[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    async function load() {
      if (!supabase || !id) { setError('University details are unavailable.'); setLoading(false); return }
      const client = supabase
      const [universityResult, competitionResult, teamResult] = await Promise.all([
        client.from('universities').select('id, name, short_name, logo_url, location').eq('id', id).maybeSingle(),
        client.from('competitions').select('id, name, season, type, format, start_date, end_date, ended_at').eq('university_id', id).eq('status', 'published').order('start_date', { ascending: false }),
        client.from('teams').select('id, name, short_name, logo_url, team_photo_url, university_id, type, academic_class').eq('university_id', id).eq('is_active', true).order('name'),
      ])
      if (!active) return
      if (universityResult.error || !universityResult.data) setError('This university is not available publicly.')
      setUniversity(universityResult.data)
      setCompetitions(competitionResult.data ?? [])
      setTeams((teamResult.data ?? []) as PublicTeam[])
      setLoading(false)
    }
    void load()
    return () => { active = false }
  }, [id])

  return <PublicFrame>
    <main className="public-detail-page">
      <PublicBackLink />
      {university && <header className="public-detail-hero">
        <span className="public-detail-mark">{university.logo_url ? <img src={publicImageUrl(university.logo_url)} alt="" /> : <Shield size={28} />}</span>
        <div><span className="public-overline">UNIVERSITY PROFILE · {university.short_name}</span><h1>{university.name}</h1><p><MapPin size={15} />{university.location}</p></div>
      </header>}
      <PublicState loading={loading} error={error} />
      {!loading && !error && <>
        <section className="public-detail-section">
          <div className="public-section-heading"><div><span className="public-overline">REPRESENTING THE CAMPUS</span><h2>Teams</h2></div><span>{teams.length} published teams</span></div>
          {!teams.length ? <PublicState loading={false} error="" empty /> : <div className="public-detail-link-list">{teams.map((team) => <Link className="public-detail-link-row" to={`/teams/${team.id}`} key={team.id}>
            <span className="public-detail-team-mark">{team.logo_url ? <img src={publicImageUrl(team.logo_url)} alt="" /> : team.short_name.slice(0, 3)}</span><span><strong>{team.name}</strong><small>{team.type === 'class_team' ? team.academic_class || 'Class team' : 'University team'}</small></span><ArrowRight size={16} />
          </Link>)}</div>}
        </section>
        <section className="public-detail-section">
          <div className="public-section-heading"><div><span className="public-overline">TOURNAMENT HISTORY</span><h2>Competitions &amp; records</h2></div><span>{competitions.length} published tournaments</span></div>
          {!competitions.length ? <PublicState loading={false} error="" empty /> : <div className="public-competition-grid">{competitions.map((competition) => <Link className="public-competition-card" to={`/competitions/${competition.id}`} key={competition.id}>
            <div className="public-competition-top"><span className="public-type-tag">{formatLabel(competition.type)}</span><span className="public-season">{competition.ended_at ? `COMPLETED · ${competition.season}` : competition.season}</span></div><h3>{competition.name}</h3><p>{formatLabel(competition.format)} · {formatDate(competition.start_date)} to {formatDate(competition.end_date)}</p><span className="public-detail-inline">Tournament records <ArrowRight size={14} /></span>
          </Link>)}</div>}
        </section>
      </>}
    </main>
  </PublicFrame>
}

export function PublicTeamDetailPage() {
  const { id } = useParams()
  const [team, setTeam] = useState<PublicTeam | null>(null)
  const [players, setPlayers] = useState<Array<PublicPlayer & { shirt_number: number | null }>>([])
  const [squads, setSquads] = useState<any[]>([])
  const [competitions, setCompetitions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    async function load() {
      if (!supabase || !id) { setError('Team details are unavailable.'); setLoading(false); return }
      const client = supabase
      const [teamResult, registrationResult, squadResult, competitionResult] = await Promise.all([
        client.from('teams').select('id, name, short_name, logo_url, team_photo_url, university_id, type, academic_class').eq('id', id).maybeSingle(),
        client.from('player_registrations').select('player_id, competition_id, shirt_number').eq('team_id', id).is('released_at', null),
        client.from('squad_announcements').select('id, title, description, formation, published_at, competition_id, match_id').eq('team_id', id).eq('is_published', true).order('published_at', { ascending: false }),
        client.from('competition_teams').select('competition_id').eq('team_id', id),
      ])
      if (!active) return
      if (teamResult.error || !teamResult.data) { setError('This team is not available publicly.'); setLoading(false); return }
      setTeam(teamResult.data as PublicTeam)
      const registrations = registrationResult.data ?? []
      const playerIds = [...new Set(registrations.map((row) => row.player_id))]
      const competitionIds = [...new Set((competitionResult.data ?? []).map((row) => row.competition_id))]
      const [playerResult, competitionsResult] = await Promise.all([
        playerIds.length ? client.from('public_player_profiles').select('id, full_name, photo_url, position, academic_program, current_academic_year, injury_status').in('id', playerIds) : Promise.resolve({ data: [], error: null }),
        competitionIds.length ? client.from('competitions').select('id, name, season').in('id', competitionIds).eq('status', 'published') : Promise.resolve({ data: [], error: null }),
      ])
      if (!active) return
      const playerMap = new Map((playerResult.data ?? []).map((player) => [player.id, player as PublicPlayer]))
      const shirtByPlayer = new Map(registrations.map((row) => [row.player_id, row.shirt_number]))
      setPlayers([...playerMap.values()].map((player) => ({ ...player, shirt_number: shirtByPlayer.get(player.id) ?? null })).sort((a, b) => (a.shirt_number ?? 100) - (b.shirt_number ?? 100)))
      setCompetitions(competitionsResult.data ?? [])
      setSquads(squadResult.data ?? [])
      setLoading(false)
    }
    void load()
    return () => { active = false }
  }, [id])

  const competitionNames = Object.fromEntries(competitions.map((competition) => [competition.id, competition.name]))
  return <PublicFrame>
    <main className="public-detail-page">
      <PublicBackLink to={team ? `/universities/${team.university_id}` : '/universities'} />
      {team && <header className={`public-detail-hero ${team.team_photo_url ? 'public-detail-team-hero' : ''}`}>
        {team.team_photo_url && <img className="public-detail-team-photo" src={publicImageUrl(team.team_photo_url)} alt="" />}
        <span className="public-detail-mark">{team.logo_url ? <img src={publicImageUrl(team.logo_url)} alt="" /> : <Users size={28} />}</span>
        <div><span className="public-overline">{team.type === 'class_team' ? team.academic_class || 'CLASS TEAM' : 'UNIVERSITY TEAM'}</span><h1>{team.name}</h1><Link className="public-detail-inline" to={`/universities/${team.university_id}`}>University profile <ArrowRight size={14} /></Link></div>
      </header>}
      <PublicState loading={loading} error={error} />
      {!loading && !error && <>
        <section className="public-detail-section">
          <div className="public-section-heading"><div><span className="public-overline">REGISTERED PLAYERS</span><h2>Squad</h2></div><span>{players.length} players</span></div>
          {!players.length ? <PublicState loading={false} error="" empty /> : <div className="public-player-grid">{players.map((player) => <Link className="public-player-row" to={`/players/${player.id}`} key={player.id}>
            <span className="public-player-photo">{player.photo_url ? <img src={publicImageUrl(player.photo_url)} alt="" /> : <Users size={18} />}</span><span><strong>{player.full_name}</strong><small>{player.position || 'Player'}{player.academic_program ? ` · ${player.academic_program}` : ''}</small></span><b>{player.shirt_number ?? '—'}</b>
          </Link>)}</div>}
        </section>
        <section className="public-detail-section">
          <div className="public-section-heading"><div><span className="public-overline">OFFICIAL LINEUPS</span><h2>Squad announcements</h2></div><span>{squads.length} published</span></div>
          {!squads.length ? <PublicState loading={false} error="" empty /> : <div className="public-detail-link-list">{squads.map((squad) => <Link className="public-detail-link-row" to={`/squads/${squad.id}`} key={squad.id}>
            <span className="public-detail-team-mark"><Users size={17} /></span><span><strong>{squad.title}</strong><small>{competitionNames[squad.competition_id] || 'Competition'} · {squad.formation}</small></span><ArrowRight size={16} />
          </Link>)}</div>}
        </section>
      </>}
    </main>
  </PublicFrame>
}

export function PublicPlayerDetailPage() {
  const { id } = useParams()
  const [player, setPlayer] = useState<PublicPlayer | null>(null)
  const [stats, setStats] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    async function load() {
      if (!supabase || !id) { setError('Player details are unavailable.'); setLoading(false); return }
      const client = supabase
      const [playerResult, statsResult] = await Promise.all([
        client.from('public_player_profiles').select('id, university_id, full_name, photo_url, academic_program, current_academic_year, position, preferred_foot, bio, injury_status').eq('id', id).maybeSingle(),
        client.from('player_career_stats').select('appearances, starts, minutes_played, goals, assists, yellow_cards, red_cards').eq('player_id', id).maybeSingle(),
      ])
      if (!active) return
      if (playerResult.error || !playerResult.data) setError('This player profile is not available publicly.')
      setPlayer((playerResult.data ?? null) as PublicPlayer | null)
      setStats(statsResult.data)
      setLoading(false)
    }
    void load()
    return () => { active = false }
  }, [id])

  return <PublicFrame>
    <main className="public-detail-page">
      <PublicBackLink />
      {player && <header className="public-detail-hero">
        <span className="public-detail-mark public-player-detail-photo">{player.photo_url ? <img src={publicImageUrl(player.photo_url)} alt="" /> : <Users size={28} />}</span>
        <div><span className="public-overline">PLAYER PROFILE</span><h1>{player.full_name}</h1><p>{[player.position, player.academic_program, player.current_academic_year].filter(Boolean).join(' · ')}</p><Link className="public-detail-inline" to={`/universities/${player.university_id}`}>University profile <ArrowRight size={14} /></Link></div>
      </header>}
      <PublicState loading={loading} error={error} />
      {!loading && !error && player && <>
        {player.bio && <p className="public-player-bio">{player.bio}</p>}
        {player.injury_status && <p className="public-player-availability">Availability update: {formatLabel(player.injury_status)}</p>}
        <section className="public-detail-section">
          <div className="public-section-heading"><div><span className="public-overline">CAREER TOTALS</span><h2>Statistics</h2></div></div>
          <div className="public-player-stat-grid">{[
            ['Appearances', stats?.appearances], ['Starts', stats?.starts], ['Goals', stats?.goals], ['Assists', stats?.assists], ['Minutes', stats?.minutes_played], ['Yellow cards', stats?.yellow_cards], ['Red cards', stats?.red_cards],
          ].map(([label, value]) => <div className="public-player-stat" key={label as string}><strong>{Number(value ?? 0).toLocaleString()}</strong><span>{label}</span></div>)}</div>
        </section>
      </>}
    </main>
  </PublicFrame>
}

export function PublicSquadDetailPage() {
  const { id } = useParams()
  const [squad, setSquad] = useState<any>(null)
  const [players, setPlayers] = useState<Array<{ player: PublicPlayer; role: string; shirt_number: number | null; position: string | null; is_captain: boolean; is_vice_captain: boolean; is_goalkeeper: boolean }>>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    async function load() {
      if (!supabase || !id) { setError('Squad announcement is unavailable.'); setLoading(false); return }
      const client = supabase
      const { data: squadResult, error: squadError } = await client.from('squad_announcements').select('id, title, description, formation, published_at, team_id, competition_id, match_id, university_id').eq('id', id).eq('is_published', true).maybeSingle()
      if (!active) return
      if (squadError || !squadResult) { setError('This squad announcement is not available publicly.'); setLoading(false); return }
      const { data: lineup } = await client.from('squad_announcement_players').select('player_id, squad_role, shirt_number, position, is_captain, is_vice_captain, is_goalkeeper, sort_order').eq('announcement_id', id).order('sort_order')
      const playerIds = (lineup ?? []).map((row) => row.player_id)
      const { data: profileRows } = playerIds.length ? await client.from('public_player_profiles').select('id, full_name, photo_url, position').in('id', playerIds) : { data: [] }
      if (!active) return
      const playerMap = new Map((profileRows ?? []).map((row) => [row.id, row as PublicPlayer]))
      setSquad(squadResult)
      setPlayers((lineup ?? []).flatMap((row) => {
        const profile = playerMap.get(row.player_id)
        return profile ? [{ player: profile, role: row.squad_role, shirt_number: row.shirt_number, position: row.position, is_captain: row.is_captain, is_vice_captain: row.is_vice_captain, is_goalkeeper: row.is_goalkeeper }] : []
      }))
      setLoading(false)
    }
    void load()
    return () => { active = false }
  }, [id])

  return <PublicFrame>
    <main className="public-detail-page">
      <PublicBackLink to={squad ? `/teams/${squad.team_id}` : '/universities'} />
      {squad && <header className="public-detail-heading"><span className="public-overline">OFFICIAL SQUAD · {squad.formation}</span><h1>{squad.title}</h1><p>{squad.description}</p><span className="public-detail-inline"><CalendarDays size={14} /> Published {new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(new Date(squad.published_at))}</span></header>}
      <PublicState loading={loading} error={error} />
      {!loading && !error && <div className="public-squad-columns">{(['starting_xi', 'substitute'] as const).map((role) => <section className="public-detail-section" key={role}>
        <div className="public-section-heading"><div><span className="public-overline">MATCHDAY</span><h2>{role === 'starting_xi' ? 'Starting XI' : 'Substitutes'}</h2></div><span>{players.filter((entry) => entry.role === role).length}</span></div>
        <div className="public-player-grid">{players.filter((entry) => entry.role === role).map((entry) => <Link className="public-player-row" to={`/players/${entry.player.id}`} key={entry.player.id}>
          <span className="public-player-photo">{entry.player.photo_url ? <img src={publicImageUrl(entry.player.photo_url)} alt="" /> : <Users size={18} />}</span><span><strong>{entry.player.full_name}</strong><small>{entry.position || entry.player.position || 'Player'}{entry.is_captain ? ' · Captain' : entry.is_vice_captain ? ' · Vice-captain' : entry.is_goalkeeper ? ' · Goalkeeper' : ''}</small></span><b>{entry.shirt_number ?? '—'}</b>
        </Link>)}</div>
      </section>)}</div>}
    </main>
  </PublicFrame>
}

function formatLabel(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value))
}