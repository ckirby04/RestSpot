import tzLookup from '@photostructure/tz-lookup'
import type { Coordinates } from './types.ts'

/** IANA time zone at a point, e.g. "America/Chicago". Falls back to UTC offshore. */
export function timeZoneAt({ lat, lng }: Coordinates): string {
  try {
    return tzLookup(lat, lng)
  } catch {
    return 'UTC'
  }
}

const METERS_PER_MILE = 1609.344

/** Human-friendly distance in US units: feet under 0.1 mi, otherwise miles. */
export function formatDistance(meters: number): string {
  const miles = meters / METERS_PER_MILE
  if (miles < 0.1) return `${Math.max(10, Math.round((meters * 3.28084) / 10) * 10)} ft`
  if (miles < 10) return `${miles.toFixed(1)} mi`
  return `${Math.round(miles)} mi`
}

/** Great-circle distance in meters. */
export function distanceMeters(a: Coordinates, b: Coordinates): number {
  const R = 6_371_008.8
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/**
 * Deep link to turn-by-turn directions in the device's maps app
 * (Apple Maps on Apple devices, Google Maps elsewhere).
 */
export function directionsUrl({ lat, lng }: Coordinates, platform: 'apple' | 'other'): string {
  const dest = `${lat.toFixed(6)},${lng.toFixed(6)}`
  return platform === 'apple'
    ? `https://maps.apple.com/?daddr=${dest}&dirflg=w`
    : `https://www.google.com/maps/dir/?api=1&destination=${dest}`
}
