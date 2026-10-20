// Map OpenStreetMap elements to RestSpot listings. Pure functions, unit-tested.
//
// Only facts present in OSM are imported. Anything OSM doesn't say stays
// "unknown" (or, for rooms, absent) rather than being guessed.
import type { AccessType, DayHours, FeeType, RoomDesignation, TriState, WeeklyHours } from '@restspot/shared'

export interface OsmElement {
  type: 'node' | 'way' | 'relation'
  id: number
  lat?: number
  lon?: number
  center?: { lat: number; lon: number }
  tags?: Record<string, string>
}

export interface ImportedRoom {
  designation: RoomDesignation
  layout: 'single_user' | 'multi_stall' | 'family'
  changing_table: TriState
  ada_accessible: TriState
}

export interface ImportedListing {
  sourceRef: string
  source: 'osm' | 'poi_inferred'
  name: string
  lat: number
  lng: number
  accessType: AccessType
  fee: FeeType
  keyRequired: TriState
  hours: WeeklyHours
  notes: string | null
  rooms: ImportedRoom[]
}

const yes = (v: string | undefined) => v === 'yes' || v === 'designated'
const triState = (v: string | undefined): TriState =>
  v === undefined ? 'unknown' : v === 'no' ? 'no' : yes(v) || v === 'limited' ? 'yes' : 'unknown'

/** Turn one OSM element into a listing, or null if it isn't usable. */
export function toListing(el: OsmElement): ImportedListing | null {
  const tags = el.tags ?? {}
  const lat = el.lat ?? el.center?.lat
  const lng = el.lon ?? el.center?.lon
  if (lat === undefined || lng === undefined) return null

  const isToiletsFeature = tags.amenity === 'toilets'
  // Other POIs (fuel, cafes, libraries…) are only imported when OSM says they have toilets.
  if (!isToiletsFeature && !yes(tags.toilets)) return null

  // For a POI with toilets, restroom details live in `toilets:*` tags.
  const t = (key: string) => (isToiletsFeature ? tags[key] : tags[`toilets:${key}`])

  const accessTag = t('access') ?? tags.access
  if (accessTag === 'no' || accessTag === 'private') return null
  const accessType: AccessType =
    accessTag === 'customers'
      ? 'customers_only'
      : accessTag === 'permissive' || accessTag === 'yes' || accessTag === 'public'
        ? 'public'
        : accessTag === 'permit' || accessTag === 'destination' || accessTag === 'delivery'
          ? 'restricted'
          : isToiletsFeature
            ? 'public'
            : 'customers_only'

  const feeTag = t('fee') ?? (isToiletsFeature ? tags.fee : undefined)
  const fee: FeeType = feeTag === 'no' ? 'free' : feeTag && feeTag !== 'no' ? 'paid' : 'unknown'

  const wheelchair = triState(isToiletsFeature ? tags.wheelchair : tags['toilets:wheelchair'])
  const changing = triState(tags.changing_table ?? tags['toilets:changing_table'] ?? tags.diaper)

  const rooms: ImportedRoom[] = []
  const room = (designation: RoomDesignation, layout: ImportedRoom['layout'] = 'multi_stall') =>
    rooms.push({ designation, layout, changing_table: changing, ada_accessible: wheelchair })
  const unisex = yes(t('unisex') ?? tags.unisex) || yes(tags['gender_segregated'] === 'no' ? 'yes' : undefined)
  if (yes(t('male') ?? tags.male)) room('mens')
  if (yes(t('female') ?? tags.female)) room('womens')
  if (unisex) room('all_gender', 'single_user')
  if (yes(tags.family) || yes(tags['toilets:family'])) room('all_gender', 'family')

  const baseName = tags.name ?? tags.brand
  const name = isToiletsFeature ? (tags.name ?? 'Public restroom') : baseName ? baseName : null
  if (!name) return null

  const notes = [tags.description, tags['toilets:description'], tags.note]
    .filter((s): s is string => Boolean(s && s.trim()))
    .join(' ')
    .slice(0, 500)

  return {
    sourceRef: `osm:${el.type}/${el.id}`,
    source: 'osm',
    name: name.slice(0, 100),
    lat,
    lng,
    accessType,
    fee,
    keyRequired: tags['toilets:key'] === 'yes' || tags.locked === 'yes' ? 'yes' : 'unknown',
    hours: parseOpeningHours(t('opening_hours') ?? tags.opening_hours),
    notes: notes || null,
    rooms,
  }
}

const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const UNKNOWN: WeeklyHours = Array(7).fill({ kind: 'unknown' }) as WeeklyHours

/**
 * Parse the common subset of OSM `opening_hours`: "24/7", and rules like
 * "Mo-Fr 08:00-17:00; Sa,Su 10:00-16:00; PH off". Anything more complex
 * (month ranges, multiple intervals per day, sunrise…) returns all-unknown.
 */
export function parseOpeningHours(value: string | undefined): WeeklyHours {
  if (!value) return UNKNOWN
  const v = value.trim()
  if (v === '24/7') return Array(7).fill({ kind: 'all_day' }) as WeeklyHours

  const week: DayHours[] = Array(7).fill({ kind: 'unknown' })
  for (const raw of v.split(';')) {
    const rule = raw.trim()
    if (!rule || /^PH\b/.test(rule)) continue
    const m = rule.match(/^([A-Za-z,\- ]+?)\s+(off|closed|24:00|00:00-24:00|\d{1,2}:\d{2}-\d{1,2}:\d{2})$/)
    if (!m) return UNKNOWN
    const days = parseDays(m[1])
    if (!days) return UNKNOWN
    const time = m[2]
    let hours: DayHours
    if (time === 'off' || time === 'closed') hours = { kind: 'closed' }
    else if (time === '24:00' || time === '00:00-24:00') hours = { kind: 'all_day' }
    else {
      const [open, close] = time.split('-').map(normalizeTime)
      if (!open || !close) return UNKNOWN
      hours = { kind: 'open', open, close: close === '24:00' ? '23:59' : close }
    }
    for (const d of days) week[d] = hours
  }
  return week as WeeklyHours
}

