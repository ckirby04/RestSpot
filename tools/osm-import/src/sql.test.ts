import { expect, it } from 'vitest'
import { ANON, CAMPUS, createDb } from '../../../supabase/tests/db.ts'
import { toLikelyListing, toListing } from './osm.ts'
import { toSql } from './sql.ts'

const fixtures = [
  toListing({
    type: 'node',
    id: 1,
    lat: CAMPUS.lat,
    lon: CAMPUS.lng,
    tags: { amenity: 'toilets', name: 'Campus Restroom', male: 'yes', female: 'yes', wheelchair: 'yes', opening_hours: '24/7' },
  })!,
  toLikelyListing({
    type: 'node',
    id: 2,
    lat: CAMPUS.lat + 0.001,
    lon: CAMPUS.lng,
    tags: { amenity: 'fuel', brand: "Casey's", name: "O'Brien's Casey's" },
  })!,
]

/**
 * Run a script the way the Supabase SQL editor can: statement by statement, with no
 * session state (temp tables, search_path) carried between them.
 */
async function runLikeSqlEditor(db: Awaited<ReturnType<typeof createDb>>, sql: string) {
  const statements = sql
    .split(/;\s*\n/)
    .map((s) => s.replace(/^\s*--.*$/gm, '').trim())
    .filter(Boolean)
  for (const statement of statements) {
    await db.pg.exec(`reset all; set search_path = pg_catalog; ${statement};`)
  }
  await db.pg.exec('reset all')
}

it('generated SQL imports listings idempotently and never overwrites user edits', async () => {
  const db = await createDb()
  await runLikeSqlEditor(db, toSql(fixtures, 'test'))
  await runLikeSqlEditor(db, toSql(fixtures, 'test again'))

  const results = await db.rpc<Record<string, any>>(ANON, 'search_restrooms', { near_lat: CAMPUS.lat, near_lng: CAMPUS.lng })
  expect(results.map((r) => [r.name, r.source, r.verified, r.rooms.length]).sort()).toEqual([
    ['Campus Restroom', 'osm', false, 2],
    ["Casey's", 'poi_inferred', false, 0],
  ])
  expect(results.find((r) => r.source === 'osm')!.is_open).toBe(true)

  // A user fixes the name; a later import must not undo it.
  const user = await db.createUser('fixer@example.com')
  const id = results.find((r) => r.source === 'osm')!.id
  await db.rpc(user, 'save_location', {
    payload: {
      id,
      name: 'Campus Restroom (2nd floor)',
      lat: CAMPUS.lat,
      lng: CAMPUS.lng,
      time_zone: 'America/Chicago',
      access_type: 'public',
      fee: 'free',
      key_required: 'no',
      hours: Array(7).fill({ kind: 'all_day' }),
      rooms: [{ designation: 'all_gender', layout: 'single_user' }],
    },
  })
  await runLikeSqlEditor(db, toSql(fixtures, 'third run'))
  const [after] = await db.rpc<{ get_location: any }>(ANON, 'get_location', { location_id: id })
  expect(after.get_location.name).toBe('Campus Restroom (2nd floor)')
  expect(after.get_location.rooms).toHaveLength(1)
}, 60_000)
