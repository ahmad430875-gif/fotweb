import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Trophy, CalendarDays, ArrowLeft, CircleDot } from 'lucide-react'

export function CompetitionDetailPage() {
  const { id } = useParams()
  const [competition, setCompetition] = useState<any>(null)
  const [matches, setMatches] = useState<any[]>([])
  const [teams, setTeams] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    async function loadCompetitionDetails() {
      if (!supabase || !id) {
        setLoading(false)
        return
      }

      const [compRes, matchRes, teamRes] = await Promise.all([
        supabase.from('competitions').select('*').eq('id', id).maybeSingle(),
        supabase.from('matches').select('*').eq('competition_id', id).order('kickoff_at'),
        supabase.from('teams').select('id, name, short_name, logo_url')
      ])

      if (!active) return
      if (compRes.error) {
        setError('Could not load competition details.')
      } else {
        setCompetition(compRes.data)
        setMatches(matchRes.data ?? [])
        setTeams(teamRes.data ?? [])
      }
      setLoading(false)
    }

    void loadCompetitionDetails()
    return () => {
      active = false
    }
  }, [id])

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
              const homeTeam = teams.find((t) => t.id === match.home_team_id)
              const awayTeam = teams.find((t) => t.id === match.away_team_id)
              const isFinished = match.status === 'full_time'

              return (
                <div key={match.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 border rounded-xl gap-3 text-sm">
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
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