function parseDays(spec: string): number[] | null {
  const out: number[] = []
  for (const part of spec.split(',').map((s) => s.trim())) {
    const range = part.split('-').map((s) => DAYS.indexOf(s.trim()))
    if (range.some((i) => i < 0)) return null
    if (range.length === 1) out.push(range[0])
    else if (range.length === 2) {
      // Ranges can wrap the week, e.g. Fr-Mo.
      for (let i = range[0]; ; i = (i + 1) % 7) {
        out.push(i)
        if (i === range[1]) break
      }
    } else return null
  }
  return out
}

function normalizeTime(t: string): string | null {
  const m = t.match(/^(\d{1,2}):(\d{2})$/)
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 24 || min > 59) return null
  return `${String(h).padStart(2, '0')}:${m[2]}`
}

/** Overpass QL for restrooms and POIs with toilets inside a bounding box (S, W, N, E). */
export function overpassQuery(bbox: [number, number, number, number]): string {
  const b = bbox.join(',')
  return `
[out:json][timeout:120];
(
  nwr["amenity"="toilets"](${b});
  nwr["toilets"="yes"](${b});
);
out center tags;
`.trim()
}

// ---------------------------------------------------------------------------
// "Likely" restrooms: real OSM places of kinds that almost always have one.
// Imported as source 'poi_inferred' and unverified, with no room details, so
// users see them as unconfirmed until someone checks.
// ---------------------------------------------------------------------------

/** Chains whose US locations nearly all have customer restrooms. Matched against brand/name. */
export const LIKELY_CHAINS = [
  "McDonald's",
  'Starbucks',
  'Chick-fil-A',
  "Wendy's",
  'Burger King',
  'Taco Bell',
  'Sonic Drive-In',
  'Panera Bread',
  'Subway',
  "Arby's",
  'Whataburger',
  'Panda Express',
  'Chipotle',
  "Dunkin'",
  'Walmart',
  'Target',
  'Costco',
  "Love's",
  'Pilot',
  'Flying J',
  "Casey's",
  'QuikTrip',
  'Buc-ee’s',
]

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
const CHAIN_KEYS = new Set(LIKELY_CHAINS.map(normalize))

export function isLikelyChain(tags: Record<string, string>): boolean {
  return [tags.brand, tags.name].some((n) => n !== undefined && CHAIN_KEYS.has(normalize(n)))
}

/** A listing for a place that very likely has a restroom, or null. Skips places already tagged with toilets. */
export function toLikelyListing(el: OsmElement): ImportedListing | null {
  const tags = el.tags ?? {}
  const lat = el.lat ?? el.center?.lat
  const lng = el.lon ?? el.center?.lon
  if (lat === undefined || lng === undefined) return null
  if (tags.amenity === 'toilets' || tags.toilets !== undefined) return null // handled by toListing (or toilets=no)

  let accessType: AccessType
  let label: string | undefined
  if (tags.highway === 'rest_area' || tags.highway === 'services') {
    accessType = 'public'
    label = tags.name ?? (tags.highway === 'rest_area' ? 'Rest area' : 'Travel services')
  } else if (tags.amenity === 'library' && tags.access !== 'private') {
    accessType = 'public'
    label = tags.name
  } else if (tags.shop === 'mall') {
    accessType = 'public'
    label = tags.name
  } else if (
    tags.amenity === 'fuel' ||
    ((tags.amenity === 'fast_food' ||
      tags.amenity === 'cafe' ||
      tags.shop === 'supermarket' ||
      tags.shop === 'department_store') &&
      isLikelyChain(tags))
  ) {
    accessType = 'customers_only'
    label = tags.brand ?? tags.name
  } else {
    return null
  }
  if (!label) return null

  const street = [tags['addr:housenumber'], tags['addr:street']].filter(Boolean).join(' ')
  const name = street && (tags.brand || !tags.name) ? `${label} — ${street}` : label
  return {
    sourceRef: `osm:${el.type}/${el.id}`,
    source: 'poi_inferred',
    name: name.slice(0, 100),
    lat,
    lng,
    accessType,
    fee: tags.highway === 'rest_area' ? 'free' : 'unknown',
    keyRequired: 'unknown',
    // The business's hours are a reasonable proxy when the restroom is inside it.
    hours: parseOpeningHours(tags.opening_hours),
    notes: null,
    rooms: [],
  }
}

export function overpassLikelyQuery(bbox: [number, number, number, number]): string {
  const b = bbox.join(',')
  return `
[out:json][timeout:180];
(
  nwr["highway"~"^(rest_area|services)$"](${b});
  nwr["amenity"="library"](${b});
  nwr["shop"="mall"](${b});
  nwr["amenity"="fuel"](${b});
  nwr["amenity"~"^(fast_food|cafe)$"]["brand"](${b});
  nwr["shop"~"^(supermarket|department_store)$"]["brand"](${b});
);
out center tags;
`.trim()
}
