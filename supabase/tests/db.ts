// Test harness: runs the real migrations in PGlite (Postgres compiled to WASM)
// with a minimal stand-in for Supabase's `auth` schema and API roles, so RLS
// policies and SECURITY DEFINER functions are exercised exactly as deployed.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PGlite, type Transaction } from '@electric-sql/pglite'
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm'
import { postgis } from '@electric-sql/pglite-postgis'

const MIGRATIONS_DIR = join(import.meta.dirname, '..', 'migrations')

const SUPABASE_STUB = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;

  create schema auth;
  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text unique,
    raw_user_meta_data jsonb not null default '{}'
  );
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;

  grant usage on schema public, auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated;
`

export type Db = Awaited<ReturnType<typeof createDb>>
export type Caller = { role: 'anon' } | { role: 'authenticated'; userId: string }

export async function createDb() {
  const pg = await PGlite.create({ extensions: { postgis, pg_trgm } })
  await pg.exec(SUPABASE_STUB)
  for (const file of readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()) {
    await pg.exec(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'))
  }
  await pg.exec('grant usage on schema extensions to anon, authenticated, service_role')

  /** Run `fn` as an API caller (RLS applies), like a request through Supabase's REST API. */
  async function as<T>(caller: Caller, fn: (tx: Transaction) => Promise<T>): Promise<T> {
    return pg.transaction(async (tx) => {
      await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [
        caller.role === 'authenticated' ? caller.userId : '',
      ])
      await tx.exec(`set local role ${caller.role}`)
      await tx.exec('set local search_path = public, extensions')
      return fn(tx)
    })
  }

  /** Call an RPC function with named arguments as `caller`. Returns all rows. */
  async function rpc<T = Record<string, unknown>>(caller: Caller, fn: string, args: Record<string, unknown> = {}) {
    const names = Object.keys(args)
    const params = names.map((n, i) => `${n} => $${i + 1}`).join(', ')
    const values = names.map((n) => {
      const v = args[n]
      return v !== null && typeof v === 'object' && !(v instanceof Date) ? JSON.stringify(v) : v
    })
    return as(caller, async (tx) => (await tx.query<T>(`select * from public.${fn}(${params})`, values)).rows)
  }

  async function createUser(email: string, meta: Record<string, unknown> = {}): Promise<Caller & { userId: string }> {
    const { rows } = await pg.query<{ id: string }>(
      'insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id',
      [email, JSON.stringify(meta)],
    )
    return { role: 'authenticated', userId: rows[0].id }
  }

  async function makeAdmin(user: { userId: string }) {
    await pg.query(`update public.profiles set role = 'admin' where id = $1`, [user.userId])
  }

  return { pg, as, rpc, createUser, makeAdmin }
}

export const ANON: Caller = { role: 'anon' }

const unknownDay = { kind: 'unknown' }
export const UNKNOWN_HOURS = Array(7).fill(unknownDay)

// Old Main, University of Arkansas.
export const CAMPUS = { lat: 36.0687, lng: -94.1737 }

/** Point `meters` north of `origin`. */
export function north(origin: { lat: number; lng: number }, meters: number) {
  return { lat: origin.lat + meters / 111_320, lng: origin.lng }
}

export function locationPayload(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Test Restroom',
    ...CAMPUS,
    time_zone: 'America/Chicago',
    access_type: 'public',
    fee: 'free',
    key_required: 'no',
    hours: UNKNOWN_HOURS,
    notes: null,
    rooms: [
      { designation: 'mens', layout: 'multi_stall', changing_table: 'no', ada_accessible: 'yes' },
      { designation: 'womens', layout: 'multi_stall', changing_table: 'yes', ada_accessible: 'yes' },
    ],
    ...overrides,
  }
}
