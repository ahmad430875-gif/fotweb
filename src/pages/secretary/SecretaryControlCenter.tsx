import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { AlertTriangle, CalendarDays, Check, ClipboardList, LockKeyhole, ShieldAlert, ShieldCheck, UnlockKeyhole, Users } from 'lucide-react'
import { useAuth } from '../../auth/AuthProvider'
import { supabase } from '../../lib/supabase'
import { InstitutionalEligibilityCheck } from './InstitutionalEligibilityCheck'
import { TournamentBracketView, type BracketFixture, type BracketRound } from './TournamentBracketView'
import './SecretaryControlCenter.css'

type Competition = { id: string; name: string; season: string }
type Team = { id: string; name: string }
type Player = { id: string; full_name: string; batch_session: string | null; is_active: boolean }
type Stage = { id: string; name: string; stage_type: 'group' | 'knockout' | 'league'; sequence_order: number }
type Round = { id: string; name: string; round_number: number; stage_id: string }
type Match = BracketFixture & { round_id: string }
type MatchCard = { id: string; player_id: string; match_id: string; card_type: 'yellow' | 'red'; issued_at: string; suspension_served_at: string | null }
type SquadLock = { id: string; team_id: string; competition_id: string; is_locked: boolean; locked_at: string | null }
type MatchOfficials = { id: string; match_id: string; referee_name: string | null; venue_supervisor: string | null }

function currentTimestamp() {
  return new Date().toISOString()
}

