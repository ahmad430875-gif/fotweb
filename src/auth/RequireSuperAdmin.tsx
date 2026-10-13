import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from './AuthProvider'
import { LoadingScreen } from '../components/LoadingScreen'

export function RequireSuperAdmin() {
  const { loading, profile, session, error, signOut } = useAuth()
  const location = useLocation()
  if (loading) return <LoadingScreen label="Checking administrator access" />
  if (!session) return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />
  if (profile?.role === 'university_admin') return <Navigate to="/secretary" replace />
  if (!profile) return <main className="access-state"><span className="eyebrow">ACCESS RESTRICTED</span><h1>This account cannot open the Super Admin portal.</h1><p>{error ? 'Your account could not be verified. Try signing in again.' : 'A Super Admin account is required. University Sports Secretaries have access only to their own portal.'}</p><button className="button button-secondary" onClick={() => void signOut()}>Sign out</button></main>
  if (profile.role !== 'super_admin') return <Navigate to="/forbidden" replace />
  return <Outlet />
}
