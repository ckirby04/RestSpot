import type { Coordinates } from '@restspot/shared'

export type LocationError = 'denied' | 'unavailable' | 'timeout' | 'unsupported'

/** One-shot device location via the browser's location services (asks permission). */
export function getDeviceLocation(): Promise<Coordinates> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject('unsupported' satisfies LocationError)
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) =>
        reject(
          (err.code === err.PERMISSION_DENIED
            ? 'denied'
            : err.code === err.TIMEOUT
              ? 'timeout'
              : 'unavailable') satisfies LocationError,
        ),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    )
  })
}

export const LOCATION_ERROR_MESSAGES: Record<LocationError, string> = {
  denied: 'Location access is off. Search for an address instead, or allow location in your browser settings.',
  unavailable: 'Your location isn’t available right now. Search for an address instead.',
  timeout: 'Finding your location took too long. Try again or search for an address.',
  unsupported: 'This browser can’t share your location. Search for an address instead.',
}

export interface GeocodeResult {
  label: string
  /** e.g. "Old Main, Fayetteville" */
  shortLabel: string
  coordinates: Coordinates
}

/**
 * Address → coordinates via OpenStreetMap Nominatim (free, no key).
 * Usage policy: at most 1 request/second and no autocomplete, so only call this on submit.
 */
export async function geocodeAddress(query: string, signal?: AbortSignal): Promise<GeocodeResult[]> {
  const url = new URL('https://nominatim.openstreetmap.org/search')
  url.searchParams.set('format', 'jsonv2')
  url.searchParams.set('q', query)
  url.searchParams.set('limit', '5')
  url.searchParams.set('countrycodes', 'us')
  url.searchParams.set('addressdetails', '1')
  const res = await fetch(url, { signal, headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error('Address search is unavailable right now')
  const rows = (await res.json()) as {
    display_name: string
    name?: string
    lat: string
    lon: string
    address?: Record<string, string>
  }[]
  return rows.map((r) => ({
    label: r.display_name,
    shortLabel: shortPlaceLabel(r),
    coordinates: { lat: Number(r.lat), lng: Number(r.lon) },
  }))
}

function shortPlaceLabel(r: { display_name: string; name?: string; address?: Record<string, string> }): string {
  const a = r.address ?? {}
  const place = r.name || [a.house_number, a.road].filter(Boolean).join(' ') || r.display_name.split(',')[0]
  const city = a.city ?? a.town ?? a.village ?? a.hamlet ?? a.county
  return city && city !== place ? `${place}, ${city}` : place
}

export function isApplePlatform(): boolean {
  return /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent)
}
