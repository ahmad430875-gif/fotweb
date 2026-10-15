import { useEffect, useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Trophy, CalendarDays, ArrowLeft, CircleDot } from 'lucide-react'

export function CompetitionDetailPage() {
  const { id } = useParams()
  const [competition, setCompetition] = useState<any>(null)
  const [matches, setMatches] = useState<any[]>([])
  const [teams, setTeams] = useState<Record<string, any>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    async function loadCompetitionDetails() {
      if (!supabase || !id) {
        setLoading(false)
        return
      }

      const [compRes, matchRes] = await Promise.all([
        supabase.from('competitions').select('*').eq('id', id).maybeSingle(),
        supabase.from('matches').select('*').eq('competition_id', id).order('kickoff_at'),
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
      const teamIds = Array.from(new Set(matchesData.flatMap((m: any) => [m.home_team_id, m.away_team_id]).filter(Boolean)))
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

  const standings = useMemo(() => {
    // compute standings from finished matches
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
        home.wins += 1; home.pts += 3; away.losses += 1
      } else if (hs < as) {
        away.wins += 1; away.pts += 3; home.losses += 1
      } else {
        home.draws += 1; away.draws += 1; home.pts += 1; away.pts += 1
      }
    })

    // finalize gd and sort
    const rows = Object.values(table).map((r) => ({ ...r, gd: r.gf - r.ga }))
    rows.sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf)
    return rows
  }, [matches, teams])

  if (loading) {
    return <div className="p-12 text-center text-gray-500">Loading competition details...</div>
  }

  if (error || !competition) {
    return (
      <div className="max-w-2xl mx-auto p-12 text-center">
        <h2 className="text-xl font-bold mb-2">Competition not found</h2>
        <p className="text-gray-500 mb-6">This competition may not exist or is currently unpublished.</p>
        <Link to="/" className="inline-block px-4 py-2 bg-black text-white rounded-lg text-sm">Back to Home</Link>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto p-6 md:p-10">
      <Link to="/" className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-black mb-6">
        <ArrowLeft size={16} /> Back to overview
      </Link>

      {/* Competition Header Info */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6 md:p-8 shadow-sm mb-8">
        <div className="flex items-center gap-2 text-amber-600 mb-2">
          <Trophy size={20} />
          <span className="text-xs font-bold uppercase tracking-wider">
            {competition.type?.replaceAll('_', ' ')} · {competition.season}
          </span>
        </div>
        <h1 className="text-3xl font-extrabold text-gray-900 mb-3">{competition.name}</h1>
        <p className="text-gray-600 text-sm leading-relaxed mb-4">
          {competition.description || `Format: ${competition.format?.replaceAll('_', ' ')} · Hosted from ${new Date(competition.start_date).toLocaleDateString()} to ${new Date(competition.end_date).toLocaleDateString()}`}
        </p>
        {competition.venue && (
          <div className="text-xs text-gray-500">Primary Venue: <strong className="text-gray-800">{competition.venue}</strong></div>
        )}
      </div>

      {/* Standings */}
      <section className="bg-white border border-gray-200 rounded-2xl p-6 md:p-8 shadow-sm mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Trophy size={18} className="text-gray-700" />
          <h2 className="text-lg font-bold text-gray-900">Standings</h2>
        </div>
        {standings.length === 0 ? (
          <div className="text-center py-6 text-gray-500">Standings will appear once matches are completed.</div>
        ) : (
          <table className="w-full text-sm">
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
              {standings.map((row, idx) => (
                <tr key={row.teamId} className="border-b">
                  <td className="py-2 text-xs text-gray-600">{idx + 1}</td>
                  <td className="py-2 font-medium">{row.teamName}</td>
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
          </table>
        )}
      </section>

      {/* Fixtures Section */}
      <section className="bg-white border border-gray-200 rounded-2xl p-6 md:p-8 shadow-sm">
        <div className="flex items-center gap-2 mb-6">
          <CalendarDays size={20} className="text-gray-700" />
          <h2 className="text-xl font-bold text-gray-900">Fixtures & Results</h2>
        </div>

        {matches.length === 0 ? (
          <div className="text-center py-10 text-gray-500 border border-dashed rounded-xl">
            <CircleDot size={24} className="mx-auto mb-2 opacity-40" />
            <p className="text-sm font-medium">No fixtures scheduled for this competition yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {matches.map((match) => {
              const homeTeam = teams[match.home_team_id]
              const awayTeam = teams[match.away_team_id]
              const isFinished = match.status === 'full_time'

              return (
                <Link key={match.id} to={`/matches/${match.id}`} className="block text-inherit no-underline">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 border rounded-xl gap-3 text-sm hover:shadow-sm">
                    <div className="text-xs text-gray-500">
                      {new Date(match.kickoff_at).toLocaleDateString('en', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </div>
                    <div className="font-semibold text-gray-900 flex-1 sm:text-center">
                      {homeTeam?.name || 'Home Side'} <span className="text-gray-400 font-normal mx-2">vs</span> {awayTeam?.name || 'Away Side'}
                    </div>
                    <div className="flex items-center gap-3">
                      {isFinished ? (
                        <span className="font-mono font-bold bg-gray-100 px-3 py-1 rounded-md">{match.home_score} : {match.away_score}</span>
                      ) : (
                        <span className="text-xs px-2.5 py-1 bg-amber-50 text-amber-700 rounded-md font-medium capitalize">{match.status.replaceAll('_', ' ')}</span>
                      )}
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
