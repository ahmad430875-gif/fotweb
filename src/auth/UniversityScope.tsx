import type { ReactNode } from 'react'
import { UniversityScopeContext } from './UniversityScopeContext'

export function UniversityScopeProvider({ universityId, children }: { universityId: string; children: ReactNode }) {
  return (
    <UniversityScopeContext.Provider value={{ universityId, basePath: `/admin/universities/${universityId}/manage` }}>
      {children}
    </UniversityScopeContext.Provider>
  )
}
