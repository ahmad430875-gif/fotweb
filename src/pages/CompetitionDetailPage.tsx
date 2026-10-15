import { useEffect, useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Trophy, CalendarDays, ArrowLeft, CircleDot } from 'lucide-react'
import { PublicFrame } from './PublicPages'

export function CompetitionDetailPage() {
  const { id } = useParams()
  const [competition, setCompetition] = useState<any>(null)
  const [matches, setMatches] = useState<any[]>([])
  const [teams, setTeams] = useState<Record<string, any>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Standings fetched from DB view when available; fallback to client-side calc
  const [standings, setStandings] = useState<any[] | null>(null)

  useEffect(() => {
    let active = true
    async function loadCompetitionDetails() {
      if (!supabase || !id) {
        setLoading(false)
        return
      }

      const [compRes, matchRes, membershipRes] = await Promise.all([
        supabase.from('competitions').select('*').eq('id', id).maybeSingle(),
        supabase.from('matches').select('*').eq('competition_id', id).order('kickoff_at'),
        supabase.from('competition_teams').select('team_id').eq('competition_id', id),
      ])

      if (!active) return
      if (compRes.error) {
        setError('Could not load competition details.')
        setLoading(false)
        return
      }

      setCompetition(compRes.data)
      const matchesData = matchRes.data ?? []
      setMatches(matchesData)

      // collect team ids referenced by matches and fetch details
      const teamIds = Array.from(new Set([
        ...matchesData.flatMap((m: any) => [m.home_team_id, m.away_team_id]),
        ...(membershipRes.data ?? []).map((membership) => membership.team_id),
      ].filter(Boolean)))
      if (teamIds.length > 0) {
        const { data: teamData, error: teamErr } = await supabase.from('teams').select('id, name, short_name, logo_url, university_id').in('id', teamIds)
        if (!teamErr && teamData) {
          const map: Record<string, any> = {}
          teamData.forEach((t: any) => { map[t.id] = t })
          if (active) setTeams(map)
        }
      }

      setLoading(false)
    }

    void loadCompetitionDetails()
    return () => { active = false }
  }, [id])

  // Try to load aggregated standings from DB view (competition_standings)
  useEffect(() => {
    if (!supabase || !id) return
    const client = supabase
    let active = true
    async function loadStandings() {
      try {
        const { data, error } = await client
          .from('competition_standings')
          .select('team_id, team_name, short_name, logo_url, played, wins, draws, losses, gf, ga, gd, pts')
          .eq('competition_id', id)
          .order('pts', { ascending: false })
          .order('gd', { ascending: false })
          .order('gf', { ascending: false })

        if (!active) return
        if (error) {
          console.error('Standings query failed', error)
          setStandings(null) // fallback to client computation
        } else {
          setStandings(data ?? [])
        }
      } catch (err) {
        console.error('Standings load error', err)
        if (active) setStandings(null)
      }
    }

    void loadStandings()
    return () => { active = false }
  }, [id])

  // Client-side fallback standings computation (used only if view is unavailable)
  const computedStandings = useMemo(() => {
    const table: Record<string, { teamId: string; teamName: string; played: number; wins: number; draws: number; losses: number; gf: number; ga: number; gd: number; pts: number }> = {}
    const finished = matches.filter((m) => m.status === 'full_time')
    finished.forEach((m) => {
      const teamsInMatch = [m.home_team_id, m.away_team_id]
      teamsInMatch.forEach((tid) => {
        if (!table[tid]) {
          table[tid] = { teamId: tid, teamName: teams[tid]?.name ?? 'Team', played: 0, wins: 0, draws: 0, losses: 0, gf: 0, ga: 0, gd: 0, pts: 0 }
        }
      })

      const home = table[m.home_team_id]
      const away = table[m.away_team_id]
      const hs = Number(m.home_score ?? 0)
      const as = Number(m.away_score ?? 0)

      home.played += 1
      away.played += 1
      home.gf += hs
      home.ga += as
      away.gf += as
      away.ga += hs

      if (hs > as) {
        home.wins += 1
        home.pts += Number(competition?.points_for_win ?? 3)
        away.losses += 1
        away.pts += Number(competition?.points_for_loss ?? 0)
      } else if (hs < as) {
        away.wins += 1
        away.pts += Number(competition?.points_for_win ?? 3)
        home.losses += 1
        home.pts += Number(competition?.points_for_loss ?? 0)
      } else {
        home.draws += 1; away.draws += 1
        home.pts += Number(competition?.points_for_draw ?? 1)
        away.pts += Number(competition?.points_for_draw ?? 1)
      }
    })

    const rows = Object.values(table).map((r) => ({ ...r, gd: r.gf - r.ga }))
    rows.sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf)
    return rows
  }, [competition?.points_for_draw, competition?.points_for_loss, competition?.points_for_win, matches, teams])

  const finalStandings = standings ?? computedStandings

  if (loading) {
    return <PublicFrame><main className="public-detail-page"><div className="public-loading">Loading competition details…</div></main></PublicFrame>
  }

  if (error || !competition) {
    return (
      <PublicFrame><main className="public-detail-page"><div className="public-empty"><CircleDot size={18} /><strong>Competition not found</strong><span>This competition may not exist or is currently unpublished.</span><Link className="public-detail-inline" to="/competitions">Browse competitions</Link></div></main></PublicFrame>
    )
  }

  return (
    <PublicFrame>
    <main className="public-detail-page">
      <Link to="/competitions" className="public-detail-back">
        <ArrowLeft size={16} /> Back to overview
      </Link>

      <header className="public-detail-heading">
        <span className="public-overline">{competition.type?.replaceAll('_', ' ')} · {competition.season}</span>
        <h1>{competition.name}</h1>
        <p>{competition.description || `Format: ${competition.format?.replaceAll('_', ' ')} · ${new Date(competition.start_date).toLocaleDateString()} to ${new Date(competition.end_date).toLocaleDateString()}`}</p>
        <span className="public-detail-inline"><Trophy size={14} />{competition.venue || 'University competition'}</span>
      </header>

      <section className="public-detail-section">
        <div className="public-section-heading"><div><span className="public-overline">LEAGUE TABLE</span><h2>Standings</h2></div></div>
        {finalStandings.length === 0 ? (
          <div className="text-center py-6 text-gray-500">Standings will appear once matches are completed.</div>
        ) : (
          <div className="public-table-wrap"><table className="public-data-table">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b">
                <th className="py-2">#</th>
                <th>Team</th>
                <th className="text-right">P</th>
                <th className="text-right">W</th>
                <th className="text-right">D</th>
                <th className="text-right">L</th>
                <th className="text-right">GF</th>
                <th className="text-right">GA</th>
                <th className="text-right">GD</th>
                <th className="text-right">PTS</th>
              </tr>
            </thead>
            <tbody>
              {finalStandings.map((row, idx) => (
                <tr key={row.teamId ?? row.team_id}>
                  <td className="py-2 text-xs text-gray-600">{idx + 1}</td>
                  <td><Link className="public-detail-inline" to={`/teams/${row.teamId ?? row.team_id}`}>{row.teamName ?? row.team_name}</Link></td>
                  <td className="py-2 text-right">{row.played}</td>
                  <td className="py-2 text-right">{row.wins}</td>
                  <td className="py-2 text-right">{row.draws}</td>
                  <td className="py-2 text-right">{row.losses}</td>
                  <td className="py-2 text-right">{row.gf}</td>
                  <td className="py-2 text-right">{row.ga}</td>
                  <td className="py-2 text-right">{row.gd}</td>
                  <td className="py-2 text-right font-semibold">{row.pts}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </section>

      <section className="public-detail-section">
        <div className="public-section-heading"><div><span className="public-overline">MATCH SCHEDULE</span><h2>Fixtures & Results</h2></div><CalendarDays size={17} /></div>

        {matches.length === 0 ? (
          <div className="public-empty">
            <CircleDot size={24} className="mx-auto mb-2 opacity-40" />
            <p className="text-sm font-medium">No fixtures scheduled for this competition yet.</p>
          </div>
        ) : (
          <div className="public-detail-link-list">
            {matches.map((match) => {
              const homeTeam = teams[match.home_team_id]
              const awayTeam = teams[match.away_team_id]
              const isFinished = match.status === 'full_time'

              return (
                <Link key={match.id} to={`/matches/${match.id}`} className="block text-inherit no-underline">
                  <div className="public-detail-link-row">
                    <span className="public-fixture-date">
                      {new Date(match.kickoff_at).toLocaleDateString('en', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <strong className="public-fixture-teams">
                      {homeTeam?.name || 'Home Side'} <span className="text-gray-400 font-normal mx-2">vs</span> {awayTeam?.name || 'Away Side'}
                    </strong>
                    <span className="public-fixture-score">
                      {isFinished ? (
                        <span className="font-mono font-bold bg-gray-100 px-3 py-1 rounded-md">{match.home_score} : {match.away_score}</span>
                      ) : (
                        <span className="text-xs px-2.5 py-1 bg-amber-50 text-amber-700 rounded-md font-medium capitalize">{match.status.replaceAll('_', ' ')}</span>
                      )}
                    </span>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </section>
    </main>
    </PublicFrame>
  )
}
