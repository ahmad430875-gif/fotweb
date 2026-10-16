import { useState, type FormEvent } from 'react'
import { ArrowRight, LockKeyhole, ShieldCheck } from 'lucide-react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../auth/AuthProvider'
import { FootballLogo } from '../../components/FootballLogo'
import { supabase, supabaseConfigured } from '../../lib/supabase'
import { LoadingScreen } from '../../components/LoadingScreen'

export function LoginPage() {
  const location = useLocation()
  const returnTo = (location.state as { from?: unknown } | null)?.from
  const adminLogin = new URLSearchParams(location.search).get('mode') === 'admin'
  const oauthReturn = !adminLogin && typeof returnTo === 'string' && returnTo.startsWith('/') && !returnTo.startsWith('//') && new URL(returnTo, window.location.origin).pathname === '/oauth/consent'
  const { session, profile, loading, error: profileError } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  if (loading) return <LoadingScreen label="Checking secure session" />
  if (session && oauthReturn) return <Navigate to={returnTo} replace />
  if (session && profile?.role === 'university_admin') return <Navigate to="/secretary" replace />
  if (session && profile?.role === 'super_admin') return <Navigate to="/admin" replace />

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setNotice('')
    if (!supabase) return setError('Supabase is not configured. Add the public project URL and anon key to your local environment.')
    setBusy(true)
    const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setBusy(false)
    if (!authError && oauthReturn) return
    if (authError?.code === 'email_not_confirmed') setError('Confirm this email address in Supabase Auth before signing in.')
    else if (authError?.code === 'invalid_credentials') setError('Supabase did not accept this email and password. Check the account and password in Authentication > Users.')
    else if (authError) setError('Supabase could not sign you in. Check the Auth user status and try again.')
  }

  async function requestReset() {
    setError('')
    setNotice('')
    if (!supabase || !email.trim()) return setError(`Enter your ${oauthReturn ? 'account' : 'administrator'} email first.`)
    setBusy(true)
    const redirectTo = new URL(import.meta.env.BASE_URL, window.location.origin).toString()
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo })
    setBusy(false)
    if (resetError) setError('We could not send a reset email. Check the address and try again.')
    else setNotice('If this account exists, a password reset email is on its way.')
  }

  return <main className="login-page">
    <div className="login-aside"><a className="login-brand" href="/"><span className="brand-mark"><FootballLogo size={27} /></span><span>FOTWEB<span>.</span></span></a><div className="login-aside-content"><span className="eyebrow">THE HOME OF UNIVERSITY FOOTBALL</span><h1>Every campus.<br />One game.</h1><p>Secure competition management for the universities, teams, and players building their own football history.</p></div><div className="login-aside-foot"><ShieldCheck size={15} />{oauthReturn ? 'Secure account sign-in' : 'Platform administration · Restricted access'}</div></div>
    <section className="login-main"><div className="login-form-wrap"><span className="mobile-login-brand"><span className="brand-mark"><FootballLogo size={24} /></span>FOTWEB<span>.</span></span><span className="eyebrow login-eyebrow">{oauthReturn ? 'FOTWEB ACCOUNT' : 'SECURE ADMINISTRATOR ACCESS'}</span><h2>Welcome back</h2><p className="login-subtitle">{oauthReturn ? 'Sign in to review this authorization request.' : 'Sign in to open your university or platform workspace.'}</p>
      {!oauthReturn && session && !profile && !loading && <p className="form-error" role="alert">{profileError ? 'Your Supabase session is valid, but the app could not verify your user profile. Check that the database migrations are applied and user_profiles is accessible.' : 'This account is signed in but is not provisioned as a Super Admin. It needs an active user profile and the super_admin role.'}</p>}
      {!supabaseConfigured && <div className="config-callout"><LockKeyhole size={16} /><div><strong>Backend connection required</strong><span>Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> to <code>.env.local</code>, then restart the dev server.</span></div></div>}
      <form className="login-form" onSubmit={handleSubmit}><label>Email address<input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="admin@university.edu" required /></label><label>Password<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" required /></label>{error && <p className="form-error" role="alert">{error}</p>}{notice && <p className="form-success" role="status">{notice}</p>}<button className="button button-primary login-submit" type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in securely'}<ArrowRight size={16} /></button><button className="reset-link" type="button" onClick={() => void requestReset()} disabled={busy}>Forgot password?</button></form>
      {oauthReturn && <Link className="reset-link" to="/admin/login?mode=admin" state={null}>Sign in as a Super Admin instead</Link>}
      <div className="login-security"><LockKeyhole size={14} /><span>{oauthReturn ? 'Your account credentials stay with FOTWEB' : 'Protected with role-based access controls'}</span></div>{!oauthReturn && <span className="login-footnote">Your account role opens the university or platform workspace assigned to you.</span>}
    </div></section>
  </main>
}
