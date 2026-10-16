import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { ArrowRight, Building2, CircleHelp, MailPlus, Trophy, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/AuthProvider'
import { supabase } from '../../lib/supabase'
import './SecretaryLeaguePortal.css'

type Competition = { id: string; name: string; season: string; university_id: string; type: string; start_date: string; end_date: string }
type Participation = { competition_id: string; university_id: string; participation_status: 'invited' | 'accepted' | 'declined'; invited_at: string }
type University = { id: string; name: string; short_name: string }
type Team = { id: string; name: string; type: 'university_team' | 'class_team'; academic_class: string | null }
type Entry = { competition_id: string; team_id: string; university_id: string }

export function SecretaryLeaguePortal() {
  const { profile, session } = useAuth()
  const universityId = profile?.university_id
  const [competitions, setCompetitions] = useState<Competition[]>([])
  const [participations, setParticipations] = useState<Participation[]>([])
  const [universities, setUniversities] = useState<University[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [allEntryTeams, setAllEntryTeams] = useState<Team[]>([])
  const [entries, setEntries] = useState<Entry[]>([])
  const [hostCompetitionId, setHostCompetitionId] = useState('')
  const [inviteUniversityId, setInviteUniversityId] = useState('')
  const [entryCompetitionId, setEntryCompetitionId] = useState('')
  const [entryTeamId, setEntryTeamId] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const competitionsById = useMemo(() => Object.fromEntries(competitions.map((competition) => [competition.id, competition])), [competitions])
  const universitiesById = useMemo(() => Object.fromEntries(universities.map((university) => [university.id, university])), [universities])
  const hostedCompetitions = competitions.filter((competition) => competition.university_id === universityId)
  const acceptedParticipations = participations.filter((participation) => participation.participation_status === 'accepted' && competitionsById[participation.competition_id]?.university_id !== universityId)
  const invitations = participations.filter((participation) => participation.participation_status === 'invited')
  const alreadyInvitedIds = new Set(participations
    .filter((participation) => participation.competition_id === hostCompetitionId && participation.participation_status !== 'declined')
    .map((participation) => participation.university_id))
  const availableUniversities = universities.filter((university) => university.id !== universityId && !alreadyInvitedIds.has(university.id))
  const selectedCompetition = competitionsById[entryCompetitionId]
  const eligibleTeams = teams.filter((team) => selectedCompetition?.type === 'inter_class'
    ? team.type === 'class_team'
    : team.type === 'university_team')
  const selectedCompetitionEntries = entries.filter((entry) => entry.competition_id === entryCompetitionId)

  async function load() {
    if (!supabase || !universityId) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    const [ownedResult, participationResult, universityResult, teamResult] = await Promise.all([
      supabase.from('competitions').select('id, name, season, university_id, type, start_date, end_date').eq('university_id', universityId).order('start_date', { ascending: false }),
      supabase.from('competition_participants').select('competition_id, university_id, participation_status, invited_at').eq('university_id', universityId).order('invited_at', { ascending: false }),
      supabase.from('universities').select('id, name, short_name').eq('is_active', true).order('name'),
      supabase.from('teams').select('id, name, type, academic_class').eq('university_id', universityId).eq('is_active', true).order('name'),
    ])
    const initialFailure = [ownedResult, participationResult, universityResult, teamResult].find((result) => result.error)
    if (initialFailure?.error) {
      setError(`League workspace could not be loaded: ${initialFailure.error.message}. Apply the multi-university competition migration and try again.`)
      setLoading(false)
      return
    }

    const ownCompetitions = (ownedResult.data ?? []) as Competition[]
    const participantRows = (participationResult.data ?? []) as Participation[]
    const [hostInvitesResult] = await Promise.all([
      ownCompetitions.length
        ? supabase.from('competition_participants').select('competition_id, university_id, participation_status, invited_at').in('competition_id', ownCompetitions.map((competition) => competition.id)).neq('university_id', universityId)
        : Promise.resolve({ data: [], error: null }),
    ])
    if (hostInvitesResult.error) {
      setError(`University invitations could not be loaded: ${hostInvitesResult.error.message}`)
      setLoading(false)
      return
    }
    const hostInvites = (hostInvitesResult.data ?? []) as Participation[]
    const accessibleCompetitionIds = [...new Set([
      ...ownCompetitions.map((competition) => competition.id),
      ...participantRows.filter((row) => row.participation_status === 'accepted').map((row) => row.competition_id),
    ])]
    const additionalCompetitionIds = [...new Set(participantRows.map((row) => row.competition_id).filter((id) => !ownCompetitions.some((competition) => competition.id === id)))]
    const [otherCompetitionResult, entryResult] = await Promise.all([
      additionalCompetitionIds.length
        ? supabase.from('competitions').select('id, name, season, university_id, type, start_date, end_date').in('id', additionalCompetitionIds)
        : Promise.resolve({ data: [], error: null }),
      accessibleCompetitionIds.length
        ? supabase.from('competition_teams').select('competition_id, team_id, university_id').in('competition_id', accessibleCompetitionIds)
        : Promise.resolve({ data: [], error: null }),
    ])
    const additionalFailure = [otherCompetitionResult, entryResult].find((result) => result.error)
    if (additionalFailure?.error) {
      setError(`Competition participation could not be loaded: ${additionalFailure.error.message}`)
      setLoading(false)
      return
    }
    const entryRows = (entryResult.data ?? []) as Entry[]
    const externalTeamIds = [...new Set(entryRows.map((entry) => entry.team_id).filter((id) => !(teamResult.data ?? []).some((team) => team.id === id)))]
    const externalTeamsResult = externalTeamIds.length
      ? await supabase.from('teams').select('id, name, type, academic_class').in('id', externalTeamIds)
      : { data: [], error: null }
    if (externalTeamsResult.error) {
      setError(`Participating team details could not be loaded: ${externalTeamsResult.error.message}`)
      setLoading(false)
      return
    }
    setCompetitions([...ownCompetitions, ...((otherCompetitionResult.data ?? []) as Competition[])])
    setParticipations([...participantRows, ...hostInvites])
    setUniversities((universityResult.data ?? []) as University[])
    setTeams((teamResult.data ?? []) as Team[])
    setAllEntryTeams([...(teamResult.data ?? []) as Team[], ...((externalTeamsResult.data ?? []) as Team[])])
    setEntries(entryRows)
    setHostCompetitionId((current) => ownCompetitions.some((competition) => competition.id === current) ? current : ownCompetitions[0]?.id ?? '')
    const acceptedIds = participantRows.filter((row) => row.participation_status === 'accepted').map((row) => row.competition_id)
    setEntryCompetitionId((current) => acceptedIds.includes(current) ? current : acceptedIds.find((id) => !ownCompetitions.some((competition) => competition.id === id)) ?? '')
    setLoading(false)
  }

  useEffect(() => { void load() }, [universityId])

  async function inviteUniversity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || !universityId || !session?.user.id || !hostCompetitionId || !inviteUniversityId) return
    setBusy(true)
    setError('')
    setNotice('')
    const declinedInvitation = participations.find((participation) =>
      participation.competition_id === hostCompetitionId
      && participation.university_id === inviteUniversityId
      && participation.participation_status === 'declined')
    const invitationUpdate = {
      participation_status: 'invited',
      invited_by: session.user.id,
      invited_at: new Date().toISOString(),
      responded_at: null,
    }
    const { error: inviteError } = declinedInvitation
      ? await supabase.from('competition_participants').update(invitationUpdate)
        .eq('competition_id', hostCompetitionId).eq('university_id', inviteUniversityId)
      : await supabase.from('competition_participants').insert({
        competition_id: hostCompetitionId,
        university_id: inviteUniversityId,
        invited_by: session.user.id,
      })
    setBusy(false)
    if (inviteError) {
      setError(inviteError.code === '23505' ? 'That university has already been invited to this competition.' : `Invitation could not be sent: ${inviteError.message}`)
      return
    }
    setInviteUniversityId('')
    setNotice('Invitation sent. The invited university can accept it in their secretary portal.')
    await load()
  }

  async function respondToInvitation(participation: Participation, accepted: boolean) {
    if (!supabase) return
    setBusy(true)
    setError('')
    setNotice('')
    const { error: responseError } = await supabase.from('competition_participants').update({
      participation_status: accepted ? 'accepted' : 'declined',
      responded_at: new Date().toISOString(),
    }).eq('competition_id', participation.competition_id).eq('university_id', participation.university_id)
    setBusy(false)
    if (responseError) {
      setError(`Invitation response could not be saved: ${responseError.message}`)
      return
    }
    setNotice(accepted ? 'Invitation accepted. Choose a team below to enter the competition.' : 'Invitation declined.')
    await load()
  }

  async function registerTeam(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || !universityId || !entryCompetitionId || !entryTeamId) return
    setBusy(true)
    setError('')
    setNotice('')
    const { error: registrationError } = await supabase.from('competition_teams').upsert({
      competition_id: entryCompetitionId,
      team_id: entryTeamId,
      university_id: universityId,
    }, { onConflict: 'competition_id,team_id' })
    setBusy(false)
    if (registrationError) {
      setError(registrationError.message.includes('academic year')
        ? 'This class team can only enter players from its own academic year. Review its roster first.'
        : `Team could not be entered: ${registrationError.message}`)
      return
    }
    setEntryTeamId('')
    setNotice('Team entered. Its university secretary manages the roster and matchday squad.')
    await load()
  }

  return (
    <section className="secretary-record-page slp-page">
      <div className="secretary-heading">
        <div><span className="eyebrow">UNIVERSITY LEAGUE WORKSPACE</span><h1>Leagues &amp; invitations</h1><p>Organize a university competition or manage invitations your university has received.</p></div>
      </div>
      {error && <div className="inline-notice notice-error" role="alert">{error}</div>}
      {notice && <div className="inline-notice notice-success" role="status">{notice}</div>}

      {loading ? <section className="secretary-panel slp-empty">Loading your university league workspace…</section> : (
        <>
          <div className="slp-summary">
            <div><Trophy size={17} /><span><strong>{hostedCompetitions.length}</strong><small>Organized by your university</small></span></div>
            <div><MailPlus size={17} /><span><strong>{invitations.length}</strong><small>Invitations to review</small></span></div>
            <div><Users size={17} /><span><strong>{acceptedParticipations.length}</strong><small>Competitions accepted</small></span></div>
          </div>

          <div className="slp-columns">
            <section className="secretary-panel slp-panel">
              <div className="secretary-panel-heading"><div><span className="eyebrow">ORGANIZER</span><h2>Invite a university</h2></div><Building2 size={18} /></div>
              <p className="slp-help">You organize a competition. Invite a college or university; its own secretary accepts and enters its team.</p>
              {hostedCompetitions.length ? (
                <form className="secretary-record-form slp-form" onSubmit={(event) => void inviteUniversity(event)}>
                  <label className="secretary-field">Your competition<select required value={hostCompetitionId} onChange={(event) => setHostCompetitionId(event.target.value)}><option value="">Choose competition</option>{hostedCompetitions.map((competition) => <option key={competition.id} value={competition.id}>{competition.name} · {competition.season}</option>)}</select></label>
                  <label className="secretary-field">University to invite<select required value={inviteUniversityId} onChange={(event) => setInviteUniversityId(event.target.value)}><option value="">Choose university</option>{availableUniversities.map((university) => <option key={university.id} value={university.id}>{university.name}</option>)}</select></label>
                  <button className="button button-primary" type="submit" disabled={busy || !inviteUniversityId}><MailPlus size={15} />Send invitation</button>
                </form>
              ) : <div className="slp-empty-inline"><Trophy size={19} /><span>Create your competition first. You can then invite participating universities.</span><Link to="/secretary/competitions">Create competition <ArrowRight size={13} /></Link></div>}
              {hostedCompetitions.map((competition) => {
                const guests = participations.filter((row) => row.competition_id === competition.id && row.university_id !== universityId)
                const competitionEntries = entries.filter((entry) => entry.competition_id === competition.id)
                return <div className="slp-hosted-row" key={competition.id}>
                  <strong>{competition.name}<small>{competition.season}</small></strong>
                  <span>{competitionEntries.length} teams entered</span>
                  <div className="slp-guest-list">
                    {guests.map((guest) => {
                      const universityEntries = competitionEntries.filter((entry) => entry.university_id === guest.university_id)
                      return <span key={guest.university_id}>
                        <span>{universitiesById[guest.university_id]?.name ?? 'University'}{universityEntries.length ? ` · ${universityEntries.map((entry) => teamsById(allEntryTeams, entry.team_id)).join(', ')}` : ''}</span>
                        <i className={`slp-status slp-status-${guest.participation_status}`}>{guest.participation_status}</i>
                      </span>
                    })}
                    {!guests.length && <small>No universities invited yet.</small>}
                  </div>
                </div>
              })}
            </section>

            <section className="secretary-panel slp-panel">
              <div className="secretary-panel-heading"><div><span className="eyebrow">YOUR UNIVERSITY</span><h2>Invitations received</h2></div><MailPlus size={18} /></div>
              <p className="slp-help">Accepting an invitation lets your university register one or more of its own teams.</p>
              {invitations.length ? invitations.map((invitation) => {
                const competition = competitionsById[invitation.competition_id]
                return <div className="slp-invitation" key={invitation.competition_id}>
                  <span className="slp-invitation-icon"><Trophy size={17} /></span>
                  <div><strong>{competition?.name ?? 'Competition invitation'}</strong><small>{universitiesById[competition?.university_id ?? '']?.name ?? 'Organizer'} · {competition?.season ?? ''}</small></div>
                  <div className="slp-invitation-actions">
                    <button className="button button-primary" type="button" disabled={busy} onClick={() => void respondToInvitation(invitation, true)}>Accept</button>
                    <button className="button button-secondary" type="button" disabled={busy} onClick={() => void respondToInvitation(invitation, false)}>Decline</button>
                  </div>
                </div>
              }) : <div className="slp-empty-inline"><CircleHelp size={19} /><span>No pending invitations. Accepted competitions and team entries appear below.</span></div>}
            </section>
          </div>

          <section className="secretary-panel slp-panel slp-entries">
            <div className="secretary-panel-heading"><div><span className="eyebrow">PARTICIPANT TEAMS</span><h2>Enter a team in an accepted competition</h2></div><Users size={18} /></div>
            <p className="slp-help">Your university retains ownership of all player profiles, team selection, and match squads. Class team eligibility is checked against each player’s academic year.</p>
            {acceptedParticipations.length ? (
              <form className="slp-entry-form" onSubmit={(event) => void registerTeam(event)}>
                <label className="secretary-field">Accepted competition<select value={entryCompetitionId} onChange={(event) => { setEntryCompetitionId(event.target.value); setEntryTeamId('') }} required><option value="">Choose competition</option>{acceptedParticipations.map((participation) => {
                  const competition = competitionsById[participation.competition_id]
                  return <option key={participation.competition_id} value={participation.competition_id}>{competition?.name ?? 'Competition'} · {competition?.season ?? ''}</option>
                })}</select></label>
                <label className="secretary-field">Team to enter<select value={entryTeamId} onChange={(event) => setEntryTeamId(event.target.value)} required><option value="">Choose your team</option>{eligibleTeams.map((team) => <option key={team.id} value={team.id}>{team.name}{team.type === 'class_team' ? ` · ${team.academic_class ?? 'Class team'}` : ' · University team'}</option>)}</select></label>
                <button className="button button-primary" type="submit" disabled={busy || !eligibleTeams.length}>Enter team</button>
              </form>
            ) : <div className="slp-empty-inline"><Building2 size={19} /><span>Accept an invitation before entering your university team.</span></div>}
            {selectedCompetition && (
              <div className="slp-entry-list">
                <h3>Teams entered in {selectedCompetition.name}</h3>
                {selectedCompetitionEntries.length ? selectedCompetitionEntries.map((entry) => <span key={entry.team_id}>{teamsById(allEntryTeams, entry.team_id)}<small>{universitiesById[entry.university_id]?.name ?? 'University'}</small></span>) : <p>No teams entered yet.</p>}
              </div>
            )}
          </section>
        </>
      )}
    </section>
  )
}

function teamsById(teams: Team[], teamId: string) {
  return teams.find((team) => team.id === teamId)?.name ?? 'Team'
}
