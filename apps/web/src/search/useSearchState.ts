import { createContext, useContext } from 'react'
import { LIMITS, type Coordinates, type SearchFilters } from '@restspot/shared'

export interface SearchOrigin {
  coordinates: Coordinates
  label: string
  kind: 'device' | 'address' | 'map'
}

export const DEFAULT_FILTERS: SearchFilters = { radiusMiles: LIMITS.radiusDefaultMiles }

export interface SearchState {
  origin: SearchOrigin | null
  setOrigin(origin: SearchOrigin): void
  filters: SearchFilters
  setFilters(filters: SearchFilters): void
  /** Last known device position, if the user granted location access. */
  deviceLocation: Coordinates | null
  locating: boolean
  locationError: string | null
  locateMe(): Promise<void>
}

export const SearchContext = createContext<SearchState | null>(null)

/** Where we're searching from and with which filters. Available everywhere below <SearchProvider>. */
export function useSearchState(): SearchState {
  const s = useContext(SearchContext)
  if (!s) throw new Error('useSearchState must be used inside SearchProvider')
  return s
}
