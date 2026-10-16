import { useState, type FormEvent } from 'react'
import { ArrowRight, LockKeyhole } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/AuthProvider'
import { FootballLogo } from '../../components/FootballLogo'
import { supabase } from '../../lib/supabase'

type PasswordLinkMode = 'invite' | 'recovery'

function PasswordLinkPage({ mode }: { mode: PasswordLinkMode }) {
  const navigate = useNavigate()
  const { loading: authLoading, profile, session } = useAuth()
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const isInvitation = mode === 'invite'
  const hasValidInvitation = profile?.role === 'university_admin' && Boolean(profile.university_id)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    if (!supabase) return setError('Password recovery is not configured.')
    if (!session) return setError('This link is invalid or expired. Ask the administrator to send a new invitation or request another reset email.')
    if (isInvitation && !hasValidInvitation) return setError('This invitation is not linked to an active Sports Secretary account. Contact the platform administrator.')
    if (password.length < 12) return setError('Use at least 12 characters for your new password.')
    if (password !== confirmation) return setError('The passwords do not match.')
    setBusy(true)
    const { error: updateError } = await supabase.auth.updateUser({ password })
    if (updateError) {
      setBusy(false)
      setError(isInvitation
        ? 'This invitation link is invalid or expired. Ask the platform administrator to send a new invitation.'
        : 'This reset link is invalid or expired. Request a new recovery email.')
      return
    }
    if (isInvitation) {
      navigate('/secretary', { replace: true })
      return
    }
    await supabase.auth.signOut()
    navigate('/admin/login', { replace: true, state: { notice: 'Password updated. Sign in with your new password.' } })
  }

  if (authLoading) {
    return <main className="reset-page"><section className="reset-card" role="status"><span className="reset-icon"><LockKeyhole size={19} /></span><h1>Verifying secure link</h1><p>Please wait while we check your account.</p></section></main>
  }

  if (!session || (isInvitation && !hasValidInvitation)) {
    return <main className="reset-page"><Link className="login-brand reset-brand" to="/admin/login"><span className="brand-mark"><FootballLogo size={25} /></span><span>FOTWEB<span>.</span></span></Link><section className="reset-card"><span className="reset-icon"><LockKeyhole size={19} /></span><span className="eyebrow">{isInvitation ? 'SECRETARY INVITATION' : 'ACCOUNT RECOVERY'}</span><h1>{isInvitation ? 'Invitation link unavailable' : 'Reset link unavailable'}</h1><p>{!session
      ? 'This link may have expired or already been used. Ask the administrator for a new invitation, or return to sign in.'
      : 'This invitation is not connected to an active Sports Secretary profile. Contact the platform administrator.'}</p><Link className="button button-primary login-submit" to="/admin/login">Back to sign in<ArrowRight size={15} /></Link></section></main>
  }

  return <main className="reset-page"><Link className="login-brand reset-brand" to="/admin/login"><span className="brand-mark"><FootballLogo size={25} /></span><span>FOTWEB<span>.</span></span></Link><section className="reset-card"><span className="reset-icon"><LockKeyhole size={19} /></span><span className="eyebrow">{isInvitation ? 'SPORTS SECRETARY INVITATION' : 'ACCOUNT RECOVERY'}</span><h1>{isInvitation ? 'Accept your invitation' : 'Choose a new password'}</h1><p>{isInvitation
      ? 'Set a password to activate your Sports Secretary account. You will be taken to your university portal after setup.'
      : 'Use at least 12 characters. You will need to sign in again after saving.'}</p><form className="login-form" onSubmit={(event) => void submit(event)}><label>New password<input type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={12} required /></label><label>Confirm new password<input type="password" autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} minLength={12} required /></label>{error && <p className="form-error" role="alert">{error}</p>}<button type="submit" className="button button-primary login-submit" disabled={busy}>{busy ? 'Saving password…' : isInvitation ? 'Accept invitation' : 'Update password'}<ArrowRight size={15} /></button></form><Link className="reset-link" to="/admin/login">Back to sign in</Link></section></main>
}

export function AcceptInvitationPage() {
  return <PasswordLinkPage mode="invite" />
}

export function ResetPasswordPage() {
  return <PasswordLinkPage mode="recovery" />
}
