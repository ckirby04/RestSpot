import { createContext, useContext } from 'react'
import type { RestSpotApi } from '@restspot/shared'

/** The API, plus dev-only extras the local backend provides. */
export type AppApi = RestSpotApi & { resetDatabase?: () => Promise<void> }

export const ApiContext = createContext<AppApi | null>(null)

/** The backend API. Available everywhere below <ApiProvider>. */
export function useApi(): AppApi {
  const api = useContext(ApiContext)
  if (!api) throw new Error('useApi must be used inside ApiProvider')
  return api
}
