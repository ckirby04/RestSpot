import { createContext, useContext } from 'react'
import type { Profile, Session } from '@restspot/shared'

export interface AuthState {
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

export const AuthContext = createContext<AuthState | null>(null)

/** The current user's session, profile, and permissions. Available everywhere below <AuthProvider>. */
export function useAuth(): AuthState {
  const auth = useContext(AuthContext)
  if (!auth) throw new Error('useAuth must be used inside AuthProvider')
  return auth
}
