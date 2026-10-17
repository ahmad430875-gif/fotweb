import { createContext } from 'react'

export type UniversityScope = { universityId: string; basePath: string }

export const UniversityScopeContext = createContext<UniversityScope | null>(null)
