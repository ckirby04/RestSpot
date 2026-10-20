// Development-only backend: runs the real Supabase migrations in the browser
// with PGlite (Postgres compiled to WASM) and persists to IndexedDB. Lets the
// whole app run with no Supabase project, using the same SQL as production.
//
// Never bundled into production builds unless VITE_BACKEND=local.
import { PGlite } from '@electric-sql/pglite'
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm'
import { postgis } from '@electric-sql/pglite-postgis'
import {
  ApiError,
  createRestSpotApi,
  friendlyDbError,
  type AuthAdapter,
  type RestSpotApi,
  type Session,
  type Transport,
} from '@restspot/shared'
import { SEED_VERSION, seedSampleData } from './sampleData.ts'

const migrations = import.meta.glob('../../../../supabase/migrations/*.sql', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

const SUPABASE_STUB = `
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text unique,
    raw_user_meta_data jsonb not null default '{}',
    -- Dev only: SHA-256 of the password. Real auth is handled by Supabase.
    dev_password_sha256 text
  );
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  grant usage on schema public, auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
`

const TABLES = new Set(['profiles', 'reviews', 'reports', 'favorites', 'locations', 'rooms'])
const SESSION_KEY = 'restspot.dev.session'

/** Demo accounts created with the sample data. */
export const DEMO_ACCOUNTS = [
  { email: 'demo@restspot.test', password: 'password123', displayName: 'Demo User', admin: false },
  { email: 'admin@restspot.test', password: 'password123', displayName: 'Demo Admin', admin: true },
] as const

async function sha256(text: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Short hash of the migrations, so a schema change starts a fresh local database. */
async function schemaVersion(sql: string): Promise<string> {
  return (await sha256(sql)).slice(0, 12)
}

function toApiError(e: unknown): ApiError {
  if (e instanceof ApiError) return e
  const err = e as { message?: string; code?: string }
  return friendlyDbError(err.message ?? String(e), err.code)
}

export async function createLocalApi(): Promise<RestSpotApi & { resetDatabase(): Promise<void> }> {
  const migrationSql = Object.keys(migrations)
    .sort()
    .map((k) => migrations[k])
    .join('\n')
  const version = await schemaVersion(`${migrationSql}\n-- seed ${SEED_VERSION}`)
  const dataDir = `idb://restspot-dev-${version}`

  const pg = await PGlite.create({ dataDir, extensions: { postgis, pg_trgm } })
  const initialized = (await pg.query<{ ok: boolean }>(`select to_regclass('public.locations') is not null as ok`))
    .rows[0].ok
  if (!initialized) {
    await pg.exec(SUPABASE_STUB)
    await pg.exec(migrationSql)
    await pg.exec('grant usage on schema extensions to anon, authenticated')
    await seedSampleData(pg, DEMO_ACCOUNTS, sha256)
  }

  // --- Session -----------------------------------------------------------------
  let session: Session | null = null
  try {
    session = JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null')
  } catch {
    session = null
  }
  if (session) {
    const exists = await pg.query('select 1 from auth.users where id = $1', [session.userId])
    if (exists.rows.length === 0) session = null
  }
  const sessionListeners = new Set<(s: Session | null) => void>()
  function setSession(s: Session | null) {
    session = s
    try {
      if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s))
      else localStorage.removeItem(SESSION_KEY)
    } catch {
      // Storage unavailable (private mode): the session lasts until reload.
    }
    sessionListeners.forEach((l) => l(s))
  }

  // --- Data access as the current user (RLS applies) ------------------------------
  const changeListeners = new Map<string, Set<() => void>>()
  function notify(table: string) {
    // Let the write's transaction settle before listeners refetch.
    setTimeout(() => changeListeners.get(table)?.forEach((l) => l()), 0)
  }

  // PGlite coalesces IndexedDB flushes: a write made while a flush is running can
  // return before it is persisted, and a quick reload would lose it. Flush the
  // file system directly (not coalesced) after every write.
  const fs = (pg as unknown as { fs?: { syncToFs?(): Promise<void> } }).fs
  async function persist() {
    await fs?.syncToFs?.()
  }
  async function written(table: string) {
    await persist()
    notify(table)
  }

  async function asCaller<T>(fn: (tx: Parameters<Parameters<PGlite['transaction']>[0]>[0]) => Promise<T>): Promise<T> {
    try {
      return await pg.transaction(async (tx) => {
        await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [session?.userId ?? ''])
        await tx.exec(`set local role ${session ? 'authenticated' : 'anon'}`)
        await tx.exec('set local search_path = public, extensions')
        return fn(tx)
      })
    } catch (e) {
      throw toApiError(e)
    }
  }

  // How each RPC returns data, so results match PostgREST's shapes.
  const returnKinds = new Map<string, 'table' | 'setof' | 'scalar' | 'void'>()
  for (const row of (
    await pg.query<{ name: string; retset: boolean; rettype: string }>(`
      select p.proname as name, p.proretset as retset, t.typname as rettype
      from pg_proc p join pg_type t on t.oid = p.prorettype
      where p.pronamespace = 'public'::regnamespace
    `)
  ).rows) {
    returnKinds.set(
      row.name,
      row.rettype === 'void' ? 'void' : row.rettype === 'record' ? 'table' : row.retset ? 'setof' : 'scalar',
    )
  }

  const READ_ONLY_RPCS = /^(get_|search_|find_|admin_list_|is_)/
  const LISTING_RPCS = /^(save_location|confirm_location|admin_|save_my_review|delete_my_review)/

  function ident(table: string) {
    if (!TABLES.has(table)) throw new ApiError(`Unknown table ${table}`)
    return `public.${table}`
  }
  function whereClause(match: Record<string, unknown>, offset = 0) {
    const keys = Object.keys(match)
    return {
      sql: keys.map((k, i) => `"${k.replace(/"/g, '')}" = $${i + 1 + offset}`).join(' and '),
      values: keys.map((k) => match[k]),
    }
  }

  const transport: Transport = {
    async rpc(fn, args = {}) {
      const kind = returnKinds.get(fn)
      if (!kind) throw new ApiError(`Unknown function ${fn}`)
      const names = Object.keys(args)
      const params = names.map((n, i) => `${n} => $${i + 1}`).join(', ')
      const values = names.map((n) => {
        const v = args[n]
        return v !== null && typeof v === 'object' ? JSON.stringify(v) : v
      })
      const rows = await asCaller(
        async (tx) => (await tx.query<any>(`select * from public.${fn}(${params})`, values)).rows,
      )
      if (!READ_ONLY_RPCS.test(fn)) await persist()
      if (LISTING_RPCS.test(fn)) notify('locations')
      switch (kind) {
        case 'void':
          return null
        case 'table':
          return rows
        case 'setof':
          return rows.map((r) => r[fn])
        case 'scalar':
          return rows[0]?.[fn] ?? null
      }
    },
    async insert(table, row) {
      const keys = Object.keys(row)
      await asCaller((tx) =>
        tx.query(
          `insert into ${ident(table)} (${keys.map((k) => `"${k}"`).join(', ')}) values (${keys.map((_, i) => `$${i + 1}`).join(', ')})`,
          keys.map((k) => row[k]),
        ),
      )
      await written(table)
    },
    async update(table, values, match) {
      const keys = Object.keys(values)
      const where = whereClause(match, keys.length)
      await asCaller((tx) =>
        tx.query(
          `update ${ident(table)} set ${keys.map((k, i) => `"${k}" = $${i + 1}`).join(', ')} where ${where.sql}`,
          [...keys.map((k) => values[k]), ...where.values],
        ),
      )
      await written(table)
    },
    async delete(table, match) {
      const where = whereClause(match)
      await asCaller((tx) => tx.query(`delete from ${ident(table)} where ${where.sql}`, where.values))
      await written(table)
    },
    async selectOne(table, match) {
      const where = whereClause(match)
      const rows = await asCaller(
        async (tx) =>
          (await tx.query<any>(`select * from ${ident(table)} where ${where.sql} limit 1`, where.values)).rows,
      )
      return rows[0] ?? null
    },
    subscribe(table, listener) {
      if (!changeListeners.has(table)) changeListeners.set(table, new Set())
      changeListeners.get(table)!.add(listener)
      return () => changeListeners.get(table)?.delete(listener)
    },
  }

  // --- Auth ---------------------------------------------------------------------
  async function createUser(email: string, password: string | null, meta: Record<string, unknown>): Promise<Session> {
    const { rows } = await pg.query<{ id: string }>(
      `insert into auth.users (email, raw_user_meta_data, dev_password_sha256) values ($1, $2, $3) returning id`,
      [email, JSON.stringify(meta), password ? await sha256(password) : null],
    )
    await persist()
    return { userId: rows[0].id, email }
  }

  const auth: AuthAdapter = {
    async getSession() {
      return session
    },
    onSessionChange(listener) {
      sessionListeners.add(listener)
      return () => sessionListeners.delete(listener)
    },
    async signInWithPassword(email, password) {
      const { rows } = await pg.query<{ id: string; email: string; dev_password_sha256: string | null }>(
        'select id, email, dev_password_sha256 from auth.users where lower(email) = lower($1)',
        [email.trim()],
      )
      if (!rows[0] || rows[0].dev_password_sha256 !== (await sha256(password))) {
        throw new ApiError('Invalid login credentials')
      }
      setSession({ userId: rows[0].id, email: rows[0].email })
    },
    async signUp(email, password, displayName) {
      const exists = await pg.query('select 1 from auth.users where lower(email) = lower($1)', [email.trim()])
      if (exists.rows.length) throw new ApiError('User already registered')
      setSession(await createUser(email.trim(), password, { display_name: displayName }))
      return { status: 'signed_in' }
    },
    async signInWithOAuth(provider) {
      // Simulates a provider sign-in with a stable fake account per provider.
      const email = `${provider}-user@restspot.test`
      const { rows } = await pg.query<{ id: string }>('select id from auth.users where email = $1', [email])
      const name = provider === 'google' ? 'Google Test User' : 'Apple Test User'
      setSession(rows[0] ? { userId: rows[0].id, email } : await createUser(email, null, { full_name: name }))
    },
    async sendPasswordReset() {
      // No email in local mode.
    },
    async signOut() {
      setSession(null)
    },
    async updatePassword(password) {
      if (!session) throw new ApiError('Not signed in')
      await pg.query('update auth.users set dev_password_sha256 = $1 where id = $2', [
        await sha256(password),
        session.userId,
      ])
      await persist()
    },
  }

  const api = createRestSpotApi({ backendName: 'Local (in-browser Postgres)', transport, auth })
  return {
    ...api,
    async resetDatabase() {
      await pg.close()
      indexedDB.deleteDatabase(`/pglite/restspot-dev-${version}`)
      setSession(null)
    },
  }
}
