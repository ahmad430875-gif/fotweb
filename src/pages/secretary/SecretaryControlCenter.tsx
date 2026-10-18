import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { AlertTriangle, ArrowLeft, ArrowRight, CalendarDays, Check, ClipboardList, ClipboardPenLine, Flag, LockKeyhole, ShieldAlert, ShieldCheck, UnlockKeyhole, Users, type LucideIcon } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../../auth/AuthProvider'
import { universityPortalPath, useUniversityScope } from '../../auth/useUniversityScope'
import { supabase } from '../../lib/supabase'
import { InstitutionalEligibilityCheck } from './InstitutionalEligibilityCheck'
import { TournamentBracketView, type BracketFixture, type BracketRound } from './TournamentBracketView'
import './SecretaryControlCenter.css'

type Competition = { id: string; name: string; season: string; ended_at: string | null; qualifiers_per_group: number; knockout_published: boolean }
type Team = { id: string; name: string; group_name: string | null }
type GroupStanding = {
  position: number
  competition_id: string
  group_name: string
  team_id: string
  team_name: string
  played: number
  wins: number
  draws: number
  losses: number
  goals_for: number
  goals_against: number
  goal_difference: number
  points: number
  qualified: boolean
}
type Player = { id: string; full_name: string; batch_session: string | null; is_active: boolean }
type Stage = { id: string; name: string; stage_type: 'group' | 'knockout' | 'league'; sequence_order: number }
type Round = { id: string; name: string; round_number: number; stage_id: string }
type Match = BracketFixture & { round_id: string }
type MatchCard = { id: string; player_id: string; match_id: string; card_type: 'yellow' | 'red'; issued_at: string; suspension_served_at: string | null }
type SquadLock = { id: string; team_id: string; competition_id: string; is_locked: boolean; locked_at: string | null }
type MatchOfficials = { id: string; match_id: string; referee_name: string | null; venue_supervisor: string | null }
type ControlStep = { id: string; title: string; shortTitle: string; description: string; icon: LucideIcon }

const controlSteps: ControlStep[] = [
  { id: 'structure', title: 'Tournament structure', shortTitle: 'Structure', description: 'Create tournament stages and their rounds.', icon: CalendarDays },
  { id: 'bracket', title: 'Fixtures & bracket', shortTitle: 'Fixtures', description: 'Schedule teams, update results, and link progression.', icon: Flag },
  { id: 'squads', title: 'Squad announcements', shortTitle: 'Squads', description: 'Lock or unlock team announcements for matchday.', icon: LockKeyhole },
  { id: 'discipline', title: 'Discipline & eligibility', shortTitle: 'Discipline', description: 'Record cards, check eligibility, and clear served suspensions.', icon: ShieldCheck },
  { id: 'officials', title: 'Venue & officials', shortTitle: 'Officials', description: 'Assign fixture venues, referees, and supervisors.', icon: ClipboardPenLine },
]

function currentTimestamp() {
  return new Date().toISOString()
}

