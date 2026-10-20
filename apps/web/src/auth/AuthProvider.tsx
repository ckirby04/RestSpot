import { useEffect, useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { Session } from '@restspot/shared'
import { useApi } from '../api/useApi.ts'
import { useNow } from '../lib/useNow.ts'
import { AuthContext, type AuthState } from './useAuth.ts'

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

  const now = useNow()
  const isSuspended = Boolean(profile?.suspendedUntil && new Date(profile.suspendedUntil) > now)
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
