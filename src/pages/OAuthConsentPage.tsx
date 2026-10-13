import { useEffect, useState } from 'react'
import { ArrowRight, Check, LockKeyhole, ShieldCheck, X } from 'lucide-react'
import { Navigate, useLocation, useSearchParams } from 'react-router-dom'
import type { OAuthAuthorizationDetails } from '@supabase/supabase-js'
import { useAuth } from '../auth/AuthProvider'
import { LoadingScreen } from '../components/LoadingScreen'
import { FootballLogo } from '../components/FootballLogo'
import { supabase } from '../lib/supabase'

type ConsentState = 'loading' | 'ready' | 'error'

export function OAuthConsentPage() {
  const { loading, session } = useAuth()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const authorizationId = searchParams.get('authorization_id')
  const [request, setRequest] = useState<OAuthAuthorizationDetails | null>(null)
  const [status, setStatus] = useState<ConsentState>('loading')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (loading) return
    if (!session) {
      setStatus('loading')
      return
    }
    if (!authorizationId) {
      setError('This authorization link is missing its request identifier.')
      setStatus('error')
      return
    }
    if (!supabase) {
      setError('Supabase is not configured for this application.')
      setStatus('error')
      return
    }

    let active = true
    setStatus('loading')
    setError('')
    supabase.auth.oauth.getAuthorizationDetails(authorizationId).then(({ data, error: requestError }) => {
      if (!active) return
      if (requestError) {
        setError('This authorization request could not be loaded. It may have expired or already been used.')
        setStatus('error')
      } else if ('redirect_url' in data) {
        window.location.assign(data.redirect_url)
      } else {
        setRequest(data)
        setStatus('ready')
      }
    }).catch(() => {
      if (!active) return
      setError('A connection error prevented this authorization request from loading.')
      setStatus('error')
    })

    return () => { active = false }
  }, [authorizationId, loading, session?.user.id])

  async function decide(approved: boolean) {
    if (!supabase || !authorizationId) return
    setBusy(true)
    setError('')
    try {
      const { data, error: decisionError } = approved
        ? await supabase.auth.oauth.approveAuthorization(authorizationId, { skipBrowserRedirect: true })
        : await supabase.auth.oauth.denyAuthorization(authorizationId, { skipBrowserRedirect: true })
      if (decisionError) {
        setError('Your decision could not be saved. The authorization request may have expired.')
        setBusy(false)
        return
      }
      window.location.assign(data.redirect_url)
    } catch {
      setError('A connection error prevented your decision from being saved.')
      setBusy(false)
    }
  }

  if (loading) return <LoadingScreen label="Checking secure session" />
  if (!session) return <Navigate to="/admin/login" replace state={{ from: `${location.pathname}${location.search}${location.hash}` }} />

  if (status === 'loading') return <LoadingScreen label="Loading authorization request" />

  const scopes = request?.scope.trim().split(/\s+/).filter(Boolean) ?? []
  const redirectHost = request ? (() => {
    try { return new URL(request.redirect_uri).host } catch { return request.redirect_uri }
  })() : ''

  return <main className="oauth-consent-page">
    <a className="login-brand oauth-brand" href="/"><span className="brand-mark"><FootballLogo size={25} /></span><span>FOTWEB<span>.</span></span></a>
    <section className="oauth-consent-content" aria-labelledby="oauth-consent-title">
      <span className="oauth-consent-icon"><ShieldCheck size={20} /></span>
      <span className="eyebrow">SECURE AUTHORIZATION</span>
      {status === 'error' ? <>
        <h1 id="oauth-consent-title">Authorization unavailable</h1>
        <p className="oauth-consent-intro" role="alert">{error}</p>
        <a className="button button-secondary" href="/">Return to FOTWEB</a>
      </> : request ? <>
        <h1 id="oauth-consent-title">Allow access?</h1>
        <p className="oauth-consent-intro"><strong>{request.client.name}</strong> is requesting access to your FOTWEB account.</p>
        <div className="oauth-client-summary">
          <span className="oauth-client-mark"><LockKeyhole size={18} /></span>
          <div><strong>{request.client.name}</strong><span>{request.client.uri}</span></div>
        </div>
        <div className="oauth-consent-details">
          <div><span>This account</span><strong>{request.user.email}</strong></div>
          <div><span>Redirect destination</span><strong>{redirectHost}</strong></div>
        </div>
        <div className="oauth-scope-section">
          <span className="eyebrow">REQUESTED PERMISSIONS</span>
          {scopes.length ? <ul>{scopes.map((scope) => <li key={scope}><Check size={14} />{scope}</li>)}</ul> : <p>No additional permissions requested.</p>}
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="oauth-consent-actions">
          <button className="button button-secondary" type="button" onClick={() => void decide(false)} disabled={busy}><X size={15} />Deny</button>
          <button className="button button-primary" type="button" onClick={() => void decide(true)} disabled={busy}>{busy ? 'Saving…' : 'Allow access'}<ArrowRight size={15} /></button>
        </div>
        <p className="oauth-consent-foot"><LockKeyhole size={13} /> You can revoke access to connected apps at any time.</p>
      </> : null}
    </section>
  </main>
}