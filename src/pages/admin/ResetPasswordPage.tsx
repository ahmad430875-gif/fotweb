import { useState, type FormEvent } from 'react'
import { ArrowRight, LockKeyhole } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { FootballLogo } from '../../components/FootballLogo'
import { supabase } from '../../lib/supabase'

export function ResetPasswordPage() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    if (!supabase) return setError('Password recovery is not configured.')
    if (password.length < 12) return setError('Use at least 12 characters for your new password.')
    if (password !== confirmation) return setError('The passwords do not match.')
    setBusy(true)
    const { error: updateError } = await supabase.auth.updateUser({ password })
    if (updateError) {
      setBusy(false)
      setError('This reset link is invalid or expired. Request a new recovery email.')
      return
    }
    await supabase.auth.signOut()
    navigate('/admin/login', { replace: true, state: { notice: 'Password updated. Sign in with your new password.' } })
  }

  return <main className="reset-page"><Link className="login-brand reset-brand" to="/admin/login"><span className="brand-mark"><FootballLogo size={25} /></span><span>FOTWEB<span>.</span></span></Link><section className="reset-card"><span className="reset-icon"><LockKeyhole size={19} /></span><span className="eyebrow">ACCOUNT RECOVERY</span><h1>Choose a new password</h1><p>Use at least 12 characters. You will need to sign in again after saving.</p><form className="login-form" onSubmit={(event) => void submit(event)}><label>New password<input type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={12} required /></label><label>Confirm new password<input type="password" autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} minLength={12} required /></label>{error && <p className="form-error" role="alert">{error}</p>}<button type="submit" className="button button-primary login-submit" disabled={busy}>{busy ? 'Updating password…' : 'Update password'}<ArrowRight size={15} /></button></form><Link className="reset-link" to="/admin/login">Back to sign in</Link></section></main>
}
