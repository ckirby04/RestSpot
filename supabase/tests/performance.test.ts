import { expect, it } from 'vitest'
import { ANON, CAMPUS, createDb } from './db.ts'

// Proposal §4.2.3: proximity queries complete within 500 ms for at least 10,000 restrooms.
// PGlite (single-threaded WASM) is slower than hosted Postgres, so passing here is conservative.
it('searches 10,000 restrooms within 500 ms', async () => {
  const db = await createDb()
  await db.pg.exec(`
    set search_path = public, extensions;
    insert into locations (name, geog, access_type, fee)
    select
      'Restroom ' || i,
      st_setsrid(st_makepoint(-94.1737 + (random() - 0.5) * 2, 36.0687 + (random() - 0.5) * 2), 4326)::geography,
      (array['public', 'customers_only', 'restricted'])[1 + i % 3],
      (array['free', 'paid', 'unknown'])[1 + i % 3]
    from generate_series(1, 10000) i;
    insert into rooms (location_id, designation, layout, changing_table, ada_accessible)
    select id, d, 'multi_stall', 'yes', 'yes' from locations, unnest(array['mens', 'womens']) d;
    analyze;
  `)

  await db.rpc(ANON, 'search_restrooms', { near_lat: CAMPUS.lat, near_lng: CAMPUS.lng }) // warm up
  const timings: number[] = []
  for (const radius of [2, 10, 25]) {
    const start = performance.now()
    const rows = await db.rpc(ANON, 'search_restrooms', {
      near_lat: CAMPUS.lat,
      near_lng: CAMPUS.lng,
      radius_miles: radius,
      changing_table: true,
    })
    timings.push(performance.now() - start)
    expect(rows.length).toBeGreaterThan(0)
  }
  console.log('search timings (ms):', timings.map((t) => t.toFixed(0)).join(', '))
  expect(Math.max(...timings)).toBeLessThan(500)
}, 120_000)
