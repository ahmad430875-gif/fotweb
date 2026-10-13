import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from './AuthProvider'
import { LoadingScreen } from '../components/LoadingScreen'

export function RequireUniversityAdmin() {
  const { loading, profile, session, error, signOut } = useAuth()
  const location = useLocation()

  if (loading) return <LoadingScreen label="Checking university access" />
  if (!session) return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />
  if (!profile) return <main className="access-state"><span className="eyebrow">ACCESS RESTRICTED</span><h1>This account has no active university profile.</h1><p>{error ? 'Your account could not be verified. Try signing in again.' : 'Ask the platform administrator to activate your Sports Secretary access.'}</p><button className="button button-secondary" onClick={() => void signOut()}>Sign out</button></main>
  if (profile.role !== 'university_admin' || !profile.university_id) return <Navigate to="/admin" replace />
  return <Outlet />
}
