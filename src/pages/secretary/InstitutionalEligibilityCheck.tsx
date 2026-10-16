import { useEffect, useState } from 'react'
import { CheckCircle2, CircleAlert, LoaderCircle } from 'lucide-react'
import { supabase } from '../../lib/supabase'

type EligibilityState = {
  loading: boolean
  error: string
  playerActive: boolean
  academicallyEnrolled: boolean
  competitionRegistration: boolean
  batchSession: string | null
  activeSuspension: boolean
}

const emptyState: EligibilityState = {
  loading: true,
  error: '',
  playerActive: false,
  academicallyEnrolled: false,
  competitionRegistration: false,
  batchSession: null,
  activeSuspension: false,
}

export function InstitutionalEligibilityCheck({
  playerId,
  competitionId,
  refreshKey = 0,
}: {
  playerId: string
  competitionId: string
  refreshKey?: number
}) {
  const [state, setState] = useState<EligibilityState>(emptyState)

  useEffect(() => {
    let active = true

    async function checkEligibility() {
      if (!supabase) {
        setState({ ...emptyState, loading: false, error: 'Connect Supabase to check eligibility.' })
        return
      }
      if (!playerId || !competitionId) {
        setState({ ...emptyState, loading: false })
        return
      }

      setState({ ...emptyState, loading: true })
      const [playerResult, registrationResult, suspensionResult] = await Promise.all([
        supabase.from('players')
          .select('is_active, academic_enrollment_status, batch_session')
          .eq('id', playerId)
          .maybeSingle(),
        supabase.from('player_registrations')
          .select('id')
          .eq('player_id', playerId)
          .eq('competition_id', competitionId)
          .is('released_at', null)
          .limit(1),
        supabase.from('match_cards')
          .select('id')
          .eq('player_id', playerId)
          .eq('competition_id', competitionId)
          .eq('card_type', 'red')
          .is('suspension_served_at', null)
          .limit(1),
      ])
      if (!active) return

      const failed = [playerResult, registrationResult, suspensionResult].find((result) => result.error)
      if (failed?.error) {
        setState({ ...emptyState, loading: false, error: `Eligibility could not be checked: ${failed.error.message}` })
        return
      }

      setState({
        loading: false,
        error: '',
        playerActive: playerResult.data?.is_active ?? false,
        academicallyEnrolled: playerResult.data?.academic_enrollment_status === 'active',
        competitionRegistration: Boolean(registrationResult.data?.length),
        batchSession: playerResult.data?.batch_session?.trim() || null,
        activeSuspension: Boolean(suspensionResult.data?.length),
      })
    }

    void checkEligibility()
    return () => { active = false }
  }, [playerId, competitionId, refreshKey])

  if (!playerId || !competitionId) {
    return <div className="tcc-eligibility-empty">Select a player and competition to run the eligibility check.</div>
  }
  if (state.loading) {
    return <div className="tcc-eligibility-state"><LoaderCircle size={15} className="tcc-spinner" /> Checking eligibility…</div>
  }
  if (state.error) {
    return <div className="tcc-eligibility-state tcc-error" role="alert"><CircleAlert size={16} />{state.error}</div>
  }

  const eligible = state.playerActive && state.academicallyEnrolled && state.competitionRegistration && Boolean(state.batchSession) && !state.activeSuspension
  const checks = [
    { label: 'Active player profile', passed: state.playerActive },
    { label: 'Active academic enrollment', passed: state.academicallyEnrolled },
    { label: 'Registered for this competition', passed: state.competitionRegistration },
    { label: state.batchSession ? `Batch / session: ${state.batchSession}` : 'Batch / session recorded', passed: Boolean(state.batchSession) },
    { label: 'No active red-card suspension', passed: !state.activeSuspension },
  ]

  return (
    <div className={`tcc-eligibility ${eligible ? 'tcc-eligibility-ok' : 'tcc-eligibility-action'}`} aria-live="polite">
      <div className="tcc-eligibility-heading">
        {eligible ? <CheckCircle2 size={17} /> : <CircleAlert size={17} />}
        <strong>{eligible ? 'Eligible' : 'Action Required / Ineligible'}</strong>
      </div>
      <ul>
        {checks.map(({ label, passed }) => (
          <li key={label} className={passed ? 'tcc-check-passed' : 'tcc-check-failed'}>
            <span aria-hidden="true">{passed ? '✓' : '!'}</span>{label}
          </li>
        ))}
      </ul>
    </div>
  )
}
