import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

export type AppRole = 'super_admin' | 'university_admin'
export type UserProfile = { id: string; role: AppRole; university_id: string | null; display_name: string; is_active: boolean }
type AuthState = { session: Session | null; profile: UserProfile | null; loading: boolean; error: string | null }
type AuthContextValue = AuthState & { signOut: () => Promise<void>; refreshProfile: () => Promise<void> }

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ session: null, profile: null, loading: true, error: null })

  useEffect(() => {
    if (!supabase) {
      setState({ session: null, profile: null, loading: false, error: null })
      return
    }

    let active = true
    async function loadProfile(session: Session | null) {
      if (!session) {
        if (active) setState({ session: null, profile: null, loading: false, error: null })
        return
      }
      if (active) setState((current) => ({ ...current, session, loading: true, error: null }))
      const { data, error } = await supabase!
        .from('user_profiles')
        .select('id, role, university_id, display_name, is_active')
        .eq('id', session.user.id)
        .maybeSingle()
      if (!active) return
      if (error) {
        setState({ session, profile: null, loading: false, error: error.message })
        return
      }
      if (!data || !data.is_active) {
        setState({ session, profile: null, loading: false, error: null })
        return
      }
      setState({ session, profile: data as UserProfile, loading: false, error: null })
    }

    supabase.auth.getSession().then(({ data, error }) => {
      if (error) {
        if (active) setState({ session: null, profile: null, loading: false, error: error.message })
      } else {
        void loadProfile(data.session)
      }
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      window.setTimeout(() => void loadProfile(session), 0)
    })
    return () => { active = false; subscription.unsubscribe() }
  }, [])

  async function signOut() {
    if (supabase) await supabase.auth.signOut()
    setState({ session: null, profile: null, loading: false, error: null })
  }

  async function refreshProfile() {
    if (!supabase || !state.session) return
    const { data, error } = await supabase.from('user_profiles').select('id, role, university_id, display_name, is_active').eq('id', state.session.user.id).maybeSingle()
    if (error) setState((current) => ({ ...current, error: error.message }))
    else if (!data || !data.is_active) setState((current) => ({ ...current, profile: null }))
    else setState((current) => ({ ...current, profile: data as UserProfile, error: null }))
  }

  return <AuthContext.Provider value={{ ...state, signOut, refreshProfile }}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}