export function SecretaryControlCenter() {
  const { profile, session } = useAuth()
  const universityId = profile?.university_id
  const [competitions, setCompetitions] = useState<Competition[]>([])
  const [competitionId, setCompetitionId] = useState('')
  const [teams, setTeams] = useState<Team[]>([])
  const [players, setPlayers] = useState<Player[]>([])
  const [stages, setStages] = useState<Stage[]>([])
  const [rounds, setRounds] = useState<Round[]>([])
  const [matches, setMatches] = useState<Match[]>([])
  const [cards, setCards] = useState<MatchCard[]>([])
  const [locks, setLocks] = useState<SquadLock[]>([])
  const [officials, setOfficials] = useState<MatchOfficials[]>([])
  const [selectedStageId, setSelectedStageId] = useState('')
  const [selectedRoundId, setSelectedRoundId] = useState('')
  const [selectedTeamId, setSelectedTeamId] = useState('')
  const [selectedPlayerId, setSelectedPlayerId] = useState('')
  const [selectedMatchId, setSelectedMatchId] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const competition = competitions.find((row) => row.id === competitionId)
  const selectedMatch = matches.find((row) => row.id === selectedMatchId) ?? null
  const selectedStage = stages.find((row) => row.id === selectedStageId)
  const availableRounds = rounds.filter((row) => row.stage_id === selectedStageId)
  const teamNames = useMemo(() => Object.fromEntries(teams.map((team) => [team.id, team.name])), [teams])
  const playerNames = useMemo(() => Object.fromEntries(players.map((player) => [player.id, player.full_name])), [players])
  const matchNames = useMemo(() => Object.fromEntries(matches.map((match) => [match.id, `${teamNames[match.home_team_id] ?? 'Home'} vs ${teamNames[match.away_team_id] ?? 'Away'}`])), [matches, teamNames])
  const bracketRounds = useMemo<BracketRound[]>(() => rounds
    .filter((round) => selectedStage?.id === round.stage_id)
    .map((round) => ({
      ...round,
      fixtures: matches.filter((match) => match.round_id === round.id),
    })), [matches, rounds, selectedStage])
  const activeLock = locks.find((lock) => lock.team_id === selectedTeamId && lock.competition_id === competitionId)
  const selectedOfficials = officials.find((official) => official.match_id === selectedMatchId)

  useEffect(() => {
    let active = true
    async function loadCompetitions() {
      if (!supabase || !universityId) {
        setLoading(false)
        return
      }
      setLoading(true)
      const { data, error: loadError } = await supabase
        .from('competitions')
        .select('id, name, season')
        .eq('university_id', universityId)
        .order('start_date', { ascending: false })
      if (!active) return
      if (loadError) {
        setError(`Competitions could not be loaded: ${loadError.message}`)
      } else {
        const rows = (data ?? []) as Competition[]
        setCompetitions(rows)
        setCompetitionId((current) => rows.some((row) => row.id === current) ? current : rows[0]?.id ?? '')
      }
      setLoading(false)
    }
    void loadCompetitions()
    return () => { active = false }
  }, [universityId])

  useEffect(() => {
    let active = true
    async function loadCompetitionData() {
      if (!supabase || !competitionId || !universityId) {
        setStages([])
        setRounds([])
        setMatches([])
        setTeams([])
        setPlayers([])
        setCards([])
        setLocks([])
        setOfficials([])
        return
      }
      setError('')
      const results = await Promise.all([
        supabase.from('tournament_stages').select('id, name, stage_type, sequence_order').eq('competition_id', competitionId).order('sequence_order'),
        supabase.from('match_brackets').select('id, round_id, home_team_id, away_team_id, home_score, away_score, match_status, winner_team_id, match_date, next_match_id, venue').eq('competition_id', competitionId).order('match_date'),
        supabase.from('competition_teams').select('team_id').eq('competition_id', competitionId),
        supabase.from('player_registrations').select('player_id').eq('competition_id', competitionId).is('released_at', null),
        supabase.from('match_cards').select('id, player_id, match_id, card_type, issued_at, suspension_served_at').eq('competition_id', competitionId).order('issued_at', { ascending: false }),
        supabase.from('squad_locks').select('id, team_id, competition_id, is_locked, locked_at').eq('competition_id', competitionId),
      ])
      const failure = results.find((result) => result.error)
      if (failure?.error) {
        if (active) setError(`Tournament data could not be loaded: ${failure.error.message}. Apply the institutional tournament control migration if these tables are missing.`)
        return
      }

      const stageRows = (results[0].data ?? []) as Stage[]
      const fixtureRows = (results[1].data ?? []) as Match[]
      const teamIds = [...new Set((results[2].data ?? []).map((row) => row.team_id))]
      const playerIds = [...new Set((results[3].data ?? []).map((row) => row.player_id))]
      const matchIds = fixtureRows.map((row) => row.id)
      const [roundResult, teamResult, playerResult, officialsResult] = await Promise.all([
        stageRows.length
          ? supabase.from('tournament_rounds').select('id, name, round_number, stage_id').in('stage_id', stageRows.map((row) => row.id)).order('round_number')
          : Promise.resolve({ data: [], error: null }),
        teamIds.length
          ? supabase.from('teams').select('id, name').in('id', teamIds).order('name')
          : Promise.resolve({ data: [], error: null }),
        playerIds.length
          ? supabase.from('players').select('id, full_name, batch_session, is_active').in('id', playerIds).eq('university_id', universityId).order('full_name')
          : Promise.resolve({ data: [], error: null }),
        matchIds.length
          ? supabase.from('match_officials').select('id, match_id, referee_name, venue_supervisor').in('match_id', matchIds)
          : Promise.resolve({ data: [], error: null }),
      ])
      const childFailure = [roundResult, teamResult, playerResult, officialsResult].find((result) => result.error)
      if (childFailure?.error) {
        if (active) setError(`Tournament details could not be loaded: ${childFailure.error.message}`)
        return
      }
      if (!active) return

      const roundRows = (roundResult.data ?? []) as Round[]
      setStages(stageRows)
      setRounds(roundRows)
      setMatches(fixtureRows)
      setTeams((teamResult.data ?? []) as Team[])
      setPlayers((playerResult.data ?? []) as Player[])
      setCards((results[4].data ?? []) as MatchCard[])
      setLocks((results[5].data ?? []) as SquadLock[])
      setOfficials((officialsResult.data ?? []) as MatchOfficials[])
      setSelectedStageId((current) => stageRows.some((row) => row.id === current) ? current : stageRows[0]?.id ?? '')
      setSelectedTeamId((current) => teamIds.includes(current) ? current : teamIds[0] ?? '')
      setSelectedPlayerId((current) => playerIds.includes(current) ? current : playerIds[0] ?? '')
      setSelectedMatchId((current) => fixtureRows.some((row) => row.id === current) ? current : fixtureRows[0]?.id ?? '')
      setSelectedRoundId((current) => roundRows.some((row) => row.id === current) ? current : roundRows[0]?.id ?? '')
    }
    void loadCompetitionData()
    return () => { active = false }
  }, [competitionId, universityId, refreshKey])

  async function runAction(action: () => Promise<{ error: { message: string } | null }>, successMessage: string) {
    setBusy(true)
    setError('')
    setNotice('')
    const result = await action()
    setBusy(false)
    if (result.error) {
      setError(result.error.message)
      return false
    }
    setNotice(successMessage)
    setRefreshKey((key) => key + 1)
    return true
  }

  async function createStage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || !competitionId) return
    const client = supabase
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    const name = String(form.get('stage-name') ?? '').trim()
    const sequence = Number(form.get('stage-order'))
    const stageType = String(form.get('stage-type') ?? 'group')
    if (!name || !Number.isInteger(sequence) || sequence < 1) {
      setError('Enter a stage name and a positive sequence number.')
      return
    }
    if (await runAction(async () => await client.from('tournament_stages').insert({
      competition_id: competitionId,
      name,
      sequence_order: sequence,
      stage_type: stageType,
    }), 'Tournament stage created.')) formElement.reset()
  }

  async function createRound(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || !selectedStageId) return
    const client = supabase
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    const name = String(form.get('round-name') ?? '').trim()
    const number = Number(form.get('round-number'))
    if (!name || !Number.isInteger(number) || number < 1) {
      setError('Enter a round name and a positive round number.')
      return
    }
    if (await runAction(async () => await client.from('tournament_rounds').insert({ stage_id: selectedStageId, name, round_number: number }), 'Tournament round created.')) formElement.reset()
  }

  async function createFixture(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || !competitionId || !selectedRoundId) return
    const client = supabase
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    const homeTeamId = String(form.get('home-team') ?? '')
    const awayTeamId = String(form.get('away-team') ?? '')
    if (!homeTeamId || !awayTeamId || homeTeamId === awayTeamId) {
      setError('Choose two different teams for the fixture.')
      return
    }
    const kickoff = String(form.get('fixture-date') ?? '')
    if (await runAction(async () => await client.from('match_brackets').insert({
      competition_id: competitionId,
      round_id: selectedRoundId,
      home_team_id: homeTeamId,
      away_team_id: awayTeamId,
      match_date: kickoff ? new Date(kickoff).toISOString() : null,
    }), 'Fixture added to the bracket.')) formElement.reset()
  }

  async function toggleSquadLock() {
    if (!supabase || !competitionId || !selectedTeamId || !session?.user.id) return
    const client = supabase
    const isLocked = !activeLock?.is_locked
    await runAction(async () => await client.from('squad_locks').upsert({
      team_id: selectedTeamId,
      competition_id: competitionId,
      is_locked: isLocked,
      locked_at: isLocked ? currentTimestamp() : null,
      locked_by: isLocked ? session.user.id : null,
    }, { onConflict: 'team_id,competition_id' }), isLocked ? 'Squad announcements locked for this competition.' : 'Squad announcements unlocked.')
  }

  async function logCard(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || !competitionId) return
    const client = supabase
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    const playerId = String(form.get('card-player') ?? '')
    const matchId = String(form.get('card-match') ?? '')
    const cardType = String(form.get('card-type') ?? '')
    if (!playerId || !matchId || !['yellow', 'red'].includes(cardType)) {
      setError('Choose a registered player, fixture, and card type.')
      return
    }
    if (await runAction(async () => await client.from('match_cards').insert({
      player_id: playerId,
      match_id: matchId,
      competition_id: competitionId,
      card_type: cardType,
    }), cardType === 'red' ? 'Red card logged; eligibility is blocked until the suspension is served.' : 'Yellow card logged.')) formElement.reset()
  }

  async function markSuspensionServed(cardId: string) {
    if (!supabase) return
    const client = supabase
    await runAction(async () => await client.from('match_cards').update({ suspension_served_at: currentTimestamp() }).eq('id', cardId), 'Red-card suspension marked as served.')
  }

  async function saveFixture(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || !selectedMatch) return
    const client = supabase
    const form = new FormData(event.currentTarget)
    const homeScore = Number(form.get('home-score'))
    const awayScore = Number(form.get('away-score'))
    const winner = String(form.get('winner-team') ?? '') || null
    if (!Number.isInteger(homeScore) || homeScore < 0 || !Number.isInteger(awayScore) || awayScore < 0) {
      setError('Scores must be zero or a positive whole number.')
      return
    }
    const date = String(form.get('match-date') ?? '')
    await runAction(async () => await client.from('match_brackets').update({
      home_score: homeScore,
      away_score: awayScore,
      match_status: String(form.get('match-status') ?? 'scheduled'),
      winner_team_id: winner,
      venue: String(form.get('match-venue') ?? '').trim() || null,
      match_date: date ? new Date(date).toISOString() : null,
      next_match_id: String(form.get('next-match') ?? '') || null,
    }).eq('id', selectedMatch.id), 'Fixture details updated.')
  }

  async function saveOfficials(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || !selectedMatch) return
    const client = supabase
    const form = new FormData(event.currentTarget)
    await runAction(async () => await client.from('match_officials').upsert({
      match_id: selectedMatch.id,
      referee_name: String(form.get('referee-name') ?? '').trim() || null,
      venue_supervisor: String(form.get('venue-supervisor') ?? '').trim() || null,
    }, { onConflict: 'match_id' }), 'Match officials assigned.')
  }

  return (
    <section className="tcc-page">
      <div className="secretary-heading">
        <div>
          <span className="eyebrow">COMPETITION OPERATIONS</span>
          <h1>Institutional Control Center</h1>
          <p>Build tournament brackets, protect matchday squads, and manage eligibility and officials.</p>
        </div>
      </div>

      {error && <div className="tcc-banner tcc-banner-error" role="alert"><AlertTriangle size={16} />{error}</div>}
      {notice && <div className="tcc-banner tcc-banner-success" role="status"><Check size={16} />{notice}</div>}

      <div className="tcc-panel tcc-competition-bar">
        <label className="tcc-field">
          Competition
          <select value={competitionId} onChange={(event) => setCompetitionId(event.target.value)} disabled={loading}>
            <option value="">Select competition</option>
            {competitions.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.season}</option>)}
          </select>
        </label>
        <span>{competition ? `${stages.length} stages · ${matches.length} fixtures` : 'Select a university competition to begin.'}</span>
      </div>

      {loading ? <div className="tcc-panel tcc-loading">Loading tournament control data…</div> : !competition ? (
        <div className="tcc-panel tcc-empty-state"><ClipboardList size={23} /><strong>No competition selected</strong><span>Create a competition in the Competitions workspace, then return here.</span></div>
      ) : (
        <>
          <div className="tcc-layout">
            <div className="tcc-main-column">
              <section className="tcc-panel">
                <div className="tcc-panel-title"><div><span className="eyebrow">TOURNAMENT STRUCTURE</span><h2>Stages &amp; rounds</h2></div><CalendarDays size={18} /></div>
                <div className="tcc-structure">
                  <form className="tcc-form" onSubmit={(event) => void createStage(event)}>
                    <label className="tcc-field">Stage name<input name="stage-name" required minLength={2} placeholder="e.g. Group Stage" /></label>
                    <div className="tcc-form-row">
                      <label className="tcc-field">Stage type<select name="stage-type"><option value="group">Group</option><option value="knockout">Knockout</option><option value="league">League</option></select></label>
                      <label className="tcc-field">Order<input name="stage-order" type="number" min="1" required defaultValue={stages.length + 1} /></label>
                    </div>
                    <button className="button button-primary" disabled={busy}>Add stage</button>
                  </form>
                  <form className="tcc-form" onSubmit={(event) => void createRound(event)}>
                    <label className="tcc-field">Stage<select value={selectedStageId} onChange={(event) => { setSelectedStageId(event.target.value); setSelectedRoundId(rounds.find((round) => round.stage_id === event.target.value)?.id ?? '') }} required><option value="">Select stage</option>{stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.sequence_order}. {stage.name}</option>)}</select></label>
                    <div className="tcc-form-row">
                      <label className="tcc-field">Round name<input name="round-name" required minLength={2} placeholder="e.g. Semi-final" /></label>
                      <label className="tcc-field">Number<input name="round-number" type="number" min="1" required defaultValue={availableRounds.length + 1} /></label>
                    </div>
                    <button className="button button-primary" disabled={busy || !selectedStageId}>Add round</button>
                  </form>
                </div>
              </section>

              <section className="tcc-panel">
                <div className="tcc-panel-title"><div><span className="eyebrow">FIXTURE MANAGEMENT</span><h2>Bracket &amp; progression</h2></div><Users size={18} /></div>
                <div className="tcc-bracket-toolbar">
                  <label className="tcc-field">Stage to display<select value={selectedStageId} onChange={(event) => { setSelectedStageId(event.target.value); setSelectedRoundId(rounds.find((round) => round.stage_id === event.target.value)?.id ?? '') }}><option value="">Select stage</option>{stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}</select></label>
                </div>
                <TournamentBracketView rounds={bracketRounds} teamNames={teamNames} fixtureNames={matchNames} onSelectFixture={setSelectedMatchId} />
                <form className="tcc-form tcc-fixture-create" onSubmit={(event) => void createFixture(event)}>
                  <h3>Add a fixture</h3>
                  <div className="tcc-fixture-form-grid">
                    <label className="tcc-field">Round<select value={selectedRoundId} onChange={(event) => setSelectedRoundId(event.target.value)} required><option value="">Select round</option>{rounds.map((round) => <option key={round.id} value={round.id}>{stages.find((stage) => stage.id === round.stage_id)?.name} · {round.name}</option>)}</select></label>
                    <label className="tcc-field">Home team<select name="home-team" required><option value="">Select team</option>{teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label>
                    <label className="tcc-field">Away team<select name="away-team" required><option value="">Select team</option>{teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label>
                    <label className="tcc-field">Kick-off<input name="fixture-date" type="datetime-local" /></label>
                  </div>
                  <button className="button button-primary" disabled={busy || !selectedRoundId}>Create fixture</button>
                </form>

                {selectedMatch && (
                  <div className="tcc-match-editor">
                    <div className="tcc-editor-heading"><div><span className="eyebrow">SELECTED FIXTURE</span><h3>{matchNames[selectedMatch.id]}</h3></div><span className="tcc-status-pill">{selectedMatch.match_status.replaceAll('_', ' ')}</span></div>
                    <form className="tcc-form" onSubmit={(event) => void saveFixture(event)}>
                      <div className="tcc-editor-grid">
                        <label className="tcc-field">{teamNames[selectedMatch.home_team_id] ?? 'Home'} score<input name="home-score" type="number" min="0" required defaultValue={selectedMatch.home_score} /></label>
                        <label className="tcc-field">{teamNames[selectedMatch.away_team_id] ?? 'Away'} score<input name="away-score" type="number" min="0" required defaultValue={selectedMatch.away_score} /></label>
                        <label className="tcc-field">Match status<select name="match-status" defaultValue={selectedMatch.match_status}>{['scheduled', 'warm_up', 'live', 'half_time', 'full_time', 'postponed', 'cancelled'].map((status) => <option key={status} value={status}>{status.replaceAll('_', ' ')}</option>)}</select></label>
                        <label className="tcc-field">Winner (optional)<select name="winner-team" defaultValue={selectedMatch.winner_team_id ?? ''}><option value="">No winner selected</option><option value={selectedMatch.home_team_id}>{teamNames[selectedMatch.home_team_id]}</option><option value={selectedMatch.away_team_id}>{teamNames[selectedMatch.away_team_id]}</option></select></label>
                        <label className="tcc-field">Venue<input name="match-venue" defaultValue={selectedMatch.venue ?? ''} placeholder="Stadium / court" /></label>
                        <label className="tcc-field">Kick-off<input name="match-date" type="datetime-local" defaultValue={selectedMatch.match_date ? new Date(selectedMatch.match_date).toISOString().slice(0, 16) : ''} /></label>
                        <label className="tcc-field tcc-field-wide">Progression fixture<select name="next-match" defaultValue={selectedMatch.next_match_id ?? ''}><option value="">No progression link</option>{matches.filter((match) => match.id !== selectedMatch.id).map((match) => <option key={match.id} value={match.id}>{matchNames[match.id]}</option>)}</select></label>
                      </div>
                      <button className="button button-primary" disabled={busy}>Save fixture</button>
                    </form>

                    <form className="tcc-form tcc-official-form" onSubmit={(event) => void saveOfficials(event)}>
                      <h3>Venue &amp; match officials</h3>
                      <div className="tcc-editor-grid">
                        <label className="tcc-field">Referee<input name="referee-name" defaultValue={selectedOfficials?.referee_name ?? ''} placeholder="Official's name" /></label>
                        <label className="tcc-field">Venue supervisor<input name="venue-supervisor" defaultValue={selectedOfficials?.venue_supervisor ?? ''} placeholder="Supervisor's name" /></label>
                      </div>
                      <button className="button button-secondary" disabled={busy}>Save officials</button>
                    </form>
                  </div>
                )}
              </section>
            </div>

            <aside className="tcc-side-column">
              <section className="tcc-panel">
                <div className="tcc-panel-title"><div><span className="eyebrow">MATCHDAY ROSTER</span><h2>Squad announcement lock</h2></div><LockKeyhole size={18} /></div>
                <div className="tcc-form">
                  <label className="tcc-field">Registered team<select value={selectedTeamId} onChange={(event) => setSelectedTeamId(event.target.value)}><option value="">Select team</option>{teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label>
                  {selectedTeamId ? (
                    <div className={`tcc-lock-state ${activeLock?.is_locked ? 'tcc-lock-on' : ''}`}>
                      {activeLock?.is_locked ? <LockKeyhole size={18} /> : <UnlockKeyhole size={18} />}
                      <div><strong>{activeLock?.is_locked ? 'Announcements locked' : 'Announcements unlocked'}</strong><span>{activeLock?.is_locked ? 'Captains and starting XI are protected from edits.' : 'Secretaries can still edit this team’s matchday squad.'}</span></div>
                    </div>
                  ) : <p className="tcc-helper">Register teams to this competition to manage their squad locks.</p>}
                  <button className={`button ${activeLock?.is_locked ? 'button-secondary' : 'button-primary'}`} type="button" disabled={busy || !selectedTeamId} onClick={() => void toggleSquadLock()}>
                    {activeLock?.is_locked ? <UnlockKeyhole size={15} /> : <LockKeyhole size={15} />}
                    {activeLock?.is_locked ? 'Unlock squad announcements' : 'Lock squad announcements'}
                  </button>
                  <p className="tcc-helper">A locked squad cannot be published, edited, or withdrawn until it is unlocked. Apply the database migration to enforce this at the database level.</p>
                </div>
              </section>

              <section className="tcc-panel">
                <div className="tcc-panel-title"><div><span className="eyebrow">DISCIPLINARY CONTROL</span><h2>Player eligibility</h2></div><ShieldCheck size={18} /></div>
                <form className="tcc-form" onSubmit={(event) => void logCard(event)}>
                  <label className="tcc-field">Registered player<select name="card-player" value={selectedPlayerId} onChange={(event) => setSelectedPlayerId(event.target.value)} required><option value="">Select player</option>{players.map((player) => <option key={player.id} value={player.id}>{player.full_name}{player.batch_session ? ` · ${player.batch_session}` : ''}</option>)}</select></label>
                  <label className="tcc-field">Fixture<select name="card-match" required><option value="">Select fixture</option>{matches.map((match) => <option key={match.id} value={match.id}>{matchNames[match.id]}</option>)}</select></label>
                  <label className="tcc-field">Card type<select name="card-type" defaultValue="yellow"><option value="yellow">Yellow card</option><option value="red">Red card — activates suspension</option></select></label>
                  <button className="button button-primary" disabled={busy || !players.length || !matches.length}><ShieldAlert size={15} />Log disciplinary card</button>
                </form>
                <div className="tcc-eligibility-wrap">
                  <InstitutionalEligibilityCheck playerId={selectedPlayerId} competitionId={competitionId} refreshKey={refreshKey} />
                </div>
                <div className="tcc-card-list">
                  <h3><ShieldAlert size={15} />Red-card suspensions</h3>
                  {cards.filter((card) => card.card_type === 'red').length ? cards.filter((card) => card.card_type === 'red').map((card) => (
                    <div className="tcc-card-row" key={card.id}>
                      <span className={`tcc-card-indicator ${card.suspension_served_at ? 'tcc-card-served' : ''}`} />
                      <div><strong>{playerNames[card.player_id] ?? 'Registered player'}</strong><span>{card.suspension_served_at ? 'Served' : 'Active suspension'} · {new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(card.issued_at))}</span></div>
                      {!card.suspension_served_at && <button type="button" className="tcc-serve-button" disabled={busy} onClick={() => void markSuspensionServed(card.id)}>Mark served</button>}
                    </div>
                  )) : <p className="tcc-helper">No red cards recorded for this competition.</p>}
                </div>
                <div className="tcc-note"><AlertTriangle size={14} /><span>Eligibility requires an active player profile, active competition registration, a recorded batch/session, and no unserved red card.</span></div>
              </section>
            </aside>
          </div>
        </>
      )}
    </section>
  )
}
