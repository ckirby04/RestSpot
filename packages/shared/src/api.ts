// The client-facing API. Every client (web now, Expo later) talks to the backend
// only through this interface, so swapping backends never touches UI code.
import type {
  AdminReport,
  AdminUser,
  Coordinates,
  LocationEdit,
  MyContributions,
  PossibleDuplicate,
  Profile,
  ReportStatus,
  RestroomDetail,
  RestroomResult,
  Review,
  SearchFilters,
} from './types.ts'
import type { LocationInput, ReportInput, ReviewInput } from './validation.ts'

export interface Session {
  userId: string
  email: string | null
}

export type OAuthProvider = 'google' | 'apple'

export type SignUpResult =
  /** Signed in immediately. */
  | { status: 'signed_in' }
  /** Supabase sent a confirmation email; the user must click it before signing in. */
  | { status: 'confirm_email' }

export interface RestSpotApi {
  /** Human-readable name of the backend, shown in dev tooling. */
  readonly backendName: string

  // Auth
  getSession(): Promise<Session | null>
  /** Calls `listener` whenever the user signs in or out. Returns an unsubscribe function. */
  onSessionChange(listener: (session: Session | null) => void): () => void
  signInWithPassword(email: string, password: string): Promise<void>
  signUp(email: string, password: string, displayName: string): Promise<SignUpResult>
  signInWithOAuth(provider: OAuthProvider): Promise<void>
  sendPasswordReset(email: string): Promise<void>
  /** Sets a new password for the signed-in user (e.g. after a reset link). */
  updatePassword(newPassword: string): Promise<void>
  signOut(): Promise<void>

  // Account
  getMyProfile(): Promise<Profile | null>
  updateDisplayName(displayName: string): Promise<void>
  deleteMyAccount(): Promise<void>
  getMyContributions(): Promise<MyContributions>

  // Listings
  searchRestrooms(origin: Coordinates, filters: SearchFilters): Promise<RestroomResult[]>
  getRestroom(id: string): Promise<RestroomDetail | null>
  getHistory(id: string): Promise<LocationEdit[]>
  findPossibleDuplicates(at: Coordinates, name: string, excludeId?: string): Promise<PossibleDuplicate[]>
  /** Creates a listing (no id) or updates one (with id). Returns the listing id. */
  saveRestroom(input: LocationInput & { timeZone: string }, id?: string): Promise<string>
  confirmRestroom(id: string): Promise<void>
  /** Calls `listener` when any listing changes, so open views can refresh. */
  onRestroomsChanged(listener: () => void): () => void

  // Reviews
  getReviews(restroomId: string): Promise<Review[]>
  /** Creates or replaces the current user's review of a restroom. */
  saveMyReview(restroomId: string, input: ReviewInput): Promise<void>
  deleteMyReview(restroomId: string): Promise<void>

  // Reports & favorites
  fileReport(restroomId: string, input: ReportInput): Promise<void>
  getFavorites(): Promise<RestroomDetail[]>
  setFavorite(restroomId: string, favorite: boolean): Promise<void>

  // Admin (the backend rejects these for non-admins)
  admin: {
    listReports(status: ReportStatus | null): Promise<AdminReport[]>
    resolveReport(reportId: string, status: ReportStatus): Promise<void>
    setRestroomRemoved(id: string, removed: boolean): Promise<void>
    mergeRestrooms(duplicateId: string, keepId: string): Promise<void>
    rollback(editId: number): Promise<void>
    setReviewHidden(reviewId: string, hidden: boolean): Promise<void>
    listUsers(search: string | null): Promise<AdminUser[]>
    setSuspension(userId: string, until: string | null, reason?: string | null): Promise<void>
  }
}

/** An error whose message is safe to show to users. */
export class ApiError extends Error {
  readonly code: string | undefined
  constructor(message: string, code?: string) {
    super(message)
    this.name = 'ApiError'
    this.code = code
  }
}
