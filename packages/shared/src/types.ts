// Core domain model. See docs/DECISIONS.md for the reasoning behind the
// location → rooms structure and tri-state amenities.

/** Crowdsourced facts: "nobody has said" is not the same as "no". */
export const TRI_STATES = ['yes', 'no', 'unknown'] as const
export type TriState = (typeof TRI_STATES)[number]

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

export const REPORT_STATUSES = ['open', 'resolved', 'dismissed'] as const
export type ReportStatus = (typeof REPORT_STATUSES)[number]

export const USER_ROLES = ['user', 'admin'] as const
export type UserRole = (typeof USER_ROLES)[number]

export const EDIT_KINDS = ['create', 'update', 'confirm', 'rollback', 'merge', 'delete', 'restore'] as const
export type EditKind = (typeof EDIT_KINDS)[number]

export interface Coordinates {
  /** Decimal degrees, −90 to 90. */
  lat: number
  /** Decimal degrees, −180 to 180. */
  lng: number
}

/** Hours for one day. `close` earlier than `open` means the interval runs past midnight. */
export type DayHours =
  { kind: 'unknown' } | { kind: 'closed' } | { kind: 'all_day' } | { kind: 'open'; open: string; close: string }

/** Index 0 = Sunday … 6 = Saturday, matching `Date.getDay()`. */
export type WeeklyHours = [DayHours, DayHours, DayHours, DayHours, DayHours, DayHours, DayHours]

export interface Room {
  id?: string
  designation: RoomDesignation
  layout: RoomLayout
  changingTable: TriState
  adaAccessible: TriState
}

/** A map pin: one place holding one or more rooms. */
export interface Restroom {
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
  lastConfirmedAt: string | null
  updatedAt: string
  /** Averages rounded to one decimal place; null when there are no reviews. */
  avgOverall: number | null
  avgCleanliness: number | null
  reviewCount: number
  /** Null when today's hours are unknown. */
  isOpen: boolean | null
}

export interface RestroomResult extends Restroom {
  distanceMeters: number
}

export interface RestroomDetail extends Restroom {
  createdAt: string
  /** Set when an admin removed the listing (only admins can see removed listings). */
  deletedAt: string | null
  mergedInto: string | null
  isFavorite: boolean
  createdByMe: boolean
}

export interface Review {
  id: string
  overall: number
  cleanliness: number
  comment: string | null
  /** Reviewer chose to hide their display name. Admins can still see the author. */
  anonymous: boolean
  /** Hidden by an admin; only admins see hidden reviews. */
  hidden: boolean
  /** Null when anonymous (unless the viewer is an admin). */
  authorDisplayName: string | null
  /** Only provided to admins. */
  authorId: string | null
  isMine: boolean
  createdAt: string
  updatedAt: string
}

export interface LocationEdit {
  id: number
  kind: EditKind
  changes: Record<string, { old: unknown; new: unknown }>
  editorDisplayName: string | null
  createdAt: string
}

export interface Profile {
  id: string
  displayName: string
  role: UserRole
  suspendedUntil: string | null
  suspensionReason: string | null
  createdAt: string
}

export interface MyContributions {
  reviews: {
    id: string
    locationId: string
    locationName: string
    overall: number
    cleanliness: number
    comment: string | null
    anonymous: boolean
    hidden: boolean
    createdAt: string
  }[]
  edits: {
    id: number
    locationId: string
    locationName: string
    kind: EditKind
    changedFields: string[]
    createdAt: string
  }[]
}

export interface PossibleDuplicate {
  id: string
  name: string
  distanceMeters: number
  similarity: number
}

export interface AdminReport {
  id: string
  locationId: string
  locationName: string
  locationDeleted: boolean
  reason: ReportReason
  comment: string | null
  duplicateOf: string | null
  duplicateOfName: string | null
  status: ReportStatus
  reporterId: string | null
  reporterDisplayName: string | null
  createdAt: string
  resolvedAt: string | null
}

export interface AdminUser {
  id: string
  displayName: string
  email: string | null
  role: UserRole
  suspendedUntil: string | null
  suspensionReason: string | null
  createdAt: string
  reviewCount: number
  editCount: number
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
  minCleanliness?: number | null
}
