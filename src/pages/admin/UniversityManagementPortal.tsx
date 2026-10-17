import { Outlet, useParams } from 'react-router-dom'
import { UniversityScopeProvider } from '../../auth/UniversityScope'

export function UniversityManagementPortal() {
  const { id } = useParams()
  if (!id) return null
  return (
    <UniversityScopeProvider universityId={id}>
      <Outlet />
    </UniversityScopeProvider>
  )
}