export function SecretaryControlCenter() {
  const { profile, session } = useAuth()
  const scope = useUniversityScope()
  const location = useLocation()
  const currentView = location.pathname.split('/').filter(Boolean).at(-1) ?? 'control-center'
  const activeStepIndex = controlSteps.findIndex((step) => step.id === currentView)
  const activeStep = controlSteps[activeStepIndex]
  const portalBasePath = scope?.basePath ?? '/secretary'
  const controlBasePath = universityPortalPath(portalBasePath, '/control-center')
  const universityId = scope?.universityId ?? profile?.university_id
  const [competitions, setCompetitions] = useState<Competition[]>([])
  const [competitionId, setCompetitionId] = useState('')
  const [qualifiersPerGroupDraft, setQualifiersPerGroupDraft] = useState(4)
  const [teams, setTeams] = useState<Team[]>([])
  const [players, setPlayers] = useState<Player[]>([])
  const [stages, setStages] = useState<Stage[]>([])
  const [rounds, setRounds] = useState<Round[]>([])
  const [matches, setMatches] = useState<Match[]>([])
  const [groupStandings, setGroupStandings] = useState<GroupStanding[]>([])
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
  const groupTables = useMemo(() => groupStandings.reduce<Record<string, GroupStanding[]>>((groups, row) => {
    ;(groups[row.group_name] ??= []).push(row)
    return groups
  }, {}), [groupStandings])
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
        .select('id, name, season, ended_at, qualifiers_per_group, knockout_published')
        .eq('university_id', universityId)
        .order('start_date', { ascending: false })
      if (!active) return
      if (loadError) {
        setError(loadError.message.includes('competitions.ended_at')
          ? 'Tournament lifecycle fields are missing from Supabase. From the updated repository, run `npx supabase db push`, then refresh this page.'
          : `Competitions could not be loaded: ${loadError.message}`)
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
    setQualifiersPerGroupDraft(competitions.find((row) => row.id === competitionId)?.qualifiers_per_group ?? 4)
  }, [competitionId, competitions])

  useEffect(() => {
    let active = true
    async function loadCompetitionData() {
      if (!supabase || !competitionId || !universityId) {
        setStages([])
        setRounds([])
        setMatches([])
        setGroupStandings([])
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
        supabase.from('competition_teams').select('team_id, group_name').eq('competition_id', competitionId),
        supabase.from('player_registrations').select('player_id').eq('competition_id', competitionId).is('released_at', null),
        supabase.from('match_cards').select('id, player_id, match_id, card_type, issued_at, suspension_served_at').eq('competition_id', competitionId).order('issued_at', { ascending: false }),
        supabase.from('squad_locks').select('id, team_id, competition_id, is_locked, locked_at').eq('competition_id', competitionId),
        supabase.from('competition_group_standings').select('position, competition_id, group_name, team_id, team_name, played, wins, draws, losses, goals_for, goals_against, goal_difference, points, qualified').eq('competition_id', competitionId).order('group_name').order('position'),
      ])
      const failure = results.find((result) => result.error)
      if (failure?.error) {
        const missingSchema = failure.error.code === 'PGRST205' || failure.error.message.includes('schema cache')
        const recovery = missingSchema
          ? 'Apply supabase/migrations/202610160001_institutional_tournament_control.sql to the linked Supabase project with `npx supabase db push`, then reload this page. If the migration is already applied, run `NOTIFY pgrst, \'reload schema\';` in the Supabase SQL Editor.'
          : failure.error.message
        if (active) setError(`Tournament data could not be loaded: ${recovery}`)
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
      const groupsByTeam = new Map((results[2].data ?? []).map((row) => [row.team_id, row.group_name]))
      setTeams(((teamResult.data ?? []) as Array<Omit<Team, 'group_name'>>)
        .map((team) => ({ ...team, group_name: groupsByTeam.get(team.id) ?? null })))
      setPlayers((playerResult.data ?? []) as Player[])
      setCards((results[4].data ?? []) as MatchCard[])
      setLocks((results[5].data ?? []) as SquadLock[])
      setGroupStandings((results[6].data ?? []) as GroupStanding[])
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

  async function saveTeamGroup(teamId: string) {
    if (!supabase || !competitionId) return
    const team = teams.find((row) => row.id === teamId)
    if (!team) return
    const client = supabase
    await runAction(async () => {
      const { error } = await client.rpc('assign_competition_team_group', {
        target_competition: competitionId,
        target_team: teamId,
        target_group: team.group_name ?? '',
      })
      return { error }
    }, 'Team group saved.')
  }

  async function saveQualifiersPerGroup() {
    if (!supabase || !competitionId || !competition) return
    const client = supabase
    const saved = await runAction(async () => await client.from('competitions')
      .update({ qualifiers_per_group: qualifiersPerGroupDraft })
      .eq('id', competitionId), `Top ${qualifiersPerGroupDraft} teams per group will qualify.`)
    if (saved) {
      setCompetitions((current) => current.map((row) => row.id === competitionId
        ? { ...row, qualifiers_per_group: qualifiersPerGroupDraft }
        : row))
    }
  }

  async function updateStageType(stageId: string, stageType: Stage['stage_type']) {
    if (!supabase || !competitionId) return
    const client = supabase
    await runAction(async () => await client.from('tournament_stages')
      .update({ stage_type: stageType })
      .eq('id', stageId), 'Tournament stage type updated.')
  }

  async function toggleKnockoutPublication() {
    if (!supabase || !competition) return
    const nextValue = !competition.knockout_published
    const client = supabase
    const saved = await runAction(async () => await client.from('competitions')
      .update({ knockout_published: nextValue })
      .eq('id', competition.id), nextValue ? 'Knockout bracket published.' : 'Knockout bracket unpublished.')
    if (saved) {
      setCompetitions((current) => current.map((row) => row.id === competition.id
        ? { ...row, knockout_published: nextValue }
        : row))
    }
  }

  async function seedGroupQualifiers() {
    if (!supabase || !competitionId || !selectedStageId) return
    const client = supabase
    setBusy(true)
    setError('')
    setNotice('')
    const { data: knockoutStageId, error: seedError } = await client.rpc('seed_group_qualifiers', {
      target_competition: competitionId,
      source_stage: selectedStageId,
    })
    setBusy(false)
    if (seedError) {
      setError(seedError.message)
      return
    }
    setSelectedStageId(knockoutStageId)
    const qualifierCount = competition?.qualifiers_per_group ?? 4
    const singleGroupBye = Object.keys(groupTables).length === 1 && qualifierCount % 2 === 1
    setNotice(singleGroupBye
      ? `Top ${qualifierCount} teams have qualified. The first-place team has a bye; schedule the final after the preliminary match.`
      : `Top ${qualifierCount} teams from each group have been seeded into the knockout bracket.`)
    setRefreshKey((key) => key + 1)
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
    if (!kickoff || Number.isNaN(new Date(kickoff).getTime())) {
      setError('Choose a valid kick-off date and time for the fixture.')
      return
    }
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
      match_date: date ? new Date(date).toISOString() : null,
      next_match_id: String(form.get('next-match') ?? '') || null,
    }).eq('id', selectedMatch.id), 'Fixture details updated.')
  }

  async function saveOfficials(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || !selectedMatch) return
    const client = supabase
    const form = new FormData(event.currentTarget)
    const venue = String(form.get('match-venue') ?? '').trim() || null
    const refereeName = String(form.get('referee-name') ?? '').trim() || null
    const supervisorName = String(form.get('venue-supervisor') ?? '').trim() || null
    await runAction(async () => {
      const { error: venueError } = await client.from('match_brackets').update({ venue }).eq('id', selectedMatch.id)
      if (venueError) return { error: venueError }
      return await client.from('match_officials').upsert({
        match_id: selectedMatch.id,
        referee_name: refereeName,
        venue_supervisor: supervisorName,
      }, { onConflict: 'match_id' })
    }, 'Venue and officials saved.')
  }

  const completedSteps = [
    stages.length > 0 && rounds.length > 0,
    matches.length > 0,
    locks.length > 0,
    cards.length > 0,
    officials.length > 0,
  ]
  const nextStep = activeStepIndex >= 0 ? controlSteps[activeStepIndex + 1] : controlSteps[0]

  function setStage(stageId: string) {
    setSelectedStageId(stageId)
    setSelectedRoundId(rounds.find((round) => round.stage_id === stageId)?.id ?? '')
  }

  function renderStructureStep() {
    return (
      <div className="tcc-step-grid">
        <section className="tcc-panel">
          <div className="tcc-panel-title"><div><span className="eyebrow">STEP 1A</span><h2>Create stages</h2></div><CalendarDays size={18} /></div>
          <p className="tcc-step-help">Stages describe the major phases of a competition, such as groups, a league, or a knockout phase. Add them in playing order.</p>
          <form className="tcc-form" onSubmit={(event) => void createStage(event)}>
            <label className="tcc-field">Stage name<input name="stage-name" required minLength={2} placeholder="e.g. Group Stage" /></label>
            <div className="tcc-form-row">
              <label className="tcc-field">Stage type<select name="stage-type"><option value="group">Group</option><option value="knockout">Knockout</option><option value="league">League</option></select></label>
              <label className="tcc-field">Playing order<input name="stage-order" type="number" min="1" required defaultValue={stages.length + 1} /></label>
            </div>
            <button className="button button-primary" disabled={busy}>Add stage</button>
          </form>
          <ol className="tcc-compact-list">
            {stages.map((stage) => <li key={stage.id}><span>{stage.sequence_order}</span><strong>{stage.name}</strong><label className="sr-only" htmlFor={`stage-type-${stage.id}`}>Stage type for {stage.name}</label><select id={`stage-type-${stage.id}`} value={stage.stage_type} disabled={busy || Boolean(competition?.ended_at)} onChange={(event) => void updateStageType(stage.id, event.target.value as Stage['stage_type'])}><option value="group">Group stage</option><option value="knockout">Knockout stage</option><option value="league">League stage</option></select></li>)}
            {!stages.length && <li className="tcc-list-empty">Your stages will appear here.</li>}
          </ol>
        </section>
        <section className="tcc-panel">
          <div className="tcc-panel-title"><div><span className="eyebrow">STEP 1B</span><h2>Add rounds</h2></div><ClipboardList size={18} /></div>
          <p className="tcc-step-help">Rounds belong to one stage. Add matchdays, group rounds, quarter-finals, or other round names in order.</p>
          <form className="tcc-form" onSubmit={(event) => void createRound(event)}>
            <label className="tcc-field">Stage<select value={selectedStageId} onChange={(event) => setStage(event.target.value)} required><option value="">Select stage</option>{stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.sequence_order}. {stage.name}</option>)}</select></label>
            <div className="tcc-form-row">
              <label className="tcc-field">Round name<input name="round-name" required minLength={2} placeholder="e.g. Semi-final" /></label>
              <label className="tcc-field">Round number<input name="round-number" type="number" min="1" required defaultValue={availableRounds.length + 1} /></label>
            </div>
            <button className="button button-primary" disabled={busy || !selectedStageId}>Add round</button>
          </form>
          <ol className="tcc-compact-list">
            {rounds.map((round) => <li key={round.id}><span>{round.round_number}</span><strong>{round.name}</strong><small>{stages.find((stage) => stage.id === round.stage_id)?.name ?? 'Stage'}</small></li>)}
            {!rounds.length && <li className="tcc-list-empty">Add a stage before creating rounds.</li>}
          </ol>
        </section>
        <section className="tcc-panel tcc-group-assignment">
          <div className="tcc-panel-title"><div><span className="eyebrow">GROUP STAGE</span><h2>Assign teams to groups</h2></div><Users size={18} /></div>
          <p className="tcc-step-help">Give every participating team a group name (for example, A or B). Completed group fixtures will build each table and mark its top {competition?.qualifiers_per_group ?? 4} as qualified.</p>
          {teams.length ? <div className="tcc-group-assignment-list">
            {teams.map((team) => <div className="tcc-group-assignment-row" key={team.id}>
              <strong>{team.name}</strong>
              <label className="tcc-field"><span className="sr-only">Group for {team.name}</span><input aria-label={`Group for ${team.name}`} value={team.group_name ?? ''} maxLength={80} placeholder="Group A" onChange={(event) => setTeams((current) => current.map((row) => row.id === team.id ? { ...row, group_name: event.target.value } : row))} /></label>
              <button className="button button-secondary" type="button" disabled={busy || Boolean(competition?.ended_at)} onClick={() => void saveTeamGroup(team.id)}>Save group</button>
            </div>)}
          </div> : <div className="tcc-empty-inline"><Users size={18} /><span>Register participating teams before assigning groups.</span></div>}
        </section>
      </div>
    )
  }

  function renderBracketStep() {
    return (
      <div className="tcc-step-stack">
        <section className="tcc-panel">
          <div className="tcc-panel-title"><div><span className="eyebrow">FIXTURES</span><h2>Schedule matches</h2></div><Flag size={18} /></div>
          <p className="tcc-step-help">For manual assignment, choose a knockout round and its two teams. For automatic assignment, select the group stage and use the qualification seeding control below.</p>
          <form className="tcc-form" onSubmit={(event) => void createFixture(event)}>
            <div className="tcc-fixture-form-grid">
              <label className="tcc-field">Round<select value={selectedRoundId} onChange={(event) => setSelectedRoundId(event.target.value)} required><option value="">Select round</option>{rounds.map((round) => <option key={round.id} value={round.id}>{stages.find((stage) => stage.id === round.stage_id)?.name} · {round.name}</option>)}</select></label>
              <label className="tcc-field">Home team<select name="home-team" required><option value="">Select team</option>{teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label>
              <label className="tcc-field">Away team<select name="away-team" required><option value="">Select team</option>{teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label>
              <label className="tcc-field">Kick-off<input name="fixture-date" type="datetime-local" required /></label>
            </div>
            <button className="button button-primary" disabled={busy || !selectedRoundId}>Add fixture</button>
          </form>
        </section>
        <section className="tcc-panel">
          <div className="tcc-panel-title"><div><span className="eyebrow">BRACKET</span><h2>Fixture progression</h2></div><Users size={18} /></div>
          <div className="tcc-knockout-publication">
            <div><strong>Public knockout view</strong><span>{competition?.knockout_published ? 'Visible on the public competition page.' : 'Hidden from the public competition page.'}</span></div>
            <button className={`button ${competition?.knockout_published ? 'button-secondary' : 'button-primary'}`} type="button" aria-pressed={Boolean(competition?.knockout_published)} disabled={busy || Boolean(competition?.ended_at) || (!competition?.knockout_published && !stages.some((stage) => stage.stage_type === 'knockout'))} onClick={() => void toggleKnockoutPublication()}>{competition?.knockout_published ? 'Unpublish bracket' : 'Publish bracket'}</button>
          </div>
          <label className="tcc-field tcc-stage-filter">Stage<select value={selectedStageId} onChange={(event) => setStage(event.target.value)}><option value="">Select stage</option>{stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}</select></label>
          {selectedStage?.stage_type === 'group' && (
            <section className="tcc-qualification-panel">
              <div className="tcc-qualification-heading"><div><span className="eyebrow">QUALIFICATION</span><h3>Group tables</h3></div><span>Top {competition?.qualifiers_per_group ?? 4} advance</span></div>
              <div className="tcc-qualifier-control">
                <label className="tcc-field">Teams advancing from each group<select value={qualifiersPerGroupDraft} onChange={(event) => setQualifiersPerGroupDraft(Number(event.target.value))} disabled={busy || Boolean(competition?.ended_at)}>
                  {[1, 2, 3, 4].map((count) => <option key={count} value={count}>{count}</option>)}
                </select></label>
                <button className="button button-secondary" type="button" disabled={busy || Boolean(competition?.ended_at) || qualifiersPerGroupDraft === competition?.qualifiers_per_group} onClick={() => void saveQualifiersPerGroup()}>Save qualification</button>
              </div>
              {Object.keys(groupTables).length ? <div className="tcc-group-tables">{Object.entries(groupTables).map(([groupName, rows]) => (
                <div className="tcc-group-table" key={groupName}>
                  <h4>Group {groupName}</h4>
                  <div className="tcc-group-table-scroll"><table><thead><tr><th>#</th><th>Team</th><th>PL</th><th>GD</th><th>PTS</th><th>Advance</th></tr></thead><tbody>
                    {rows.map((row) => <tr className={row.qualified ? 'tcc-group-qualified' : ''} key={row.team_id}>
                      <td>{row.position}</td><td>{row.team_name}</td><td>{row.played}</td><td>{row.goal_difference > 0 ? `+${row.goal_difference}` : row.goal_difference}</td><td><strong>{row.points}</strong></td><td>{row.qualified ? 'Qualified' : '—'}</td>
                    </tr>)}
                  </tbody></table></div>
                </div>
              ))}</div> : <p className="tcc-step-help">Assign teams to groups, then record completed group-stage results to populate the tables.</p>}
              <p className="tcc-step-help">When every group fixture is complete, seed qualified teams into the first knockout round. A single group creates semi-finals; paired groups are cross-seeded by position.</p>
              <button className="button button-primary" type="button" disabled={busy || Boolean(competition?.ended_at) || !Object.keys(groupTables).length} onClick={() => void seedGroupQualifiers()}><Flag size={15} />Qualify top {competition?.qualifiers_per_group ?? 4} &amp; seed bracket</button>
            </section>
          )}
          <TournamentBracketView rounds={bracketRounds} teamNames={teamNames} fixtureNames={matchNames} onSelectFixture={setSelectedMatchId} />
        </section>
        {selectedMatch && (
          <section className="tcc-panel tcc-match-editor">
            <div className="tcc-editor-heading"><div><span className="eyebrow">SELECTED FIXTURE</span><h3>{matchNames[selectedMatch.id]}</h3></div><span className="tcc-status-pill">{selectedMatch.match_status.replaceAll('_', ' ')}</span></div>
            <p className="tcc-step-help">Update the score and status. Use the progression field to connect the winner’s next fixture.</p>
            <form className="tcc-form" key={selectedMatch.id} onSubmit={(event) => void saveFixture(event)}>
              <div className="tcc-editor-grid">
                <label className="tcc-field">{teamNames[selectedMatch.home_team_id] ?? 'Home'} score<input name="home-score" type="number" min="0" required defaultValue={selectedMatch.home_score} /></label>
                <label className="tcc-field">{teamNames[selectedMatch.away_team_id] ?? 'Away'} score<input name="away-score" type="number" min="0" required defaultValue={selectedMatch.away_score} /></label>
                <label className="tcc-field">Match status<select name="match-status" defaultValue={selectedMatch.match_status}>{['scheduled', 'warm_up', 'live', 'half_time', 'full_time', 'postponed', 'cancelled'].map((status) => <option key={status} value={status}>{status.replaceAll('_', ' ')}</option>)}</select></label>
                <label className="tcc-field">Winner (optional)<select name="winner-team" defaultValue={selectedMatch.winner_team_id ?? ''}><option value="">No winner selected</option><option value={selectedMatch.home_team_id}>{teamNames[selectedMatch.home_team_id]}</option><option value={selectedMatch.away_team_id}>{teamNames[selectedMatch.away_team_id]}</option></select></label>
                <label className="tcc-field tcc-field-wide">Progression fixture<select name="next-match" defaultValue={selectedMatch.next_match_id ?? ''}><option value="">No progression link</option>{matches.filter((match) => match.id !== selectedMatch.id).map((match) => <option key={match.id} value={match.id}>{matchNames[match.id]}</option>)}</select></label>
              </div>
              <button className="button button-primary" disabled={busy}>Save fixture result</button>
            </form>
          </section>
        )}
      </div>
    )
  }

  function renderSquadsStep() {
    return (
      <section className="tcc-panel tcc-step-panel">
        <div className="tcc-panel-title"><div><span className="eyebrow">MATCHDAY CONTROL</span><h2>Lock squad announcements</h2></div><LockKeyhole size={18} /></div>
        <p className="tcc-step-help">Select a competition team, then lock its squad when captains, vice-captains, or the starting XI should no longer be changed.</p>
        <div className="tcc-control-form">
          <label className="tcc-field">Registered team<select value={selectedTeamId} onChange={(event) => setSelectedTeamId(event.target.value)}><option value="">Select team</option>{teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label>
          {selectedTeamId ? (
            <div className={`tcc-lock-state ${activeLock?.is_locked ? 'tcc-lock-on' : ''}`}>
              {activeLock?.is_locked ? <LockKeyhole size={20} /> : <UnlockKeyhole size={20} />}
              <div><strong>{activeLock?.is_locked ? 'Squad announcements are locked' : 'Squad announcements are open'}</strong><span>{activeLock?.is_locked ? 'Team lineup changes are blocked until you unlock them.' : 'Secretaries can still edit the team’s matchday announcement.'}</span></div>
            </div>
          ) : <p className="tcc-helper">No teams are registered for this competition yet. Register a team in the Teams workspace first.</p>}
          <button className={`button ${activeLock?.is_locked ? 'button-secondary' : 'button-primary'}`} type="button" disabled={busy || !selectedTeamId} onClick={() => void toggleSquadLock()}>
            {activeLock?.is_locked ? <UnlockKeyhole size={15} /> : <LockKeyhole size={15} />}
            {activeLock?.is_locked ? 'Unlock announcements' : 'Lock announcements'}
          </button>
          <p className="tcc-helper">The lock applies to this team in the selected competition only.</p>
        </div>
      </section>
    )
  }

  function renderDisciplineStep() {
    const redCards = cards.filter((card) => card.card_type === 'red')
    return (
      <div className="tcc-step-grid">
        <section className="tcc-panel">
          <div className="tcc-panel-title"><div><span className="eyebrow">CARD LOG</span><h2>Record a disciplinary card</h2></div><ShieldAlert size={18} /></div>
          <p className="tcc-step-help">Log a card against a registered player and fixture. An unserved red card blocks eligibility for this competition.</p>
          <form className="tcc-form" onSubmit={(event) => void logCard(event)}>
            <label className="tcc-field">Registered player<select name="card-player" value={selectedPlayerId} onChange={(event) => setSelectedPlayerId(event.target.value)} required><option value="">Select player</option>{players.map((player) => <option key={player.id} value={player.id}>{player.full_name}{player.batch_session ? ` · ${player.batch_session}` : ''}</option>)}</select></label>
            <label className="tcc-field">Fixture<select name="card-match" required><option value="">Select fixture</option>{matches.map((match) => <option key={match.id} value={match.id}>{matchNames[match.id]}</option>)}</select></label>
            <label className="tcc-field">Card type<select name="card-type" defaultValue="yellow"><option value="yellow">Yellow card</option><option value="red">Red card — activates suspension</option></select></label>
            <button className="button button-primary" disabled={busy || !players.length || !matches.length}><ShieldAlert size={15} />Save card</button>
          </form>
          <div className="tcc-eligibility-wrap">
            <h3 className="tcc-subheading">Eligibility check</h3>
            <InstitutionalEligibilityCheck playerId={selectedPlayerId} competitionId={competitionId} refreshKey={refreshKey} />
          </div>
        </section>
        <section className="tcc-panel">
          <div className="tcc-panel-title"><div><span className="eyebrow">SUSPENSION TRACKER</span><h2>Red-card suspensions</h2></div><ShieldCheck size={18} /></div>
          <p className="tcc-step-help">Mark a suspension served only after the player has completed the required suspension.</p>
          <div className="tcc-card-list">
            {redCards.length ? redCards.map((card) => (
              <div className="tcc-card-row" key={card.id}>
                <span className={`tcc-card-indicator ${card.suspension_served_at ? 'tcc-card-served' : ''}`} />
                <div><strong>{playerNames[card.player_id] ?? 'Registered player'}</strong><span>{card.suspension_served_at ? 'Served' : 'Active suspension'} · {new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(card.issued_at))}</span></div>
                {!card.suspension_served_at && <button type="button" className="tcc-serve-button" disabled={busy} onClick={() => void markSuspensionServed(card.id)}>Mark served</button>}
              </div>
            )) : <div className="tcc-empty-inline"><ShieldCheck size={18} /><span>No red cards recorded for this competition.</span></div>}
          </div>
          <div className="tcc-note"><AlertTriangle size={14} /><span>Eligibility requires an active player, confirmed academic enrollment, batch/session, an active competition registration, and no unserved red card.</span></div>
        </section>
      </div>
    )
  }

  function renderOfficialsStep() {
    return (
      <section className="tcc-panel tcc-step-panel">
        <div className="tcc-panel-title"><div><span className="eyebrow">FIXTURE PREPARATION</span><h2>Venue &amp; officials</h2></div><ClipboardPenLine size={18} /></div>
        <p className="tcc-step-help">Choose a fixture, then assign its playing venue, referee, and venue supervisor.</p>
        {matches.length ? (
          <>
            <label className="tcc-field tcc-match-picker">Fixture<select value={selectedMatchId} onChange={(event) => setSelectedMatchId(event.target.value)}>{matches.map((match) => <option key={match.id} value={match.id}>{matchNames[match.id]}{match.match_date ? ` · ${new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(new Date(match.match_date))}` : ''}</option>)}</select></label>
            {selectedMatch && (
              <form className="tcc-form tcc-official-form" key={selectedMatch.id} onSubmit={(event) => void saveOfficials(event)}>
                <div className="tcc-editor-grid">
                  <label className="tcc-field tcc-field-wide">Venue<input name="match-venue" defaultValue={selectedMatch.venue ?? ''} placeholder="Stadium / court" /></label>
                  <label className="tcc-field">Referee<input name="referee-name" defaultValue={selectedOfficials?.referee_name ?? ''} placeholder="Official's name" /></label>
                  <label className="tcc-field">Venue supervisor<input name="venue-supervisor" defaultValue={selectedOfficials?.venue_supervisor ?? ''} placeholder="Supervisor's name" /></label>
                </div>
                <button className="button button-primary" disabled={busy}>Save venue &amp; officials</button>
              </form>
            )}
          </>
        ) : <div className="tcc-empty-inline"><CalendarDays size={18} /><span>Create a fixture in the Fixtures step before assigning officials.</span></div>}
        <div className="tcc-assignment-list">
          {matches.map((match) => {
            const matchOfficials = officials.find((official) => official.match_id === match.id)
            return <button className={`tcc-assignment-row ${selectedMatchId === match.id ? 'tcc-assignment-active' : ''}`} type="button" key={match.id} onClick={() => setSelectedMatchId(match.id)}>
              <span><strong>{matchNames[match.id]}</strong><small>{match.venue || 'Venue not assigned'} · {matchOfficials?.referee_name || 'Referee not assigned'}</small></span>
              <span className="tcc-assignment-status">{match.venue && matchOfficials?.referee_name ? 'Ready' : 'Needs setup'}</span>
            </button>
          })}
        </div>
      </section>
    )
  }

  return (
    <section className="tcc-page">
      <div className="secretary-heading">
        <div>
          <span className="eyebrow">UNIVERSITY COMPETITION WORKSPACE</span>
          <h1>{activeStep?.title ?? 'Tournament control'}</h1>
          <p>{activeStep?.description ?? 'Follow the guided steps to prepare and manage your university competition.'}</p>
        </div>
        {activeStep && <Link className="button button-secondary tcc-overview-link" to={controlBasePath}><ArrowLeft size={15} />Overview</Link>}
      </div>

      {error && <div className="tcc-banner tcc-banner-error" role="alert"><AlertTriangle size={16} />{error}</div>}
      {notice && <div className="tcc-banner tcc-banner-success" role="status"><Check size={16} />{notice}</div>}

      <div className="tcc-panel tcc-competition-bar">
        <label className="tcc-field">Working competition
          <select value={competitionId} onChange={(event) => setCompetitionId(event.target.value)} disabled={loading}>
            <option value="">Select competition</option>
            {competitions.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.season}{item.ended_at ? ' · Ended' : ''}</option>)}
          </select>
        </label>
        <span>{competition ? `${competition.name} · ${stages.length} stages · ${matches.length} fixtures${competition.ended_at ? ' · Ended and read-only' : ''}` : 'Your changes apply only to this university competition.'}</span>
      </div>

      {competition && (
        <nav className="tcc-stepper" aria-label="Tournament setup steps">
          <Link to={controlBasePath} className={`tcc-stepper-home ${!activeStep ? 'tcc-stepper-active' : ''}`}>Overview</Link>
          {controlSteps.map((step, index) => {
            const Icon = step.icon
            return <Link key={step.id} to={`${controlBasePath}/${step.id}`} className={`tcc-stepper-link ${activeStep?.id === step.id ? 'tcc-stepper-active' : ''} ${completedSteps[index] ? 'tcc-stepper-complete' : ''}`}>
              <span className="tcc-stepper-number">{completedSteps[index] ? <Check size={13} /> : index + 1}</span><span>{step.shortTitle}</span><Icon className="tcc-stepper-icon" size={14} />
            </Link>
          })}
        </nav>
      )}

      {loading ? <div className="tcc-panel tcc-loading">Loading your competition workspace…</div> : !competition ? (
        <div className="tcc-panel tcc-empty-state">
          <ClipboardList size={23} /><strong>Select or create a competition</strong>
          <span>Choose a competition above to manage its tournament. No competitions yet?</span>
          <Link className="button button-primary" to={universityPortalPath(portalBasePath, '/competitions')}>Open competitions</Link>
        </div>
      ) : competition.ended_at ? (
        <div className="tcc-panel tcc-ended-state"><LockKeyhole size={23} /><strong>Tournament ended</strong><span>This competition and all its tournament records are permanently read-only. Published results remain available to the public.</span></div>
      ) : !activeStep ? (
        <div className="tcc-overview">
          <div className="tcc-welcome-card"><span className="tcc-welcome-icon"><ClipboardList size={21} /></span><div><strong>{competition.name}</strong><span>{competition.season} · This workspace is private to your university.</span></div><span className="tcc-overview-count">{stages.length} stages · {matches.length} fixtures</span></div>
          <div className="tcc-step-cards">
            {controlSteps.map((step, index) => {
              const Icon = step.icon
              return <Link className="tcc-step-card" to={`${controlBasePath}/${step.id}`} key={step.id}>
                <span className="tcc-step-card-number">{completedSteps[index] ? <Check size={15} /> : `0${index + 1}`}</span>
                <span className="tcc-step-card-icon"><Icon size={18} /></span>
                <strong>{step.title}</strong><small>{step.description}</small>
                <span className="tcc-step-card-footer">{completedSteps[index] ? 'Review or edit' : 'Start this step'}<ArrowRight size={14} /></span>
              </Link>
            })}
          </div>
        </div>
      ) : (
        <>
          <div className="tcc-step-intro">
            <span>STEP {activeStepIndex + 1} OF {controlSteps.length}</span>
            <div><strong>{activeStep.title}</strong><small>{activeStep.description}</small></div>
            <Link to={controlBasePath}>All steps</Link>
          </div>
          {activeStep.id === 'structure' && renderStructureStep()}
          {activeStep.id === 'bracket' && renderBracketStep()}
          {activeStep.id === 'squads' && renderSquadsStep()}
          {activeStep.id === 'discipline' && renderDisciplineStep()}
          {activeStep.id === 'officials' && renderOfficialsStep()}
          <div className="tcc-step-navigation">
            {activeStepIndex > 0 ? <Link className="button button-secondary" to={`${controlBasePath}/${controlSteps[activeStepIndex - 1].id}`}><ArrowLeft size={15} />Previous step</Link> : <span />}
            {nextStep ? <Link className="button button-primary" to={`${controlBasePath}/${nextStep.id}`}>Next: {nextStep.shortTitle}<ArrowRight size={15} /></Link> : <Link className="button button-primary" to={controlBasePath}><Check size={15} />Finish</Link>}
          </div>
        </>
      )}
    </section>
  )
}
