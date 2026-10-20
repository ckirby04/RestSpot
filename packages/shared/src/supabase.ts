// RestSpotApi backed by a hosted Supabase project.
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { ApiError, type RestSpotApi, type Session } from './api.ts'
import { createRestSpotApi, friendlyDbError, type AuthAdapter, type Transport } from './client.ts'

export interface SupabaseConfig {
  url: string
  /** The public anon / publishable key. Never the service_role key. */
  anonKey: string
  /** Where OAuth and email links send the user back to (e.g. window.location.origin). */
  redirectTo?: string
}

function check<T>(result: { data: T; error: { message: string; code?: string } | null }): T {
  if (result.error) throw friendlyDbError(result.error.message, result.error.code)
  return result.data
}

function toSession(s: { user: { id: string; email?: string | null } } | null): Session | null {
  return s ? { userId: s.user.id, email: s.user.email ?? null } : null
}

export function createSupabaseTransport(client: SupabaseClient): Transport {
  return {
    async rpc(fn, args) {
      return check(await client.rpc(fn, args ?? {}))
    },
    async insert(table, row) {
      check(await client.from(table).insert(row))
    },
    async update(table, values, match) {
      check(await client.from(table).update(values).match(match))
    },
    async delete(table, match) {
      check(await client.from(table).delete().match(match))
    },
    async selectOne(table, match) {
      return check(await client.from(table).select('*').match(match).maybeSingle())
    },
    subscribe(table, listener) {
      const channel = client
        .channel(`changes:${table}:${Math.random().toString(36).slice(2)}`)
        .on('postgres_changes', { event: '*', schema: 'public', table }, () => listener())
        .subscribe()
      return () => {
        void client.removeChannel(channel)
      }
    },
  }
}

export function createSupabaseAuth(client: SupabaseClient, redirectTo?: string): AuthAdapter {
  const fail = (error: { message: string; code?: string } | null) => {
    if (error) throw new ApiError(error.message, error.code)
  }
  return {
    async getSession() {
      const { data } = await client.auth.getSession()
      return toSession(data.session)
    },
    onSessionChange(listener) {
      const { data } = client.auth.onAuthStateChange((_event, session) => listener(toSession(session)))
      return () => data.subscription.unsubscribe()
    },
    async signInWithPassword(email, password) {
      fail((await client.auth.signInWithPassword({ email, password })).error)
    },
    async signUp(email, password, displayName) {
      const { data, error } = await client.auth.signUp({
        email,
        password,
        options: { data: { display_name: displayName }, emailRedirectTo: redirectTo },
      })
      fail(error)
      return data.session ? { status: 'signed_in' } : { status: 'confirm_email' }
    },
    async signInWithOAuth(provider) {
      fail((await client.auth.signInWithOAuth({ provider, options: { redirectTo } })).error)
    },
    async sendPasswordReset(email) {
      fail(
        (await client.auth.resetPasswordForEmail(email, { redirectTo: redirectTo && `${redirectTo}/reset-password` }))
          .error,
      )
    },
    async signOut() {
      fail((await client.auth.signOut()).error)
    },
    async updatePassword(password) {
      fail((await client.auth.updateUser({ password })).error)
    },
  }
}

export function createSupabaseApi(config: SupabaseConfig): RestSpotApi {
  const client = createClient(config.url, config.anonKey)
  return createRestSpotApi({
    backendName: 'Supabase',
    transport: createSupabaseTransport(client),
    auth: createSupabaseAuth(client, config.redirectTo),
  })
}
