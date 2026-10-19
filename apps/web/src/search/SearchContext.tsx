// Where we're searching from and with which filters. Survives navigation between
// the results list and detail pages, and page reloads within the tab.
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { LIMITS, type Coordinates, type SearchFilters } from '@restspot/shared'
import { getDeviceLocation, LOCATION_ERROR_MESSAGES, type LocationError } from '../lib/location.ts'

export interface SearchOrigin {
  coordinates: Coordinates
  label: string
  kind: 'device' | 'address' | 'map'
}

export const DEFAULT_FILTERS: SearchFilters = { radiusMiles: LIMITS.radiusDefaultMiles }

interface SearchState {
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

const STORAGE_KEY = 'restspot.search'
const SearchContext = createContext<SearchState | null>(null)

function load(): { origin: SearchOrigin | null; filters: SearchFilters } {
  try {
    const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? 'null')
    if (saved?.filters) return { origin: saved.origin ?? null, filters: { ...DEFAULT_FILTERS, ...saved.filters } }
  } catch {
    // Ignore unavailable or corrupt storage.
  }
  return { origin: null, filters: DEFAULT_FILTERS }
}

export function SearchProvider({ children }: { children: ReactNode }) {
  const [initial] = useState(load)
  const [origin, setOrigin] = useState<SearchOrigin | null>(initial.origin)
  const [filters, setFilters] = useState<SearchFilters>(initial.filters)
  const [deviceLocation, setDeviceLocation] = useState<Coordinates | null>(null)
  const [locating, setLocating] = useState(false)
  const [locationError, setLocationError] = useState<string | null>(null)

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ origin, filters }))
    } catch {
      // Ignore unavailable storage.
    }
  }, [origin, filters])

  const locateMe = useCallback(async () => {
    setLocating(true)
    setLocationError(null)
    try {
      const coordinates = await getDeviceLocation()
      setDeviceLocation(coordinates)
      setOrigin({ coordinates, label: 'Your location', kind: 'device' })
    } catch (e) {
      setLocationError(LOCATION_ERROR_MESSAGES[e as LocationError] ?? LOCATION_ERROR_MESSAGES.unavailable)
    } finally {
      setLocating(false)
    }
  }, [])

  // On first visit, try the device location (the browser asks permission).
  useEffect(() => {
    if (!initial.origin) void locateMe()
  }, [initial.origin, locateMe])

  return (
    <SearchContext.Provider
      value={{ origin, setOrigin, filters, setFilters, deviceLocation, locating, locationError, locateMe }}
    >
      {children}
    </SearchContext.Provider>
  )
}

export function useSearchState(): SearchState {
  const s = useContext(SearchContext)
  if (!s) throw new Error('useSearchState must be used inside SearchProvider')
  return s
}
