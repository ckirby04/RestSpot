// Where we're searching from and with which filters. Survives navigation between
// the results list and detail pages, and page reloads within the tab.
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import type { Coordinates, SearchFilters } from '@restspot/shared'
import { getDeviceLocation, LOCATION_ERROR_MESSAGES, type LocationError } from '../lib/location.ts'
import { DEFAULT_FILTERS, SearchContext, type SearchOrigin } from './useSearchState.ts'

const STORAGE_KEY = 'restspot.search'

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
  // On first visit we immediately ask for the device location (see below).
  const [locating, setLocating] = useState(!initial.origin)
  const [locationError, setLocationError] = useState<string | null>(null)

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ origin, filters }))
    } catch {
      // Ignore unavailable storage.
    }
  }, [origin, filters])

  // Ask the browser for the device location. State only changes once it answers.
  const locate = useCallback(
    () =>
      getDeviceLocation().then(
        (coordinates) => {
          setDeviceLocation(coordinates)
          setOrigin({ coordinates, label: 'Your location', kind: 'device' })
          setLocating(false)
        },
        (e: LocationError) => {
          setLocationError(LOCATION_ERROR_MESSAGES[e] ?? LOCATION_ERROR_MESSAGES.unavailable)
          setLocating(false)
        },
      ),
    [],
  )

  const locateMe = useCallback(() => {
    setLocating(true)
    setLocationError(null)
    return locate()
  }, [locate])

  // On first visit, try the device location (the browser asks permission).
  useEffect(() => {
    if (!initial.origin) void locate()
  }, [initial.origin, locate])

  return (
    <SearchContext.Provider
      value={{ origin, setOrigin, filters, setFilters, deviceLocation, locating, locationError, locateMe }}
    >
      {children}
    </SearchContext.Provider>
  )
}
