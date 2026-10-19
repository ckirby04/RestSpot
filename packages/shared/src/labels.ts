// User-facing wording for enum values, shared so web and mobile say the same thing.
import type {
  AccessType,
  DayHours,
  EditKind,
  FeeType,
  ReportReason,
  ReportStatus,
  RoomDesignation,
  RoomLayout,
  TriState,
} from './types.ts'

export const ACCESS_LABELS: Record<AccessType, string> = {
  public: 'Open to the public',
  customers_only: 'Customers only',
  restricted: 'Restricted (e.g. employees, students)',
}

export const ACCESS_SHORT_LABELS: Record<AccessType, string> = {
  public: 'Public',
  customers_only: 'Customers only',
  restricted: 'Restricted',
}

export const FEE_LABELS: Record<FeeType, string> = {
  free: 'Free',
  paid: 'Paid',
  unknown: 'Fee unknown',
}

export const DESIGNATION_LABELS: Record<RoomDesignation, string> = {
  mens: 'Men’s',
  womens: 'Women’s',
  all_gender: 'All-gender',
}

export const LAYOUT_LABELS: Record<RoomLayout, string> = {
  single_user: 'Single-user',
  multi_stall: 'Multi-stall',
  family: 'Family room',
}

export const TRI_STATE_LABELS: Record<TriState, string> = {
  yes: 'Yes',
  no: 'No',
  unknown: 'Not sure',
}

export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  closed: 'Closed or no longer exists',
  incorrect_info: 'Information is wrong',
  duplicate: 'Duplicate listing',
  inappropriate: 'Inappropriate content',
}

export const REPORT_STATUS_LABELS: Record<ReportStatus, string> = {
  open: 'Open',
  resolved: 'Resolved',
  dismissed: 'Dismissed',
}

export const EDIT_KIND_LABELS: Record<EditKind, string> = {
  create: 'Added',
  update: 'Edited',
  confirm: 'Confirmed accurate',
  rollback: 'Rolled back',
  merge: 'Merged into another listing',
  delete: 'Removed',
  restore: 'Restored',
}

export const FIELD_LABELS: Record<string, string> = {
  name: 'Name',
  lat: 'Location',
  lng: 'Location',
  time_zone: 'Time zone',
  access_type: 'Access',
  fee: 'Fee',
  key_required: 'Key or code',
  hours: 'Hours',
  notes: 'Notes',
  rooms: 'Rooms',
  source: 'Source',
  verified: 'Verified',
  deleted_at: 'Removed',
  merged_into: 'Merged into',
  rolled_back_to: 'Rolled back to',
}

export const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const

/** "9:00 AM" from "09:00". */
export function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  const suffix = h < 12 ? 'AM' : 'PM'
  const hour = h % 12 === 0 ? 12 : h % 12
  return `${hour}:${String(m).padStart(2, '0')} ${suffix}`
}

export function formatDayHours(day: DayHours): string {
  switch (day.kind) {
    case 'unknown':
      return 'Hours unknown'
    case 'closed':
      return 'Closed'
    case 'all_day':
      return 'Open 24 hours'
    case 'open':
      return `${formatTime(day.open)} – ${formatTime(day.close)}`
  }
}
