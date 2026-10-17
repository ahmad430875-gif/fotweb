import { useEffect, useState, type FormEvent } from 'react'
import { Activity, CalendarDays, CircleDot, Shield, Trophy, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/AuthProvider'
import { universityPortalPath, useUniversityScope } from '../../auth/useUniversityScope'
import { supabase } from '../../lib/supabase'
import { publicImageUrl } from '../../lib/imageUrl'

type University = { id: string; name: string; short_name: string }
type Team = { 
  id: string; 
  name: string; 
  short_name: string; 
  logo_url: string | null; 
  team_photo_url: string | null; 
  season: string | null; 
  coach_name: string | null; 
  captain_player_id: string | null; 
  vice_captain_player_id: string | null; 
  type: string; 
  academic_class: string | null; 
  is_locked: boolean 
}
type Player = { id: string; full_name: string; photo_url: string | null; position: string | null; is_active: boolean }
type Competition = { id: string; name: string; season: string; status: string; is_locked: boolean; type?: string }
type Match = { 
  id: string; 
  competition_id: string; 
  home_team_id: string; 
  away_team_id: string; 
  kickoff_at: string; 
  status: string; 
  home_score: number; 
  away_score: number; 
  published_at: string | null; 
  is_locked: boolean 
}
type Notice = { kind: 'error' | 'success'; text: string }

type ClassTeamRow = { id: string; name: string; short_name: string; academic_class: string; batch_session: string | null; is_locked: boolean }
type ClassPlayerRow = { id: string; full_name: string; current_academic_year: string | null; batch_session: string | null }

function Notice({ notice }: { notice: Notice | null }) {
  if (!notice) return null
  return (
    <div 
      className={`inline-notice ${notice.kind === 'error' ? 'notice-error' : 'notice-success'}`} 
      role={notice.kind === 'error' ? 'alert' : 'status'}
    >
      {notice.text}
    </div>
  )
}

export function SecretaryUniversityTeamPage() {
  const { profile, session } = useAuth()
  const scope = useUniversityScope()
  const universityId = scope?.universityId ?? profile?.university_id
  const [university, setUniversity] = useState<University | null>(null)
  const [teams, setTeams] = useState<Team[]>([])
  const [players, setPlayers] = useState<Player[]>([])
  const [competitions, setCompetitions] = useState<Array<Competition & { type: string }>>([])
  const [teamId, setTeamId] = useState('')
  const [roster, setRoster] = useState<Array<{ registrationId: string; player: Player; competition: string; shirt: number | null }>>([])
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)
  
  const [form, setForm] = useState({ 
    name: '', 
    short_name: '', 
    logo_url: '', 
    team_photo_url: '', 
    season: '2026/2027', 
    coach_name: '', 
    captain_player_id: '', 
    vice_captain_player_id: '' 
  })
  
  const [registration, setRegistration] = useState({ player_id: '', competition_id: '', shirt_number: '' })

  async function load() {
    if (!supabase || !universityId) return
    const [universityResult, teamResult, playerResult, competitionResult, participantResult] = await Promise.all([
      supabase.from('universities').select('id, name, short_name').eq('id', universityId).maybeSingle(),
      supabase.from('teams').select('id, name, short_name, logo_url, team_photo_url, season, coach_name, captain_player_id, vice_captain_player_id, type, academic_class, is_locked').eq('university_id', universityId).eq('type', 'university_team').order('created_at'),
      supabase.from('players').select('id, full_name, photo_url, position, is_active').eq('university_id', universityId).eq('is_active', true).order('full_name'),
      supabase.from('competitions').select('id, name, season, status, is_locked, type').eq('university_id', universityId).order('start_date', { ascending: false }),
      supabase.from('competition_participants').select('competition_id').eq('university_id', universityId).eq('participation_status', 'accepted'),
    ])

    if (universityResult.data) setUniversity(universityResult.data as University)
    if (teamResult.data) {
      setTeams(teamResult.data as Team[])
      const selected = teamResult.data.find((team) => team.id === teamId) ?? teamResult.data[0]
      setTeamId(selected?.id ?? '')
      if (selected) {
        setForm({ 
          name: selected.name, 
          short_name: selected.short_name, 
          logo_url: selected.logo_url ?? '', 
          team_photo_url: selected.team_photo_url ?? '', 
          season: selected.season ?? '2026/2027', 
          coach_name: selected.coach_name ?? '', 
          captain_player_id: selected.captain_player_id ?? '', 
          vice_captain_player_id: selected.vice_captain_player_id ?? '' 
        })
      }
    }
    if (playerResult.data) setPlayers(playerResult.data as Player[])
    if (competitionResult.data) {
      const ownCompetitions = competitionResult.data as Array<Competition & { type: string }>
      const participatingIds = [...new Set((participantResult.data ?? []).map((row) => row.competition_id).filter((id) => !ownCompetitions.some((competition) => competition.id === id)))]
      const participatingResult = participatingIds.length
        ? await supabase.from('competitions').select('id, name, season, status, is_locked, type').in('id', participatingIds)
        : { data: [], error: null }
      if (participatingResult.error) {
        setNotice({ kind: 'error', text: `Accepted competitions could not be loaded: ${participatingResult.error.message}` })
      } else {
        setCompetitions([...ownCompetitions, ...((participatingResult.data ?? []) as Array<Competition & { type: string }>)])
      }
    }
  }

  async function loadRoster(activeTeamId: string) {
    if (!supabase || !universityId || !activeTeamId) { 
      setRoster([])
      return 
    }
    const { data: registrations } = await supabase
      .from('player_registrations')
      .select('id, player_id, competition_id, shirt_number')
      .eq('team_id', activeTeamId)
      .eq('university_id', universityId)
      .is('released_at', null)
      .order('registered_at')

    if (!registrations?.length) { 
      setRoster([])
      return 
    }

    const playerIds = [...new Set(registrations.map((row) => row.player_id))]
    const competitionIds = [...new Set(registrations.map((row) => row.competition_id))]

    const [playerRows, competitionRows] = await Promise.all([
      supabase.from('players').select('id, full_name, photo_url, position, is_active').in('id', playerIds),
      supabase.from('competitions').select('id, name').in('id', competitionIds),
    ])

    const playerById = new Map((playerRows.data ?? []).map((player) => [player.id, player as Player]))
    const competitionById = new Map((competitionRows.data ?? []).map((competition) => [competition.id, competition.name]))

    setRoster(registrations.flatMap((registrationRow) => {
      const player = playerById.get(registrationRow.player_id)
      return player ? [{ 
        registrationId: registrationRow.id, 
        player, 
        competition: competitionById.get(registrationRow.competition_id) ?? 'Competition', 
        shirt: registrationRow.shirt_number 
      }] : []
    }))
  }

  useEffect(() => { void load() }, [universityId])
  useEffect(() => { void loadRoster(teamId) }, [teamId, universityId])

  function change(name: keyof typeof form, value: string) { 
    setForm((current) => ({ ...current, [name]: value })) 
  }

  async function saveTeam(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || !universityId) return
    setBusy(true)
    setNotice(null)

    const payload = { 
      ...form, 
      logo_url: form.logo_url || null, 
      team_photo_url: form.team_photo_url || null, 
      season: form.season || null, 
      coach_name: form.coach_name || null, 
      captain_player_id: form.captain_player_id || null, 
      vice_captain_player_id: form.vice_captain_player_id || null 
    }

    const result = teamId 
      ? await supabase.from('teams').update(payload).eq('id', teamId).select('id').single() 
      : await supabase.from('teams').insert({ 
          ...payload, 
          university_id: universityId, 
          type: 'university_team', 
          academic_class: null, 
          created_by: session?.user.id 
        }).select('id').single()

    setBusy(false)
    if (result.error) {
      setNotice({ 
        kind: 'error', 
        text: result.error.message.includes('locked') 
          ? 'This team is locked by a platform administrator.' 
          : 'The team profile could not be saved. Check required fields and try again.' 
      })
      return
    }

    setTeamId(result.data.id)
    setNotice({ kind: 'success', text: 'University team saved successfully.' })
    await load()
  }

  async function registerPlayer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || !universityId || !teamId) return
    setBusy(true)
    setNotice(null)

    const membership = await supabase.from('competition_teams').upsert({ 
      competition_id: registration.competition_id, 
      team_id: teamId, 
      university_id: universityId 
    }, { onConflict: 'competition_id,team_id' })

    if (membership.error) {
      setBusy(false)
      setNotice({ kind: 'error', text: 'The team could not be registered for that competition.' })
      return
    }

    const { error } = await supabase.from('player_registrations').insert({ 
      player_id: registration.player_id, 
      team_id: teamId, 
      competition_id: registration.competition_id, 
      university_id: universityId, 
      shirt_number: registration.shirt_number ? Number(registration.shirt_number) : null 
    })

    setBusy(false)
    if (error) {
      setNotice({ 
        kind: 'error', 
        text: error.message.includes('unique') 
          ? 'That player is already registered for this team and competition.' 
          : 'The player could not be added. Check shirt-number availability and locks.' 
      })
      return
    }

    setRegistration({ player_id: '', competition_id: '', shirt_number: '' })
    setNotice({ kind: 'success', text: 'Player successfully registered to the team and competition.' })
    await loadRoster(teamId)
  }

  async function releaseRegistration(id: string) {
    if (!supabase || !confirm('Remove this player from the current squad? Their profile and match history will remain.')) return
    const { error } = await supabase.from('player_registrations').update({ released_at: new Date().toISOString() }).eq('id', id)
    if (error) {
      setNotice({ kind: 'error', text: 'This registration could not be released. The competition may be locked.' })
    } else {
      setNotice({ kind: 'success', text: 'Player released from the current squad.' })
      await loadRoster(teamId)
    }
  }

  const selectedTeam = teams.find((team) => team.id === teamId)

  return (
    <section className="secretary-record-page">
      <div className="secretary-heading">
        <div>
          <span className="eyebrow">PRIMARY WORKSPACE</span>
          <h1>University Team</h1>
          <p>Official campus side, leadership, staff, and registered squad.</p>
        </div>
        <span className="secretary-record-total">{university?.short_name ?? 'University'}</span>
      </div>

      <Notice notice={notice} />

      {!teams.length && !teamId && (
        <div className="inline-notice notice-warning">
          <Shield size={16} />
          <span>No official university team yet. Create the team profile below before building its squad.</span>
        </div>
      )}

      <div className="secretary-record-layout">
        <section className="secretary-panel secretary-create-panel">
          <div className="secretary-panel-heading">
            <div>
              <span className="eyebrow">TEAM PROFILE</span>
              <h2>{selectedTeam ? 'Edit university team' : 'Create university team'}</h2>
            </div>
            <Users size={17} />
          </div>

          <form className="secretary-record-form" onSubmit={(event) => void saveTeam(event)}>
            <div className="secretary-field-grid">
              {([
                ['name', 'University team name', 'text'], 
                ['short_name', 'Short name', 'text'], 
                ['logo_url', 'Team crest URL', 'url'], 
                ['team_photo_url', 'Team photo URL', 'url'], 
                ['season', 'Season / year', 'text'], 
                ['coach_name', 'Head coach / manager', 'text']
              ] as const).map(([name, label, type]) => (
                <label className="secretary-field" key={name}>
                  {label}
                  <input 
                    type={type} 
                    value={form[name]} 
                    placeholder={type === 'url' ? 'Paste a public image URL or Google Drive share link' : undefined}
                    onChange={(event) => change(name, event.target.value)} 
                    required={name === 'name' || name === 'short_name'} 
                  />
                  {type === 'url' && form[name] && <span className="url-image-preview"><img src={publicImageUrl(form[name])} alt={`${label} preview`} /><small>{label} preview · public URLs only</small></span>}
                </label>
              ))}

              <label className="secretary-field">
                Captain
                <select value={form.captain_player_id} onChange={(event) => change('captain_player_id', event.target.value)}>
                  <option value="">Not assigned</option>
                  {players.map((player) => (
                    <option key={player.id} value={player.id}>{player.full_name}</option>
                  ))}
                </select>
              </label>

              <label className="secretary-field">
                Vice-captain
                <select value={form.vice_captain_player_id} onChange={(event) => change('vice_captain_player_id', event.target.value)}>
                  <option value="">Not assigned</option>
                  {players.map((player) => (
                    <option key={player.id} value={player.id}>{player.full_name}</option>
                  ))}
                </select>
              </label>
            </div>

            <button className="button button-primary" type="submit" disabled={busy || Boolean(selectedTeam?.is_locked)}>
              {busy ? 'Saving…' : 'Save team profile'}
            </button>
            {selectedTeam?.is_locked && <p className="secretary-form-note">This team is locked by a platform administrator.</p>}
          </form>
        </section>

        <section className="secretary-panel secretary-list-panel">
          <div className="secretary-panel-heading">
            <div>
              <span className="eyebrow">CURRENT SQUAD</span>
              <h2>Registered players</h2>
            </div>
            <span className="secretary-list-count">{roster.length}</span>
          </div>

          {!teamId ? (
            <div className="secretary-empty">Save the university team to start its roster.</div>
          ) : (
            <>
              <form className="secretary-roster-add" onSubmit={(event) => void registerPlayer(event)}>
                <label className="secretary-field">
                  Player
                  <select 
                    required 
                    value={registration.player_id} 
                    onChange={(event) => setRegistration((current) => ({ ...current, player_id: event.target.value }))}
                  >
                    <option value="">Select player</option>
                    {players.map((player) => (
                      <option key={player.id} value={player.id}>{player.full_name}</option>
                    ))}
                  </select>
                </label>

                <label className="secretary-field">
                  Competition
                  <select 
                    required 
                    value={registration.competition_id} 
                    onChange={(event) => setRegistration((current) => ({ ...current, competition_id: event.target.value }))}
                  >
                    <option value="">Select competition</option>
                    {competitions.filter((competition) => competition.type !== 'inter_class').map((competition) => (
                      <option key={competition.id} value={competition.id}>{competition.name} · {competition.season}</option>
                    ))}
                  </select>
                </label>

                <label className="secretary-field secretary-shirt-field">
                  Shirt #
                  <input 
                    type="number" 
                    min="1" 
                    max="99" 
                    value={registration.shirt_number} 
                    onChange={(event) => setRegistration((current) => ({ ...current, shirt_number: event.target.value }))} 
                  />
                </label>

                <button className="button button-primary" type="submit" disabled={busy || !competitions.length}>
                  Add player
                </button>
              </form>

              {!roster.length ? (
                <div className="secretary-empty">No registered players yet.</div>
              ) : (
                <div className="secretary-table-wrap">
                  <table className="secretary-table">
                    <thead>
                      <tr>
                        <th>Player</th>
                        <th>Competition</th>
                        <th>Shirt</th>
                        <th>Position</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {roster.map(({ registrationId, player, competition, shirt }) => (
                        <tr key={registrationId}>
                          <td>
                            <span className="secretary-player-cell">
                              {player.photo_url && <img src={publicImageUrl(player.photo_url)} alt="" />}
                              <strong>{player.full_name}</strong>
                            </span>
                          </td>
                          <td>{competition}</td>
                          <td>{shirt ?? '—'}</td>
                          <td>{player.position ?? '—'}</td>
                          <td>
                            <button className="secretary-text-action" type="button" onClick={() => void releaseRegistration(registrationId)}>
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </section>
  )
}

export function SecretaryClassTeamsPage() {
  const { profile } = useAuth()
  const scope = useUniversityScope()
  const universityId = scope?.universityId ?? profile?.university_id
  const [teams, setTeams] = useState<ClassTeamRow[]>([])
  const [players, setPlayers] = useState<ClassPlayerRow[]>([])
  const [competitions, setCompetitions] = useState<Array<Competition & { type: string }>>([])
  const [teamId, setTeamId] = useState('')
  const [playerId, setPlayerId] = useState('')
  const [competitionId, setCompetitionId] = useState('')
  const [roster, setRoster] = useState<Array<{ id: string; player: ClassPlayerRow; competitionName: string; shirtNumber: number | null }>>([])
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [error, setError] = useState('')
  const selectedTeam = teams.find((team) => team.id === teamId)
  const eligiblePlayers = players.filter((player) => normalizeAcademicClass(player.current_academic_year) === normalizeAcademicClass(selectedTeam?.academic_class))

  async function loadBase() {
    if (!supabase || !universityId) {
      setLoading(false)
      return
    }
    setLoading(true)
    const [teamResult, playerResult, hostedCompetitionResult, participationResult] = await Promise.all([
      supabase.from('teams').select('id, name, short_name, academic_class, batch_session, is_locked').eq('university_id', universityId).eq('type', 'class_team').order('academic_class'),
      supabase.from('players').select('id, full_name, current_academic_year, batch_session').eq('university_id', universityId).eq('is_active', true).order('full_name'),
      supabase.from('competitions').select('id, name, season, status, is_locked, type').eq('university_id', universityId).eq('type', 'inter_class').order('start_date', { ascending: false }),
      supabase.from('competition_participants').select('competition_id').eq('university_id', universityId).eq('participation_status', 'accepted'),
    ])
    const failure = [teamResult, playerResult, hostedCompetitionResult, participationResult].find((result) => result.error)
    if (failure?.error) {
      setError(`Class teams could not be loaded: ${failure.error.message}`)
      setLoading(false)
      return
    }
    const ownCompetitions = (hostedCompetitionResult.data ?? []) as Array<Competition & { type: string }>
    const externalIds = [...new Set((participationResult.data ?? []).map((row) => row.competition_id).filter((id) => !ownCompetitions.some((competition) => competition.id === id)))]
    const externalResult = externalIds.length
      ? await supabase.from('competitions').select('id, name, season, status, is_locked, type').in('id', externalIds).eq('type', 'inter_class')
      : { data: [], error: null }
    if (externalResult.error) {
      setError(`Accepted inter-class competitions could not be loaded: ${externalResult.error.message}`)
      setLoading(false)
      return
    }
    const competitionRows = [...ownCompetitions, ...((externalResult.data ?? []) as Array<Competition & { type: string }>)]
    setTeams((teamResult.data ?? []) as ClassTeamRow[])
    setPlayers((playerResult.data ?? []) as ClassPlayerRow[])
    setCompetitions(competitionRows)
    setTeamId((current) => (teamResult.data ?? []).some((team) => team.id === current) ? current : teamResult.data?.[0]?.id ?? '')
    setCompetitionId((current) => competitionRows.some((competition) => competition.id === current) ? current : competitionRows[0]?.id ?? '')
    setLoading(false)
  }

  async function loadRoster(activeTeamId: string) {
    if (!supabase || !universityId || !activeTeamId) {
      setRoster([])
      return
    }
    const { data: registrationRows, error: registrationError } = await supabase.from('player_registrations')
      .select('id, player_id, competition_id, shirt_number')
      .eq('team_id', activeTeamId)
      .eq('university_id', universityId)
      .is('released_at', null)
      .order('registered_at')
    if (registrationError) {
      setError(`Class roster could not be loaded: ${registrationError.message}`)
      return
    }
    if (!registrationRows?.length) {
      setRoster([])
      return
    }
    const [playerResult, competitionResult] = await Promise.all([
      supabase.from('players').select('id, full_name, current_academic_year, batch_session').in('id', registrationRows.map((row) => row.player_id)),
      supabase.from('competitions').select('id, name, season').in('id', [...new Set(registrationRows.map((row) => row.competition_id))]),
    ])
    if (playerResult.error || competitionResult.error) {
      setError(`Class roster details could not be loaded: ${playerResult.error?.message ?? competitionResult.error?.message}`)
      return
    }
    const playerMap = new Map(((playerResult.data ?? []) as ClassPlayerRow[]).map((player) => [player.id, player]))
    const competitionMap = new Map((competitionResult.data ?? []).map((competition) => [competition.id, `${competition.name} · ${competition.season}`]))
    setRoster(registrationRows.flatMap((row) => {
      const player = playerMap.get(row.player_id)
      return player ? [{ id: row.id, player, competitionName: competitionMap.get(row.competition_id) ?? 'Competition', shirtNumber: row.shirt_number }] : []
    }))
  }

  useEffect(() => { void loadBase() }, [universityId])
  useEffect(() => { void loadRoster(teamId) }, [teamId, universityId])

  async function createClassTeam(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || !universityId) return
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    const name = String(form.get('team-name') ?? '').trim()
    const shortName = String(form.get('short-name') ?? '').trim()
    const academicClass = String(form.get('academic-class') ?? '').trim()
    if (!name || !shortName || !academicClass) return
    setBusy(true)
    setError('')
    setNotice(null)
    const { data, error: createError } = await supabase.from('teams').insert({
      university_id: universityId,
      name,
      short_name: shortName,
      type: 'class_team',
      academic_class: academicClass,
    }).select('id').single()
    setBusy(false)
    if (createError) {
      setError(`Class team could not be created: ${createError.message}`)
      return
    }
    setNotice({ kind: 'success', text: `${academicClass} team created. Only players with that academic year will appear in its roster.` })
    setTeamId(data.id)
    formElement.reset()
    await loadBase()
  }

  async function registerClassPlayer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || !universityId || !selectedTeam || !competitionId || !playerId) return
    setBusy(true)
    setError('')
    setNotice(null)
    const { error: membershipError } = await supabase.from('competition_teams').upsert({
      competition_id: competitionId,
      team_id: selectedTeam.id,
      university_id: universityId,
    }, { onConflict: 'competition_id,team_id' })
    if (membershipError) {
      setBusy(false)
      setError(`Class team could not be entered in the inter-class competition: ${membershipError.message}`)
      return
    }
    const { error: registrationError } = await supabase.from('player_registrations').insert({
      player_id: playerId,
      team_id: selectedTeam.id,
      competition_id: competitionId,
      university_id: universityId,
    })
    setBusy(false)
    if (registrationError) {
      setError(registrationError.message.includes('academic year')
        ? 'Player academic year does not match this class team.'
        : `Player could not be registered: ${registrationError.message}`)
      return
    }
    setNotice({ kind: 'success', text: 'Player registered to the class team for this inter-class competition.' })
    setPlayerId('')
    await loadRoster(selectedTeam.id)
  }

  async function releaseClassPlayer(registrationId: string) {
    if (!supabase || !confirm('Release this player from the class-team competition roster?')) return
    const { error: releaseError } = await supabase.from('player_registrations').update({ released_at: new Date().toISOString() }).eq('id', registrationId)
    if (releaseError) {
      setError(`Player could not be released: ${releaseError.message}`)
      return
    }
    if (selectedTeam) await loadRoster(selectedTeam.id)
  }

  return (
    <section className="secretary-record-page">
      <div className="secretary-heading"><div><span className="eyebrow">INTER-CLASS FOOTBALL</span><h1>Class teams &amp; rosters</h1><p>Build a team for each academic class. Player eligibility is matched to the permanent academic year in their student profile.</p></div></div>
      {error && <div className="inline-notice notice-error" role="alert">{error}</div>}
      <Notice notice={notice} />
      <div className="secretary-record-layout">
        <section className="secretary-panel secretary-create-panel">
          <div className="secretary-panel-heading"><div><span className="eyebrow">TEAM SETUP</span><h2>Create a class team</h2></div><Users size={17} /></div>
          <p className="secretary-form-note">Examples: MBBS Year 1 FC or DPT Year 3 FC. Choose the same academic-year label used in player profiles.</p>
          <form className="secretary-record-form" onSubmit={(event) => void createClassTeam(event)}>
            <div className="secretary-field-grid">
              <label className="secretary-field">Team name<input name="team-name" required minLength={2} placeholder="e.g. MBBS Year 1 FC" /></label>
              <label className="secretary-field">Short name<input name="short-name" required minLength={2} placeholder="e.g. MBBS Y1" /></label>
              <label className="secretary-field secretary-field-full">Academic class<input name="academic-class" required minLength={2} list="class-academic-years" placeholder="Use the same label as player profiles, e.g. MBBS Year 1" /><datalist id="class-academic-years">{['Year 1', 'Year 2', 'Year 3', 'Year 4', 'Year 5', '1st Year', '2nd Year', '3rd Year', '4th Year', '5th Year', 'HO', 'PGr'].map((year) => <option key={year} value={year} />)}</datalist></label>
            </div>
            <button className="button button-primary" type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create class team'}</button>
          </form>
          <div className="secretary-panel-heading class-team-select-heading"><div><span className="eyebrow">YOUR CLASS TEAMS</span><h2>Select a team</h2></div><span className="secretary-list-count">{teams.length}</span></div>
          {loading ? <div className="secretary-empty">Loading class teams…</div> : teams.length ? (
            <div className="class-team-picker">{teams.map((team) => <button key={team.id} className={team.id === teamId ? 'class-team-option class-team-option-active' : 'class-team-option'} type="button" onClick={() => setTeamId(team.id)}><strong>{team.name}</strong><span>{team.academic_class}{team.is_locked ? ' · Locked' : ''}</span></button>)}</div>
          ) : <div className="secretary-empty">Create your first class team to start a roster.</div>}
        </section>
        <section className="secretary-panel secretary-list-panel">
          <div className="secretary-panel-heading"><div><span className="eyebrow">ACADEMIC-YEAR ELIGIBILITY</span><h2>{selectedTeam?.name ?? 'Select a class team'}</h2></div><span className="secretary-list-count">{eligiblePlayers.length} eligible</span></div>
          {selectedTeam ? (
            <>
              <p className="secretary-form-note">Eligible players must have <strong>{selectedTeam.academic_class}</strong> as their current academic year. Their permanent university profile remains owned by your university.</p>
              <form className="secretary-record-form" onSubmit={(event) => void registerClassPlayer(event)}>
                <div className="secretary-field-grid">
                  <label className="secretary-field">Inter-class competition<select required value={competitionId} onChange={(event) => setCompetitionId(event.target.value)}><option value="">Choose competition</option>{competitions.map((competition) => <option key={competition.id} value={competition.id}>{competition.name} · {competition.season}</option>)}</select></label>
                  <label className="secretary-field">Eligible player<select required value={playerId} onChange={(event) => setPlayerId(event.target.value)}><option value="">Choose player · {eligiblePlayers.length} eligible</option>{eligiblePlayers.map((player) => <option key={player.id} value={player.id}>{player.full_name}{player.batch_session ? ` · ${player.batch_session}` : ''}</option>)}</select></label>
                </div>
                {!competitions.length && <p className="secretary-form-note">Create an inter-class competition or accept an inter-class invitation in Leagues &amp; invitations before entering this team.</p>}
                <button className="button button-primary" type="submit" disabled={busy || !eligiblePlayers.length || !competitionId}>{busy ? 'Adding…' : 'Add player to competition roster'}</button>
              </form>
              <div className="secretary-panel-heading class-team-roster-heading"><div><span className="eyebrow">REGISTERED PLAYERS</span><h2>Competition rosters</h2></div><span className="secretary-list-count">{roster.length}</span></div>
              {roster.length ? <div className="secretary-table-wrap"><table className="secretary-table"><thead><tr><th>Player</th><th>Academic year</th><th>Competition</th><th>Action</th></tr></thead><tbody>{roster.map((row) => <tr key={row.id}><td>{row.player.full_name}</td><td>{row.player.current_academic_year ?? '—'}</td><td>{row.competitionName}</td><td><button className="secretary-text-action" type="button" onClick={() => void releaseClassPlayer(row.id)}>Remove</button></td></tr>)}</tbody></table></div> : <div className="secretary-empty">No active class-team registrations yet.</div>}
            </>
          ) : <div className="secretary-empty">Select or create a class team to manage its competition rosters.</div>}
        </section>
      </div>
    </section>
  )
}

function normalizeAcademicClass(value: string | null | undefined) {
  return (value ?? '').trim().toLowerCase().replace(/[^a-z0-9]/g, '').replace(/^mbbs/, '')
}

export function SecretaryAnnouncementsPage() {
  const { profile, session } = useAuth()
  const scope = useUniversityScope()
  const universityId = scope?.universityId ?? profile?.university_id
  const [teams, setTeams] = useState<Array<{ id: string; name: string; type: string }>>([])
  const [competitions, setCompetitions] = useState<Competition[]>([])
  const [matches, setMatches] = useState<Match[]>([])
  const [roster, setRoster] = useState<Array<Player & { shirt_number: number | null }>>([])
  const [announcements, setAnnouncements] = useState<Array<{ id: string; title: string; is_published: boolean; formation: string; team_id: string; competition_id: string; created_at: string }>>([])
  const [selectedTeam, setSelectedTeam] = useState('')
  const [selectedCompetition, setSelectedCompetition] = useState('')
  const [selectedMatch, setSelectedMatch] = useState('')
  const [starters, setStarters] = useState<string[]>([])
  const [substitutes, setSubstitutes] = useState<string[]>([])
  const [captainId, setCaptainId] = useState('')
  const [viceCaptainId, setViceCaptainId] = useState('')
  const [goalkeeperId, setGoalkeeperId] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)
  const selectedTeamRow = teams.find((team) => team.id === selectedTeam)
  const eligibleCompetitions = competitions.filter((competition) => selectedTeamRow
    ? (selectedTeamRow.type === 'class_team') === (competition.type === 'inter_class')
    : true)
  const eligibleTeams = teams.filter((team) => {
    const competition = competitions.find((row) => row.id === selectedCompetition)
    return !competition || (team.type === 'class_team') === (competition.type === 'inter_class')
  })

  async function loadBase() {
    if (!supabase || !universityId) return
    const [teamRows, competitionRows, announcementRows, participationRows] = await Promise.all([
      supabase.from('teams').select('id, name, type').eq('university_id', universityId).eq('is_active', true).order('name'),
      supabase.from('competitions').select('id, name, season, status, is_locked, type').eq('university_id', universityId).order('start_date', { ascending: false }),
      supabase.from('squad_announcements').select('id, title, is_published, formation, team_id, competition_id, created_at').eq('university_id', universityId).order('created_at', { ascending: false }).limit(30),
      supabase.from('competition_participants').select('competition_id').eq('university_id', universityId).eq('participation_status', 'accepted'),
    ])
    const failure = [teamRows, competitionRows, announcementRows, participationRows].find((result) => result.error)
    if (failure?.error) {
      setNotice({ kind: 'error', text: `Squad workspace could not be loaded: ${failure.error.message}` })
      return
    }
    const ownCompetitions = competitionRows.data ?? []
    const additionalIds = [...new Set((participationRows.data ?? []).map((row) => row.competition_id).filter((id) => !ownCompetitions.some((competition) => competition.id === id)))]
    const additionalRows = additionalIds.length
      ? await supabase.from('competitions').select('id, name, season, status, is_locked, type').in('id', additionalIds)
      : { data: [], error: null }
    if (additionalRows.error) {
      setNotice({ kind: 'error', text: `Accepted competitions could not be loaded: ${additionalRows.error.message}` })
      return
    }
    setTeams(teamRows.data ?? [])
    setCompetitions([...ownCompetitions, ...((additionalRows.data ?? []) as Competition[])])
    setAnnouncements(announcementRows.data ?? [])
  }

  useEffect(() => { void loadBase() }, [universityId])

  useEffect(() => {
    let active = true
    async function loadRoster() {
      if (!supabase || !universityId || !selectedTeam || !selectedCompetition) { 
        setRoster([])
        return 
      }
      const [registrationRows, matchRows] = await Promise.all([
        supabase.from('player_registrations').select('player_id, shirt_number').eq('university_id', universityId).eq('team_id', selectedTeam).eq('competition_id', selectedCompetition).is('released_at', null),
        supabase.from('matches').select('id, competition_id, home_team_id, away_team_id, kickoff_at, status, home_score, away_score, published_at, is_locked').eq('competition_id', selectedCompetition).order('kickoff_at'),
      ])
      if (!active) return
      if (registrationRows.error || matchRows.error) {
        setNotice({ kind: 'error', text: `Squad roster could not be loaded: ${registrationRows.error?.message ?? matchRows.error?.message}` })
        return
      }
      setMatches((matchRows.data ?? []) as Match[])
      if (!registrationRows.data?.length) { 
        setRoster([])
        return 
      }
      const ids = registrationRows.data.map((registrationRow) => registrationRow.player_id)
      const { data, error: playerError } = await supabase.from('players').select('id, full_name, photo_url, position, is_active').in('id', ids).eq('is_active', true).order('full_name')
      if (playerError) {
        setNotice({ kind: 'error', text: `Registered players could not be loaded: ${playerError.message}` })
        return
      }
      const numbers = new Map(registrationRows.data.map((registrationRow) => [registrationRow.player_id, registrationRow.shirt_number]))
      setRoster((data ?? []).map((player) => ({ ...(player as Player), shirt_number: numbers.get(player.id) ?? null })))
    }
    void loadRoster()
    return () => { active = false }
  }, [universityId, selectedTeam, selectedCompetition])

  function togglePlayer(id: string, role: 'starter' | 'substitute') {
    const selected = role === 'starter' ? starters : substitutes
    const setSelected = role === 'starter' ? setStarters : setSubstitutes
    if (selected.includes(id)) {
      setSelected(selected.filter((playerId) => playerId !== id))
    } else if (role === 'starter' && selected.length >= 11) {
      setNotice({ kind: 'error', text: 'The starting XI is strictly limited to eleven players.' })
    } else if (role === 'substitute' && selected.length >= 12) {
      setNotice({ kind: 'error', text: 'You can select up to twelve substitutes.' })
    } else {
      setNotice(null)
      setSelected([...selected, id])
    }
  }

  async function createSquad(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || !universityId || !session?.user.id) return
    if (starters.length !== 11 || !captainId || !goalkeeperId) {
      setNotice({ kind: 'error', text: 'Choose exactly eleven starters, team captain, and designated goalkeeper before publishing.' })
      return
    }
    if (captainId === viceCaptainId && viceCaptainId) {
      setNotice({ kind: 'error', text: 'Captain and vice-captain must be distinct players.' })
      return
    }

    setBusy(true)
    setNotice(null)

    const formElement = event.currentTarget
    const form = new FormData(formElement)
    const title = String(form.get('title') ?? '').trim()
    const description = String(form.get('description') ?? '').trim()
    const formation = String(form.get('formation') ?? '4-3-3')

    const { data: announcement, error: createError } = await supabase.from('squad_announcements').insert({
      university_id: universityId,
      team_id: selectedTeam,
      competition_id: selectedCompetition,
      match_id: selectedMatch || null,
      title,
      description,
      formation,
      created_by: session.user.id
    }).select('id').single()

    if (createError || !announcement) {
      setBusy(false)
      setNotice({ kind: 'error', text: 'The squad draft could not be saved. Check team and competition access.' })
      return
    }

    const rows = [
      ...starters.map((playerId, sort_order) => ({
        announcement_id: announcement.id,
        player_id: playerId,
        squad_role: 'starting_xi',
        is_captain: playerId === captainId,
        is_vice_captain: playerId === viceCaptainId,
        is_goalkeeper: playerId === goalkeeperId,
        sort_order,
        shirt_number: roster.find((player) => player.id === playerId)?.shirt_number ?? null,
        position: roster.find((player) => player.id === playerId)?.position ?? null
      })),
      ...substitutes.map((playerId, index) => ({
        announcement_id: announcement.id,
        player_id: playerId,
        squad_role: 'substitute',
        is_captain: false,
        is_vice_captain: false,
        is_goalkeeper: false,
        sort_order: index + 11,
        shirt_number: roster.find((player) => player.id === playerId)?.shirt_number ?? null,
        position: roster.find((player) => player.id === playerId)?.position ?? null
      }))
    ]

    const { error: lineupError } = await supabase.from('squad_announcement_players').insert(rows as never)
    if (lineupError) {
      await supabase.from('squad_announcements').delete().eq('id', announcement.id)
      setBusy(false)
      setNotice({ kind: 'error', text: 'The lineup could not be saved. Confirm every selected player is registered to this team and competition.' })
      return
    }

    const { error: publishError } = await supabase.rpc('publish_squad_announcement', { target_announcement: announcement.id })
    setBusy(false)
    if (publishError) {
      setNotice({ 
        kind: 'error', 
        text: publishError.message.includes('locked') 
          ? 'This team or competition is locked by a Super Admin.' 
          : 'Squad saved as draft, but could not be published. Verify eleven starters, captain, and goalkeeper.' 
      })
      await loadBase()
      return
    }

    setNotice({ kind: 'success', text: 'Official matchday squad published successfully.' })
    setStarters([])
    setSubstitutes([])
    setCaptainId('')
    setViceCaptainId('')
    setGoalkeeperId('')
    formElement.reset()
    await loadBase()
  }

  async function withdraw(id: string) {
    if (!supabase || !confirm('Withdraw this published squad from public pages?')) return
    const { error } = await supabase.from('squad_announcements').update({ is_published: false }).eq('id', id)
    if (error) {
      setNotice({ kind: 'error', text: 'The squad could not be withdrawn. The competition may be locked.' })
    } else {
      setNotice({ kind: 'success', text: 'Squad withdrawn from public pages.' })
      await loadBase()
    }
  }

  return (
    <section className="secretary-record-page">
      <div className="secretary-heading">
        <div>
          <span className="eyebrow">TEAM COMMUNICATION</span>
          <h1>Squad Announcements</h1>
          <p>Publish an official starting XI and substitutes for a competition or match.</p>
        </div>
      </div>

      <Notice notice={notice} />

      <div className="secretary-record-layout">
        <section className="secretary-panel secretary-create-panel">
          <div className="secretary-panel-heading">
            <div>
              <span className="eyebrow">NEW ANNOUNCEMENT</span>
              <h2>Build the lineup</h2>
            </div>
            <Users size={17} />
          </div>

          <form className="secretary-record-form" onSubmit={(event) => void createSquad(event)}>
            <div className="secretary-field-grid">
              <label className="secretary-field">
                Team
                <select 
                  required 
                  value={selectedTeam} 
                  onChange={(event) => { 
                    const nextTeamId = event.target.value
                    const nextTeam = teams.find((team) => team.id === nextTeamId)
                    const competition = competitions.find((row) => row.id === selectedCompetition)
                    setSelectedTeam(nextTeamId)
                    if (nextTeam && competition && (nextTeam.type === 'class_team') !== (competition.type === 'inter_class')) {
                      setSelectedCompetition('')
                      setSelectedMatch('')
                    }
                    setStarters([]) 
                    setSubstitutes([]) 
                  }}
                >
                  <option value="">Select team</option>
                  {eligibleTeams.map((team) => (
                    <option key={team.id} value={team.id}>{team.name}</option>
                  ))}
                </select>
              </label>

              <label className="secretary-field">
                Competition
                <select 
                  required 
                  value={selectedCompetition} 
                  onChange={(event) => { 
                    const nextCompetitionId = event.target.value
                    const competition = competitions.find((row) => row.id === nextCompetitionId)
                    const team = teams.find((row) => row.id === selectedTeam)
                    setSelectedCompetition(nextCompetitionId)
                    if (competition && team && (team.type === 'class_team') !== (competition.type === 'inter_class')) {
                      setSelectedTeam('')
                    }
                    setSelectedMatch('') 
                    setStarters([]) 
                    setSubstitutes([]) 
                  }}
                >
                  <option value="">Select competition</option>
                  {eligibleCompetitions.map((competition) => (
                    <option key={competition.id} value={competition.id}>{competition.name} · {competition.season}</option>
                  ))}
                </select>
              </label>

              <label className="secretary-field secretary-field-full">
                Match (optional)
                <select value={selectedMatch} onChange={(event) => setSelectedMatch(event.target.value)}>
                  <option value="">Competition squad only</option>
                  {matches.map((match) => (
                    <option key={match.id} value={match.id}>
                      {new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(match.kickoff_at))}
                    </option>
                  ))}
                </select>
              </label>

              <label className="secretary-field secretary-field-full">
                Announcement title
                <input name="title" required minLength={3} maxLength={180} defaultValue="Official matchday squad" />
              </label>

              <label className="secretary-field secretary-field-full">
                Description
                <input name="description" maxLength={500} placeholder="Optional note for supporters" />
              </label>

              <label className="secretary-field">
                Formation
                <select name="formation" defaultValue="4-3-3">
                  {['4-3-3', '4-4-2', '4-2-3-1', '3-5-2', '3-4-3', '5-3-2'].map((formation) => (
                    <option key={formation}>{formation}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="secretary-lineup-group">
              <div className="secretary-lineup-title">
                <strong>Starting XI</strong>
                <span>{starters.length}/11</span>
              </div>
              {roster.length ? (
                <div className="secretary-selectable-roster">
                  {roster.map((player) => (
                    <label className="secretary-roster-option" key={player.id}>
                      <input 
                        type="checkbox" 
                        checked={starters.includes(player.id)} 
                        disabled={!starters.includes(player.id) && starters.length >= 11} 
                        onChange={() => togglePlayer(player.id, 'starter')} 
                      />
                      <span>
                        <strong>{player.shirt_number ?? '—'} · {player.full_name}</strong>
                        <small>{player.position ?? 'Position not set'}</small>
                      </span>
                    </label>
                  ))}
                </div>
              ) : (
                <p className="secretary-form-note">Select a registered team and competition to load eligible players.</p>
              )}
            </div>

            <div className="secretary-field-grid secretary-lineup-officials">
              <label className="secretary-field">
                Captain
                <select required value={captainId} onChange={(event) => setCaptainId(event.target.value)}>
                  <option value="">Select captain</option>
                  {roster.filter((player) => starters.includes(player.id)).map((player) => (
                    <option value={player.id} key={player.id}>{player.full_name}</option>
                  ))}
                </select>
              </label>

              <label className="secretary-field">
                Vice-captain
                <select value={viceCaptainId} onChange={(event) => setViceCaptainId(event.target.value)}>
                  <option value="">Not assigned</option>
                  {roster.filter((player) => starters.includes(player.id) && player.id !== captainId).map((player) => (
                    <option value={player.id} key={player.id}>{player.full_name}</option>
                  ))}
                </select>
              </label>

              <label className="secretary-field">
                Goalkeeper
                <select required value={goalkeeperId} onChange={(event) => setGoalkeeperId(event.target.value)}>
                  <option value="">Select goalkeeper</option>
                  {roster.filter((player) => starters.includes(player.id)).map((player) => (
                    <option value={player.id} key={player.id}>{player.full_name}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="secretary-lineup-group">
              <div className="secretary-lineup-title">
                <strong>Substitutes</strong>
                <span>{substitutes.length}/12</span>
              </div>
              <div className="secretary-selectable-roster">
                {roster.filter((player) => !starters.includes(player.id)).map((player) => (
                  <label className="secretary-roster-option" key={player.id}>
                    <input 
                      type="checkbox" 
                      checked={substitutes.includes(player.id)} 
                      disabled={!substitutes.includes(player.id) && substitutes.length >= 12} 
                      onChange={() => togglePlayer(player.id, 'substitute')} 
                    />
                    <span>
                      <strong>{player.shirt_number ?? '—'} · {player.full_name}</strong>
                      <small>{player.position ?? 'Position not set'}</small>
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <button className="button button-primary" type="submit" disabled={busy || starters.length !== 11 || !selectedTeam || !selectedCompetition}>
              {busy ? 'Publishing…' : 'Publish official squad'}
            </button>
          </form>
        </section>

        <section className="secretary-panel secretary-list-panel">
          <div className="secretary-panel-heading">
            <div>
              <span className="eyebrow">PUBLIC LINEUPS</span>
              <h2>Recent squads</h2>
            </div>
            <span className="secretary-list-count">{announcements.length}</span>
          </div>

          {!announcements.length ? (
            <div className="secretary-empty">No squad announcements yet.</div>
          ) : (
            <div className="secretary-table-wrap">
              <table className="secretary-table">
                <thead>
                  <tr>
                    <th>Announcement</th>
                    <th>Formation</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {announcements.map((announcement) => (
                    <tr key={announcement.id}>
                      <td>{announcement.title}</td>
                      <td>{announcement.formation}</td>
                      <td>{announcement.is_published ? 'Published' : 'Draft'}</td>
                      <td>
                        {announcement.is_published && (
                          <button className="secretary-text-action" type="button" onClick={() => void withdraw(announcement.id)}>
                            Withdraw
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </section>
  )
}

export function SecretaryLiveMatchPage() {
  const { profile, session } = useAuth()
  const scope = useUniversityScope()
  const universityId = scope?.universityId ?? profile?.university_id
  const [matches, setMatches] = useState<Match[]>([])
  const [matchId, setMatchId] = useState('')
  const [teams, setTeams] = useState<Array<{ id: string; name: string }>>([])
  const [players, setPlayers] = useState<Array<{ id: string; full_name: string; team_id: string; shirt_number: number | null }>>([])
  const [events, setEvents] = useState<Array<{ id: number; event_type: string; minute: number | null; stoppage_minute: number | null; team_id: string | null; player_id: string | null; related_player_id: string | null; assist_player_id: string | null; is_reversed: boolean; correction_note: string | null; recorded_at: string }>>([])
  const [teamsById, setTeamsById] = useState<Record<string, string>>({})
  const [playersById, setPlayersById] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)
  
  const [form, setForm] = useState({ 
    event_type: 'goal', 
    team_id: '', 
    player_id: '', 
    related_player_id: '', 
    assist_player_id: '', 
    minute: '', 
    stoppage_minute: '', 
    details: '' 
  })

  async function loadMatches() {
    if (!supabase || !universityId) return
    const { data, error } = await supabase
      .from('matches')
      .select('id, competition_id, home_team_id, away_team_id, kickoff_at, status, home_score, away_score, published_at, is_locked')
      .in('status', ['scheduled', 'warm_up', 'live', 'half_time'])
      .order('kickoff_at')

    if (error) {
      setNotice({ kind: 'error', text: 'Matches could not be loaded. Refresh and try again.' })
    } else {
      setMatches((data ?? []) as Match[])
      if (!matchId && data?.length) setMatchId(data[0].id)
    }
  }

  async function loadMatch(id: string) {
    if (!supabase || !universityId || !id) return
    const match = matches.find((row) => row.id === id)
    if (!match) return

    const [teamRows, lineupRows, eventRows] = await Promise.all([
      supabase.from('teams').select('id, name').in('id', [match.home_team_id, match.away_team_id]),
      supabase.from('match_players').select('player_id, team_id, shirt_number').eq('match_id', id),
      supabase.from('match_events').select('id, event_type, minute, stoppage_minute, team_id, player_id, related_player_id, assist_player_id, is_reversed, correction_note, recorded_at').eq('match_id', id).order('minute').order('stoppage_minute'),
    ])

    setTeams(teamRows.data ?? [])
    setTeamsById(Object.fromEntries((teamRows.data ?? []).map((team) => [team.id, team.name])))
    setEvents((eventRows.data ?? []) as typeof events)

    if (lineupRows.data?.length) {
      const { data: playerRows } = await supabase.from('players').select('id, full_name').in('id', lineupRows.data.map((lineup) => lineup.player_id))
      const playerNames = new Map((playerRows ?? []).map((player) => [player.id, player.full_name]))
      const lineups = lineupRows.data.map((lineup) => ({
        id: lineup.player_id,
        full_name: playerNames.get(lineup.player_id) ?? 'Player',
        team_id: lineup.team_id,
        shirt_number: lineup.shirt_number
      }))
      setPlayers(lineups)
      setPlayersById(Object.fromEntries(lineups.map((player) => [player.id, `${player.shirt_number ?? '—'} · ${player.full_name}`])))
    } else {
      setPlayers([])
      setPlayersById({})
    }
  }

  useEffect(() => { void loadMatches() }, [universityId])
  useEffect(() => { void loadMatch(matchId) }, [matchId, matches.length])

  const selected = matches.find((match) => match.id === matchId)
  const availablePlayers = players.filter((player) => !form.team_id || player.team_id === form.team_id)

  async function changeStatus(status: string) {
    if (!supabase || !selected) return
    setBusy(true)
    setNotice(null)
    const { error } = await supabase.from('matches').update({
      status,
      published_at: status === 'scheduled' ? selected.published_at : selected.published_at ?? new Date().toISOString()
    }).eq('id', selected.id)

    setBusy(false)
    if (error) {
      setNotice({ kind: 'error', text: error.message.includes('locked') ? 'This match or competition is locked.' : 'Match status could not be updated.' })
    } else {
      setNotice({ kind: 'success', text: `Match marked ${status.replaceAll('_', ' ')}.` })
      await loadMatches()
    }
  }

  async function recordEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || !selected || !session?.user.id) return

    const minute = Number(form.minute)
    if (!Number.isInteger(minute) || minute < 0 || minute > 150) {
      setNotice({ kind: 'error', text: 'Enter a valid match minute between 0 and 150.' })
      return
    }

    const duplicate = events.some((item) => 
      !item.is_reversed && 
      item.event_type === form.event_type && 
      item.minute === minute && 
      item.team_id === (form.team_id || null) && 
      item.player_id === (form.player_id || null)
    )

    if (duplicate && !confirm('A matching event is already on the timeline. Record it again anyway?')) return

    setBusy(true)
    setNotice(null)

    const { error } = await supabase.from('match_events').insert({
      match_id: selected.id,
      university_id: universityId,
      event_type: form.event_type,
      team_id: form.team_id || null,
      player_id: form.player_id || null,
      related_player_id: form.related_player_id || null,
      assist_player_id: form.assist_player_id || null,
      minute,
      stoppage_minute: form.stoppage_minute ? Number(form.stoppage_minute) : null,
      details: form.details ? { note: form.details } : {},
      recorded_by: session.user.id,
      action_key: crypto.randomUUID()
    })

    setBusy(false)
    if (error) {
      setNotice({ 
        kind: 'error', 
        text: error.message.includes('duplicate') 
          ? 'This matching event is already recorded.' 
          : error.message.includes('locked') 
            ? 'This match or competition is locked.' 
            : 'Event could not be recorded. Ensure the players are in this match lineup.' 
      })
      return
    }

    setForm((current) => ({ ...current, minute: '', stoppage_minute: '', details: '' }))
    setNotice({ kind: 'success', text: 'Match event recorded and score updated successfully.' })
    await loadMatch(selected.id)
    await loadMatches()
  }

  async function reverseEvent(item: typeof events[number]) {
    if (!supabase || !selected) return
    const correction_note = prompt('Why is this event being corrected / reversed?')?.trim()
    if (!correction_note) return

    setBusy(true)
    const { error } = await supabase.from('match_events').update({
      is_reversed: true,
      reversed_at: new Date().toISOString(),
      reversed_by: session?.user.id,
      correction_note
    }).eq('id', item.id)

    setBusy(false)
    if (error) {
      setNotice({ kind: 'error', text: error.message.includes('locked') ? 'This match is locked.' : 'Event could not be reversed.' })
    } else {
      setNotice({ kind: 'success', text: 'Event reversed; score recalculated and audit trail recorded.' })
      await loadMatch(selected.id)
      await loadMatches()
    }
  }

  return (
    <section className="secretary-record-page">
      <div className="secretary-heading">
        <div>
          <span className="eyebrow">LIVE OPERATIONS</span>
          <h1>Live Match Centre</h1>
          <p>Manage match state and record an auditable event timeline.</p>
        </div>
      </div>

      <Notice notice={notice} />

      <div className="secretary-match-toolbar">
        <label className="secretary-field">
          Match
          <select value={matchId} onChange={(event) => setMatchId(event.target.value)}>
            <option value="">Select active match</option>
            {matches.map((match) => (
              <option value={match.id} key={match.id}>
                {new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(match.kickoff_at))} · {teamsById[match.home_team_id] ?? 'Home'} vs {teamsById[match.away_team_id] ?? 'Away'}
              </option>
            ))}
          </select>
        </label>
        {selected && (
          <div className="secretary-live-score">
            <span>{teamsById[selected.home_team_id] ?? 'Home'}</span>
            <strong>{selected.home_score} : {selected.away_score}</strong>
            <span>{teamsById[selected.away_team_id] ?? 'Away'}</span>
          </div>
        )}
      </div>

      {!selected ? (
        <div className="secretary-empty">
          <CalendarDays size={22} />
          <strong>No active or scheduled match</strong>
          <span>Create and publish a fixture, then open it here.</span>
          <Link className="button button-secondary" to={universityPortalPath(scope?.basePath ?? '/secretary', '/matches')}>Open fixtures</Link>
        </div>
      ) : (
        <div className="secretary-record-layout secretary-live-layout">
          <section className="secretary-panel secretary-create-panel">
            <div className="secretary-panel-heading">
              <div>
                <span className="eyebrow">MATCH CONTROL</span>
                <h2>{selected.status.replaceAll('_', ' ')}</h2>
              </div>
              <CircleDot size={17} />
            </div>

            <div className="secretary-state-actions">
              {selected.status === 'scheduled' && (
                <button className="button button-primary" type="button" disabled={busy || selected.is_locked} onClick={() => void changeStatus('live')}>
                  Start match
                </button>
              )}
              {selected.status === 'live' && (
                <button className="button button-secondary" type="button" disabled={busy || selected.is_locked} onClick={() => void changeStatus('half_time')}>
                  Mark half-time
                </button>
              )}
              {selected.status === 'half_time' && (
                <button className="button button-primary" type="button" disabled={busy || selected.is_locked} onClick={() => void changeStatus('live')}>
                  Start second half
                </button>
              )}
              {['live', 'half_time'].includes(selected.status) && (
                <button className="button button-secondary" type="button" disabled={busy || selected.is_locked} onClick={() => void changeStatus('full_time')}>
                  Mark full-time
                </button>
              )}
              {selected.is_locked && <p className="secretary-form-note">This match is locked by a platform administrator.</p>}
            </div>

            <form className="secretary-record-form" onSubmit={(event) => void recordEvent(event)}>
              <div className="secretary-field-grid">
                <label className="secretary-field">
                  Event
                  <select value={form.event_type} onChange={(event) => setForm((current) => ({ ...current, event_type: event.target.value }))}>
                    {[
                      ['goal', 'Goal'], 
                      ['own_goal', 'Own goal'], 
                      ['penalty', 'Penalty goal'], 
                      ['missed_penalty', 'Missed penalty'], 
                      ['yellow_card', 'Yellow card'], 
                      ['red_card', 'Red card'], 
                      ['substitution', 'Substitution'], 
                      ['injury', 'Injury'], 
                      ['other', 'Other']
                    ].map(([value, label]) => (
                      <option value={value} key={value}>{label}</option>
                    ))}
                  </select>
                </label>

                <label className="secretary-field">
                  Credited team
                  <select 
                    required 
                    value={form.team_id} 
                    onChange={(event) => setForm((current) => ({ ...current, team_id: event.target.value, player_id: '', related_player_id: '', assist_player_id: '' }))}
                  >
                    <option value="">Select team</option>
                    {teams.map((team) => (
                      <option value={team.id} key={team.id}>{team.name}</option>
                    ))}
                  </select>
                </label>

                <label className="secretary-field secretary-field-full">
                  Player
                  <select value={form.player_id} onChange={(event) => setForm((current) => ({ ...current, player_id: event.target.value }))}>
                    <option value="">No player / not listed</option>
                    {availablePlayers.map((player) => (
                      <option value={player.id} key={player.id}>{playersById[player.id]}</option>
                    ))}
                  </select>
                </label>

                {form.event_type === 'substitution' && (
                  <label className="secretary-field secretary-field-full">
                    Player on
                    <select value={form.related_player_id} onChange={(event) => setForm((current) => ({ ...current, related_player_id: event.target.value }))}>
                      <option value="">Select substitute entering</option>
                      {players.filter((player) => player.team_id === form.team_id && player.id !== form.player_id).map((player) => (
                        <option value={player.id} key={player.id}>{playersById[player.id]}</option>
                      ))}
                    </select>
                  </label>
                )}

                {form.event_type === 'goal' && (
                  <label className="secretary-field secretary-field-full">
                    Assist provider (optional)
                    <select value={form.assist_player_id} onChange={(event) => setForm((current) => ({ ...current, assist_player_id: event.target.value }))}>
                      <option value="">No assist recorded</option>
                      {availablePlayers.filter((player) => player.id !== form.player_id).map((player) => (
                        <option value={player.id} key={player.id}>{playersById[player.id]}</option>
                      ))}
                    </select>
                  </label>
                )}

                <label className="secretary-field">
                  Minute
                  <input type="number" min="0" max="150" required value={form.minute} onChange={(event) => setForm((current) => ({ ...current, minute: event.target.value }))} />
                </label>

                <label className="secretary-field">
                  Stoppage time
                  <input type="number" min="0" max="30" value={form.stoppage_minute} onChange={(event) => setForm((current) => ({ ...current, stoppage_minute: event.target.value }))} />
                </label>

                <label className="secretary-field secretary-field-full">
                  Event note
                  <input value={form.details} onChange={(event) => setForm((current) => ({ ...current, details: event.target.value }))} placeholder="Optional match note" />
                </label>
              </div>

              <button className="button button-primary" type="submit" disabled={busy || selected.is_locked || !['live', 'half_time'].includes(selected.status)}>
                {busy ? 'Recording…' : 'Record event'}
              </button>
              {!['live', 'half_time'].includes(selected.status) && !selected.is_locked && (
                <p className="secretary-form-note">Start the match before recording timeline events.</p>
              )}
            </form>
          </section>

          <section className="secretary-panel secretary-list-panel">
            <div className="secretary-panel-heading">
              <div>
                <span className="eyebrow">LIVE TIMELINE</span>
                <h2>Match events</h2>
              </div>
              <span className="secretary-list-count">{events.filter((item) => !item.is_reversed).length}</span>
            </div>

            {events.length === 0 ? (
              <div className="secretary-empty">
                <Activity size={20} />
                <strong>No events recorded</strong>
                <span>Goals, cards, and match events will appear here.</span>
              </div>
            ) : (
              <ol className="secretary-event-list">
                {events.map((item) => (
                  <li className={item.is_reversed ? 'secretary-event secretary-event-reversed' : 'secretary-event'} key={item.id}>
                    <time>{item.minute ?? '—'}{item.stoppage_minute ? `+${item.stoppage_minute}` : "'"}</time>
                    <span className="secretary-event-copy">
                      <strong>{eventLabel(item.event_type)} · {item.team_id ? teamsById[item.team_id] ?? 'Team' : 'Match'}</strong>
                      <small>{[item.player_id ? playersById[item.player_id] : '', item.assist_player_id ? `Assist: ${playersById[item.assist_player_id]}` : '', item.related_player_id ? `On: ${playersById[item.related_player_id]}` : '', item.correction_note ?? ''].filter(Boolean).join(' · ')}</small>
                    </span>
                    {item.is_reversed ? (
                      <span className="secretary-event-undo">Reversed</span>
                    ) : (
                      <button className="secretary-text-action" type="button" disabled={busy || selected.is_locked} onClick={() => void reverseEvent(item)}>
                        Correct
                      </button>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      )}
    </section>
  )
}

function eventLabel(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export function SecretaryStandingsPage() {
  const { profile } = useAuth()
  const scope = useUniversityScope()
  const universityId = scope?.universityId ?? profile?.university_id
  const [competitions, setCompetitions] = useState<Competition[]>([])
  const [competitionId, setCompetitionId] = useState('')
  const [rows, setRows] = useState<Array<{ position: number; team_id: string; team_name: string; played: number; won: number; drawn: number; lost: number; goals_for: number; goals_against: number; goal_difference: number; points: number }>>([])
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState<Notice | null>(null)

  useEffect(() => {
    let active = true
    async function loadCompetitions() {
      if (!supabase || !universityId) {
        setLoading(false)
        return 
      }
      const { data, error } = await supabase
        .from('competitions')
        .select('id, name, season, status, is_locked')
        .eq('university_id', universityId)
        .eq('status', 'published')
        .order('start_date', { ascending: false })

      if (!active) return
      if (error) setNotice({ kind: 'error', text: 'Competitions could not be loaded.' })
      setCompetitions((data ?? []) as Competition[])
      if (!competitionId && data?.length) setCompetitionId(data[0].id)
      setLoading(false)
    }
    void loadCompetitions()
    return () => { active = false }
  }, [universityId])

  useEffect(() => {
    let active = true
    async function loadRows() {
      if (!supabase || !competitionId) { 
        setRows([])
        return 
      }
      const { data, error } = await supabase
        .from('competition_standings')
        .select('position, team_id, team_name, played, won, drawn, lost, goals_for, goals_against, goal_difference, points')
        .eq('competition_id', competitionId)
        .order('position')

      if (!active) return
      if (error) setNotice({ kind: 'error', text: 'Standings could not be loaded.' })
      setRows((data ?? []) as typeof rows)
    }
    void loadRows()
    return () => { active = false }
  }, [competitionId])

  return (
    <section className="secretary-record-page">
      <div className="secretary-heading">
        <div>
          <span className="eyebrow">COMPETITION TABLES</span>
          <h1>Standings</h1>
          <p>Calculated from published full-time results and each competition’s points rules.</p>
        </div>
        <label className="secretary-field secretary-competition-filter">
          Competition
          <select value={competitionId} onChange={(event) => setCompetitionId(event.target.value)}>
            <option value="">Select competition</option>
            {competitions.map((competition) => (
              <option key={competition.id} value={competition.id}>{competition.name} · {competition.season}</option>
            ))}
          </select>
        </label>
      </div>

      <Notice notice={notice} />

      {loading ? (
        <div className="secretary-empty">Loading competitions…</div>
      ) : !competitionId ? (
        <div className="secretary-empty">No published competitions to show.</div>
      ) : (
        <div className="secretary-panel secretary-list-panel">
          <div className="secretary-table-wrap">
            <table className="secretary-table secretary-standings-table">
              <thead>
                <tr>
                  <th>Pos</th>
                  <th>Team</th>
                  <th>P</th>
                  <th>W</th>
                  <th>D</th>
                  <th>L</th>
                  <th>GF</th>
                  <th>GA</th>
                  <th>GD</th>
                  <th>Pts</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.team_id}>
                    <td>{row.position}</td>
                    <td><strong>{row.team_name}</strong></td>
                    <td>{row.played}</td>
                    <td>{row.won}</td>
                    <td>{row.drawn}</td>
                    <td>{row.lost}</td>
                    <td>{row.goals_for}</td>
                    <td>{row.goals_against}</td>
                    <td>{row.goal_difference > 0 ? `+${row.goal_difference}` : row.goal_difference}</td>
                    <td><strong>{row.points}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  )
}

export function SecretaryStatisticsPage() {
  const { profile } = useAuth()
  const scope = useUniversityScope()
  const universityId = scope?.universityId ?? profile?.university_id
  const [competitions, setCompetitions] = useState<Competition[]>([])
  const [competitionId, setCompetitionId] = useState('')
  const [players, setPlayers] = useState<Array<{ player_id: string; full_name: string; team_name: string; appearances: number; goals: number; assists: number; yellow_cards: number; red_cards: number; clean_sheets: number }>>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!supabase || !universityId) {
      setLoading(false)
      return
    }
    supabase.from('competitions')
      .select('id, name, season, status, is_locked')
      .eq('university_id', universityId)
      .eq('status', 'published')
      .order('start_date', { ascending: false })
      .then(({ data }) => {
        setCompetitions((data ?? []) as Competition[])
        if (data?.length) setCompetitionId(data[0].id)
        setLoading(false)
      })
  }, [universityId])

  useEffect(() => {
    if (!supabase || !competitionId) { 
      setPlayers([])
      return 
    }
    supabase.from('competition_player_stats')
      .select('player_id, full_name, team_name, appearances, goals, assists, yellow_cards, red_cards, clean_sheets')
      .eq('competition_id', competitionId)
      .order('goals', { ascending: false })
      .order('assists', { ascending: false })
      .then(({ data }) => setPlayers((data ?? []) as typeof players))
  }, [competitionId])

  const topGoals = [...players].sort((a, b) => b.goals - a.goals || b.assists - a.assists).slice(0, 5)
  const topAssists = [...players].sort((a, b) => b.assists - a.assists || b.goals - a.goals).slice(0, 5)
  const mostAppearances = [...players].sort((a, b) => b.appearances - a.appearances).slice(0, 5)
  const mostCleanSheets = [...players].sort((a, b) => b.clean_sheets - a.clean_sheets || b.appearances - a.appearances).slice(0, 5)
  const mostYellowCards = [...players].sort((a, b) => b.yellow_cards - a.yellow_cards).slice(0, 5)
  const mostRedCards = [...players].sort((a, b) => b.red_cards - a.red_cards).slice(0, 5)

  return (
    <section className="secretary-record-page">
      <div className="secretary-heading">
        <div>
          <span className="eyebrow">SEASON DATA</span>
          <h1>Statistics</h1>
          <p>Player totals calculated from match lineups and recorded events.</p>
        </div>
        <label className="secretary-field secretary-competition-filter">
          Competition
          <select value={competitionId} onChange={(event) => setCompetitionId(event.target.value)}>
            <option value="">Select competition</option>
            {competitions.map((competition) => (
              <option key={competition.id} value={competition.id}>{competition.name} · {competition.season}</option>
            ))}
          </select>
        </label>
      </div>

      {loading ? (
        <div className="secretary-empty">Loading competitions…</div>
      ) : !competitionId ? (
        <div className="secretary-empty">No published competitions to show.</div>
      ) : (
        <div className="secretary-stats-grid">
          {[
            { title: 'Top scorers', field: 'goals' as const, list: topGoals }, 
            { title: 'Top assists', field: 'assists' as const, list: topAssists }, 
            { title: 'Most appearances', field: 'appearances' as const, list: mostAppearances },
            { title: 'Most clean sheets', field: 'clean_sheets' as const, list: mostCleanSheets },
            { title: 'Yellow cards', field: 'yellow_cards' as const, list: mostYellowCards },
            { title: 'Red cards', field: 'red_cards' as const, list: mostRedCards }
          ].map((group) => (
            <section className="secretary-panel secretary-stats-panel" key={group.title}>
              <div className="secretary-panel-heading">
                <h2>{group.title}</h2>
                <Trophy size={16} />
              </div>
              {group.list.length ? group.list.map((player, index) => (
                <div className="secretary-stat-row" key={player.player_id}>
                  <span>{index + 1}</span>
                  <span><strong>{player.full_name}</strong><small>{player.team_name}</small></span>
                  <b>{player[group.field]}</b>
                </div>
              )) : (
                <div className="secretary-empty">Stats appear when published matches are completed.</div>
              )}
            </section>
          ))}
        </div>
      )}
    </section>
  )
}

export function SecretarySettingsPage() {
  const { profile, refreshProfile } = useAuth()
  const [displayName, setDisplayName] = useState(profile?.display_name ?? '')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || !profile) return
    setBusy(true)
    setNotice(null)

    const { error } = await supabase.from('user_profiles').update({ display_name: displayName.trim() }).eq('id', profile.id)
    setBusy(false)
    if (error) {
      setNotice({ kind: 'error', text: 'Profile settings could not be saved.' })
    } else {
      setNotice({ kind: 'success', text: 'Profile settings saved successfully.' })
      await refreshProfile()
    }
  }

  return (
    <section className="secretary-record-page">
      <div className="secretary-heading">
        <div>
          <span className="eyebrow">ACCOUNT</span>
          <h1>Settings</h1>
          <p>Manage your Secretary profile. University access is assigned by a Super Admin.</p>
        </div>
      </div>

      <Notice notice={notice} />

      <section className="secretary-panel secretary-settings-panel">
        <form className="secretary-record-form" onSubmit={(event) => void save(event)}>
          <label className="secretary-field">
            Display name
            <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={120} />
          </label>
          <label className="secretary-field">
            Account email
            <input value={profile?.id ? 'Signed in via secure campus auth' : ''} readOnly />
          </label>
          <button className="button button-primary" type="submit" disabled={busy}>
            {busy ? 'Saving…' : 'Save profile'}
          </button>
        </form>
      </section>
    </section>
  )
}
