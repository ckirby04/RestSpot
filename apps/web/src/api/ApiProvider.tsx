import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { RestSpotApi } from '@restspot/shared'

export type AppApi = RestSpotApi & { resetDatabase?: () => Promise<void> }

async function createApi(): Promise<AppApi> {
  const url = import.meta.env.VITE_SUPABASE_URL
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
  const forceLocal = import.meta.env.VITE_BACKEND === 'local'

  if (url && anonKey && !forceLocal) {
    const { createSupabaseApi } = await import('@restspot/shared/supabase')
    return createSupabaseApi({ url, anonKey, redirectTo: window.location.origin })
  }
  if (import.meta.env.DEV || forceLocal) {
    const { createLocalApi } = await import('../dev/localBackend.ts')
    return createLocalApi()
  }
  throw new Error('RestSpot is not configured: set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.')
}

// One backend per page load. (StrictMode runs effects twice in dev, and two PGlite
// instances on the same IndexedDB database corrupt each other.)
let apiPromise: Promise<AppApi> | null = null
function getApi(): Promise<AppApi> {
  apiPromise ??= createApi()
  return apiPromise
}

const ApiContext = createContext<AppApi | null>(null)

export function ApiProvider({ children }: { children: ReactNode }) {
  const [api, setApi] = useState<AppApi | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getApi().then(
      (a) => !cancelled && setApi(a),
      (e: unknown) => !cancelled && setError(e instanceof Error ? e.message : String(e)),
    )
    return () => {
      cancelled = true
    }
  }, [])

  if (error) {
    return (
      <div className="splash" role="alert">
        <h1>RestSpot couldn’t start</h1>
        <p>{error}</p>
      </div>
    )
  }
  if (!api) {
    return (
      <div className="splash" role="status" aria-live="polite">
        <h1>RestSpot</h1>
        <p>Loading…</p>
      </div>
    )
  }
  return <ApiContext.Provider value={api}>{children}</ApiContext.Provider>
}

export function useApi(): AppApi {
  const api = useContext(ApiContext)
  if (!api) throw new Error('useApi must be used inside ApiProvider')
  return api
}
