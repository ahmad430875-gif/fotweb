import { useContext } from 'react'
import { UniversityScopeContext } from './UniversityScopeContext'

export function useUniversityScope() {
  return useContext(UniversityScopeContext)
}

export function universityPortalPath(basePath: string, path: string) {
  return `${basePath}${path === '/' ? '' : path}`
}
