// Convert database rows (snake_case JSON from RPCs) into domain objects, and back.
// Shared by every API implementation so they return identical shapes.
import type {
  AdminReport,
  AdminUser,
  LocationEdit,
  MyContributions,
  PossibleDuplicate,
  Profile,
  Restroom,
  RestroomDetail,
  RestroomResult,
  Review,
  Room,
  SearchFilters,
  WeeklyHours,
} from './types.ts'
import type { LocationInput } from './validation.ts'

type Row = Record<string, any>

const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v))
const iso = (v: unknown): string => (v instanceof Date ? v.toISOString() : String(v))
const isoOrNull = (v: unknown): string | null => (v === null || v === undefined ? null : iso(v))

function mapRoom(r: Row): Room {
  return {
    id: r.id,
    designation: r.designation,
    layout: r.layout,
    changingTable: r.changing_table,
    adaAccessible: r.ada_accessible,
  }
}

function mapRestroom(r: Row): Restroom {
  return {
    id: r.id,
    name: r.name,
    coordinates: { lat: Number(r.lat), lng: Number(r.lng) },
    timeZone: r.time_zone,
    accessType: r.access_type,
    fee: r.fee,
    keyRequired: r.key_required,
    hours: r.hours as WeeklyHours,
    notes: r.notes ?? null,
    rooms: ((r.rooms ?? []) as Row[]).map(mapRoom),
    source: r.source,
    verified: Boolean(r.verified),
    lastConfirmedAt: isoOrNull(r.last_confirmed_at),
    updatedAt: iso(r.updated_at),
    avgOverall: num(r.avg_overall),
    avgCleanliness: num(r.avg_cleanliness),
    reviewCount: Number(r.review_count ?? 0),
    isOpen: r.is_open ?? null,
  }
}

export function mapSearchResult(r: Row): RestroomResult {
  return { ...mapRestroom(r), distanceMeters: Number(r.distance_meters) }
}

export function mapRestroomDetail(r: Row): RestroomDetail {
  return {
    ...mapRestroom(r),
    createdAt: iso(r.created_at),
    deletedAt: isoOrNull(r.deleted_at),
    mergedInto: r.merged_into ?? null,
    isFavorite: Boolean(r.is_favorite),
    createdByMe: Boolean(r.created_by_me),
  }
}

export function mapReview(r: Row): Review {
  return {
    id: r.id,
    overall: Number(r.overall),
    cleanliness: Number(r.cleanliness),
    comment: r.comment ?? null,
    anonymous: Boolean(r.anonymous),
    hidden: Boolean(r.hidden),
    authorDisplayName: r.author_display_name ?? null,
    authorId: r.author_id ?? null,
    isMine: Boolean(r.is_mine),
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
  }
}

export function mapEdit(r: Row): LocationEdit {
  return {
    id: Number(r.id),
    kind: r.kind,
    changes: r.changes ?? {},
    editorDisplayName: r.editor_display_name ?? null,
    createdAt: iso(r.created_at),
  }
}

export function mapProfile(r: Row): Profile {
  return {
    id: r.id,
    displayName: r.display_name,
    role: r.role,
    suspendedUntil: isoOrNull(r.suspended_until),
    suspensionReason: r.suspension_reason ?? null,
    createdAt: iso(r.created_at),
  }
}

export function mapContributions(r: Row | null): MyContributions {
  return {
    reviews: ((r?.reviews ?? []) as Row[]).map((v) => ({
      id: v.id,
      locationId: v.location_id,
      locationName: v.location_name,
      overall: Number(v.overall),
      cleanliness: Number(v.cleanliness),
      comment: v.comment ?? null,
      anonymous: Boolean(v.anonymous),
      hidden: Boolean(v.hidden),
      createdAt: iso(v.created_at),
    })),
    edits: ((r?.edits ?? []) as Row[]).map((e) => ({
      id: Number(e.id),
      locationId: e.location_id,
      locationName: e.location_name,
      kind: e.kind,
      changedFields: e.changed_fields ?? [],
      createdAt: iso(e.created_at),
    })),
  }
}

export function mapDuplicate(r: Row): PossibleDuplicate {
  return {
    id: r.id,
    name: r.name,
    distanceMeters: Number(r.distance_meters),
    similarity: Number(r.similarity),
  }
}

export function mapAdminReport(r: Row): AdminReport {
  return {
    id: r.id,
    locationId: r.location_id,
    locationName: r.location_name,
    locationDeleted: Boolean(r.location_deleted),
    reason: r.reason,
    comment: r.comment ?? null,
    duplicateOf: r.duplicate_of ?? null,
    duplicateOfName: r.duplicate_of_name ?? null,
    status: r.status,
    reporterId: r.reporter_id ?? null,
    reporterDisplayName: r.reporter_display_name ?? null,
    createdAt: iso(r.created_at),
    resolvedAt: isoOrNull(r.resolved_at),
  }
}

export function mapAdminUser(r: Row): AdminUser {
  return {
    id: r.id,
    displayName: r.display_name,
    email: r.email ?? null,
    role: r.role,
    suspendedUntil: isoOrNull(r.suspended_until),
    suspensionReason: r.suspension_reason ?? null,
    createdAt: iso(r.created_at),
    reviewCount: Number(r.review_count ?? 0),
    editCount: Number(r.edit_count ?? 0),
  }
}

/** Named arguments for the search_restrooms RPC. */
export function searchArgs(origin: { lat: number; lng: number }, f: SearchFilters) {
  return {
    near_lat: origin.lat,
    near_lng: origin.lng,
    radius_miles: f.radiusMiles,
    ada_accessible: Boolean(f.adaAccessible),
    changing_table: Boolean(f.changingTable),
    all_gender: Boolean(f.allGender),
    family: Boolean(f.family),
    single_user: Boolean(f.singleUser),
    public_only: Boolean(f.publicOnly),
    free_only: Boolean(f.freeOnly),
    open_now: Boolean(f.openNow),
    min_cleanliness: f.minCleanliness ?? null,
  }
}

/** Payload for the save_location RPC. */
export function locationPayload(input: LocationInput & { timeZone: string }, id?: string) {
  return {
    ...(id ? { id } : {}),
    name: input.name.trim(),
    lat: input.coordinates.lat,
    lng: input.coordinates.lng,
    time_zone: input.timeZone,
    access_type: input.accessType,
    fee: input.fee,
    key_required: input.keyRequired,
    hours: input.hours,
    notes: input.notes?.trim() || null,
    rooms: input.rooms.map((r) => ({
      designation: r.designation,
      layout: r.layout,
      changing_table: r.changingTable,
      ada_accessible: r.adaAccessible,
    })),
  }
}
