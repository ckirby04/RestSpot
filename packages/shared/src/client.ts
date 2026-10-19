// One RestSpotApi implementation shared by every backend. Backends only supply a
// Transport (PostgREST-style data access) and an AuthAdapter.
import { ApiError, type OAuthProvider, type RestSpotApi, type Session, type SignUpResult } from './api.ts'
import {
  locationPayload,
  mapAdminReport,
  mapAdminUser,
  mapContributions,
  mapDuplicate,
  mapEdit,
  mapProfile,
  mapRestroomDetail,
  mapReview,
  mapSearchResult,
  searchArgs,
} from './mappers.ts'
import { LIMITS, reportInputSchema, reviewInputSchema } from './validation.ts'

type Row = Record<string, any>

/**
 * Data access with PostgREST semantics: `rpc` returns an array for set-returning
 * functions, the bare value for scalar functions, and null for void functions.
 * Errors are thrown as ApiError with a user-presentable message.
 */
export interface Transport {
  rpc<T = any>(fn: string, args?: Record<string, unknown>): Promise<T>
  insert(table: string, row: Row): Promise<void>
  update(table: string, values: Row, match: Row): Promise<void>
  delete(table: string, match: Row): Promise<void>
  selectOne(table: string, match: Row): Promise<Row | null>
  /** Calls `listener` whenever a row in `table` changes. Returns an unsubscribe function. */
  subscribe(table: string, listener: () => void): () => void
}

export interface AuthAdapter {
  getSession(): Promise<Session | null>
  onSessionChange(listener: (session: Session | null) => void): () => void
  signInWithPassword(email: string, password: string): Promise<void>
  signUp(email: string, password: string, displayName: string): Promise<SignUpResult>
  signInWithOAuth(provider: OAuthProvider): Promise<void>
  sendPasswordReset(email: string): Promise<void>
  updatePassword(newPassword: string): Promise<void>
  signOut(): Promise<void>
}

export function createRestSpotApi(opts: { backendName: string; transport: Transport; auth: AuthAdapter }): RestSpotApi {
  const { transport: db, auth } = opts

  async function requireUserId(): Promise<string> {
    const session = await auth.getSession()
    if (!session) throw new ApiError('Sign in to continue', '28000')
    return session.userId
  }

  return {
    backendName: opts.backendName,

    getSession: () => auth.getSession(),
    onSessionChange: (l) => auth.onSessionChange(l),
    signInWithPassword: (e, p) => auth.signInWithPassword(e, p),
    signUp: (e, p, n) => auth.signUp(e, p, n),
    signInWithOAuth: (p) => auth.signInWithOAuth(p),
    sendPasswordReset: (e) => auth.sendPasswordReset(e),
    async updatePassword(p) {
      if (p.length < LIMITS.passwordMin) throw new ApiError(`Password must be at least ${LIMITS.passwordMin} characters`)
      await auth.updatePassword(p)
    },
    signOut: () => auth.signOut(),

    async getMyProfile() {
      const session = await auth.getSession()
      if (!session) return null
      const row = await db.selectOne('profiles', { id: session.userId })
      return row ? mapProfile(row) : null
    },
    async updateDisplayName(displayName) {
      const name = displayName.trim()
      if (name.length < 1 || name.length > 50) throw new ApiError('Display name must be 1–50 characters')
      await db.update('profiles', { display_name: name }, { id: await requireUserId() })
    },
    async deleteMyAccount() {
      await db.rpc('delete_my_account')
      await auth.signOut()
    },
    async getMyContributions() {
      return mapContributions(await db.rpc('get_my_contributions'))
    },

    async searchRestrooms(origin, filters) {
      const rows = await db.rpc<Row[]>('search_restrooms', searchArgs(origin, filters))
      return rows.map(mapSearchResult)
    },
    async getRestroom(id) {
      const row = await db.rpc<Row | null>('get_location', { location_id: id })
      return row ? mapRestroomDetail(row) : null
    },
    async getHistory(id) {
      return (await db.rpc<Row[]>('get_location_history', { location_id: id })).map(mapEdit)
    },
    async findPossibleDuplicates(at, name, excludeId) {
      if (!name.trim()) return []
      const rows = await db.rpc<Row[]>('find_possible_duplicates', {
        near_lat: at.lat,
        near_lng: at.lng,
        candidate_name: name.trim(),
        exclude_id: excludeId ?? null,
      })
      return rows.map(mapDuplicate)
    },
    async saveRestroom(input, id) {
      return db.rpc<string>('save_location', { payload: locationPayload(input, id) })
    },
    async confirmRestroom(id) {
      await db.rpc('confirm_location', { location_id: id })
    },
    onRestroomsChanged: (listener) => db.subscribe('locations', listener),

    async getReviews(restroomId) {
      return (await db.rpc<Row[]>('get_location_reviews', { location_id: restroomId })).map(mapReview)
    },
    async saveMyReview(restroomId, input) {
      const r = reviewInputSchema.parse(input)
      await db.rpc('save_my_review', {
        location_id: restroomId,
        overall: r.overall,
        cleanliness: r.cleanliness,
        comment: r.comment,
        anonymous: r.anonymous,
      })
    },
    async deleteMyReview(restroomId) {
      await db.rpc('delete_my_review', { location_id: restroomId })
    },

    async fileReport(restroomId, input) {
      const r = reportInputSchema.parse(input)
      await db.insert('reports', { location_id: restroomId, reason: r.reason, comment: r.comment })
    },
    async getFavorites() {
      return (await db.rpc<Row[]>('get_favorites')).map(mapRestroomDetail)
    },
    async setFavorite(restroomId, favorite) {
      const userId = await requireUserId()
      if (favorite) {
        try {
          await db.insert('favorites', { location_id: restroomId })
        } catch (e) {
          if (!(e instanceof ApiError && e.code === '23505')) throw e // already a favorite
        }
      } else {
        await db.delete('favorites', { user_id: userId, location_id: restroomId })
      }
    },

    admin: {
      async listReports(status) {
        return (await db.rpc<Row[]>('admin_list_reports', { status_filter: status })).map(mapAdminReport)
      },
      async resolveReport(reportId, status) {
        await db.rpc('admin_resolve_report', { report_id: reportId, status })
      },
      async setRestroomRemoved(id, removed) {
        await db.rpc('admin_set_location_deleted', { location_id: id, deleted: removed })
      },
      async mergeRestrooms(duplicateId, keepId) {
        await db.rpc('admin_merge_locations', { duplicate_id: duplicateId, keep_id: keepId })
      },
      async rollback(editId) {
        await db.rpc('admin_rollback_location', { edit_id: editId })
      },
      async setReviewHidden(reviewId, hidden) {
        await db.rpc('admin_set_review_hidden', { review_id: reviewId, hidden })
      },
      async listUsers(search) {
        return (await db.rpc<Row[]>('admin_list_users', { search: search?.trim() || null })).map(mapAdminUser)
      },
      async setSuspension(userId, until, reason) {
        await db.rpc('admin_set_suspension', { user_id: userId, until, reason: reason ?? null })
      },
    },
  }
}

/** Turn a Postgres/PostgREST error into a message suitable for users. */
export function friendlyDbError(message: string, code?: string): ApiError {
  if (code === '23505') return new ApiError('That already exists', code)
  if (code === '23514' || /check constraint/i.test(message)) {
    return new ApiError('Some of the values are out of range — please check the form', code)
  }
  if (code === '42501' && /permission denied|row-level security/i.test(message)) {
    return new ApiError('You don’t have permission to do that', code)
  }
  return new ApiError(message, code)
}
