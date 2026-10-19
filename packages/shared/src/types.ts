// Core domain model. See docs/DECISIONS.md for the reasoning behind the
// location → rooms structure and tri-state amenities.

/** Crowdsourced facts: "nobody has said" is not the same as "no". */
export type TriState = 'yes' | 'no' | 'unknown'

export const ACCESS_TYPES = ['public', 'customers_only', 'restricted'] as const
export type AccessType = (typeof ACCESS_TYPES)[number]

export const FEE_TYPES = ['free', 'paid', 'unknown'] as const
export type FeeType = (typeof FEE_TYPES)[number]

export const ROOM_DESIGNATIONS = ['mens', 'womens', 'all_gender'] as const
export type RoomDesignation = (typeof ROOM_DESIGNATIONS)[number]

/** A family room is always all-gender. */
export const ROOM_LAYOUTS = ['single_user', 'multi_stall', 'family'] as const
export type RoomLayout = (typeof ROOM_LAYOUTS)[number]

export const DATA_SOURCES = ['user', 'osm', 'poi_inferred'] as const
export type DataSource = (typeof DATA_SOURCES)[number]

export const REPORT_REASONS = ['closed', 'incorrect_info', 'duplicate', 'inappropriate'] as const
export type ReportReason = (typeof REPORT_REASONS)[number]

export const USER_ROLES = ['user', 'admin'] as const
export type UserRole = (typeof USER_ROLES)[number]

export interface Coordinates {
  /** Decimal degrees, −90 to 90. */
  lat: number
  /** Decimal degrees, −180 to 180. */
  lng: number
}

/** Hours for one day. `close` earlier than `open` means the interval runs past midnight. */
export type DayHours =
  | { kind: 'unknown' }
  | { kind: 'closed' }
  | { kind: 'all_day' }
  | { kind: 'open'; open: string; close: string }

/** Index 0 = Sunday … 6 = Saturday, matching `Date.getDay()`. */
export type WeeklyHours = [DayHours, DayHours, DayHours, DayHours, DayHours, DayHours, DayHours]

export interface Room {
  id: string
  locationId: string
  designation: RoomDesignation
  layout: RoomLayout
  changingTable: TriState
  adaAccessible: TriState
}

export interface Location {
  id: string
  name: string
  coordinates: Coordinates
  /** IANA time zone of the restroom, e.g. "America/Chicago". Used for "open now". */
  timeZone: string
  accessType: AccessType
  fee: FeeType
  keyRequired: TriState
  hours: WeeklyHours
  notes: string | null
  rooms: Room[]
  source: DataSource
  /** False until a user confirms a seeded or newly added listing. */
  verified: boolean
  /** Average ratings rounded to one decimal place; null when there are no reviews. */
  avgOverall: number | null
  avgCleanliness: number | null
  reviewCount: number
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

export interface Review {
  id: string
  locationId: string
  overall: number
  cleanliness: number
  comment: string | null
  /** Reviewer chose to hide their display name. Admins can still see the author. */
  anonymous: boolean
  /** Null when anonymous (for non-admin viewers). */
  authorDisplayName: string | null
  createdAt: string
}

export interface Report {
  id: string
  locationId: string
  reason: ReportReason
  comment: string | null
  status: 'open' | 'resolved' | 'dismissed'
  createdAt: string
}

export interface SearchFilters {
  /** Miles, 0.1–25. */
  radiusMiles: number
  adaAccessible?: boolean
  changingTable?: boolean
  allGender?: boolean
  family?: boolean
  singleUser?: boolean
  publicOnly?: boolean
  freeOnly?: boolean
  openNow?: boolean
  /** 1–5. */
  minCleanliness?: number
}
