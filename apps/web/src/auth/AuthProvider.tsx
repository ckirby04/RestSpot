import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { Profile, Session } from '@restspot/shared'
import { useApi } from '../api/ApiProvider.tsx'

interface AuthState {
  /** Undefined while the initial session is loading. */
  session: Session | null | undefined
  profile: Profile | null
  /** True while the signed-in user's profile (and so their role) is still loading. */
  profileLoading: boolean
  isAdmin: boolean
  /** Signed in and not suspended. */
  canContribute: boolean
  isSuspended: boolean
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const api = useApi()
  const queryClient = useQueryClient()
  const [session, setSession] = useState<Session | null | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    api.getSession().then((s) => !cancelled && setSession(s))
    const unsubscribe = api.onSessionChange((s) => {
      setSession(s)
      // Everything user-specific (favorites, "is mine", admin data) must refetch.
      void queryClient.invalidateQueries()
    })
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [api, queryClient])

  const { data: profile = null, isPending: profilePending } = useQuery({
    queryKey: ['profile', session?.userId ?? null],
    queryFn: () => api.getMyProfile(),
    enabled: Boolean(session),
  })

  const isSuspended = Boolean(profile?.suspendedUntil && new Date(profile.suspendedUntil) > new Date())
  const value: AuthState = {
    session,
    profile: session ? profile : null,
    profileLoading: Boolean(session) && profilePending,
    isAdmin: Boolean(session && profile?.role === 'admin'),
    canContribute: Boolean(session && profile && !isSuspended),
    isSuspended,
  }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const auth = useContext(AuthContext)
  if (!auth) throw new Error('useAuth must be used inside AuthProvider')
  return auth
}
