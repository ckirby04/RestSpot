import { beforeEach, describe, expect, it } from 'vitest'
import { ANON, CAMPUS, createDb, locationPayload, north, type Caller, type Db } from './db.ts'

let db: Db
let alice: Caller & { userId: string }
let bob: Caller & { userId: string }
let admin: Caller & { userId: string }

beforeEach(async () => {
  db = await createDb()
  alice = await db.createUser('alice@example.com', { full_name: 'Alice A' })
  bob = await db.createUser('bob@example.com')
  admin = await db.createUser('admin@example.com', { display_name: 'Mod' })
  await db.makeAdmin(admin)
})

async function save(caller: Caller, overrides: Record<string, unknown> = {}) {
  const rows = await db.rpc<{ save_location: string }>(caller, 'save_location', { payload: locationPayload(overrides) })
  return rows[0].save_location
}

async function search(caller: Caller, args: Record<string, unknown> = {}) {
  return db.rpc<Record<string, any>>(caller, 'search_restrooms', {
    near_lat: CAMPUS.lat,
    near_lng: CAMPUS.lng,
    ...args,
  })
}

describe('accounts', () => {
  it('creates a profile on sign-up using the best available name', async () => {
    const { rows } = await db.pg.query<{ display_name: string; role: string }>(
      'select display_name, role from profiles order by created_at',
    )
    expect(rows.map((r) => r.display_name).sort()).toEqual(['Alice A', 'Mod', 'bob'])
  })

  it('lets users rename themselves but not promote themselves', async () => {
    await db.as(alice, (tx) => tx.query(`update profiles set display_name = 'Ally' where id = $1`, [alice.userId]))
    await expect(
      db.as(alice, (tx) => tx.query(`update profiles set role = 'admin' where id = $1`, [alice.userId])),
    ).rejects.toThrow(/permission denied/)
    const { rows } = await db.pg.query(`select display_name, role from profiles where id = $1`, [alice.userId])
    expect(rows[0]).toEqual({ display_name: 'Ally', role: 'user' })
  })

  it('deleting an account keeps reviews but anonymizes them', async () => {
    const id = await save(alice)
    await db.as(bob, (tx) =>
      tx.query(`insert into reviews (location_id, overall, cleanliness) values ($1, 4, 4)`, [id]),
    )
    await db.rpc(bob, 'delete_my_account')
    const { rows } = await db.pg.query(`select author_id from reviews`)
    expect(rows).toEqual([{ author_id: null }])
    const users = await db.pg.query(`select 1 from auth.users where id = $1`, [bob.userId])
    expect(users.rows).toHaveLength(0)
  })
})

describe('listings', () => {
  it('guests can search but not contribute', async () => {
    await save(alice)
    expect(await search(ANON)).toHaveLength(1)
    await expect(save(ANON)).rejects.toThrow(/permission denied|Sign in/)
  })

  it('clients cannot write listings directly, only through save_location', async () => {
    await expect(
      db.as(alice, (tx) =>
        tx.query(`insert into locations (name, geog, access_type) values ('x', 'POINT(0 0)', 'public')`),
      ),
    ).rejects.toThrow(/permission denied/)
  })

  it('validates input', async () => {
    await expect(save(alice, { name: '' })).rejects.toThrow()
    await expect(save(alice, { name: 'x'.repeat(101) })).rejects.toThrow()
    await expect(save(alice, { lat: 91 })).rejects.toThrow(/Invalid coordinates/)
    await expect(save(alice, { rooms: [] })).rejects.toThrow(/at least one room/)
    await expect(save(alice, { rooms: [{ designation: 'mens', layout: 'family' }] })).rejects.toThrow(
      /family_rooms_are_all_gender/,
    )
    await expect(
      save(alice, { hours: [{ kind: 'open', open: '9:00', close: '17:00' }, ...Array(6).fill({ kind: 'closed' })] }),
    ).rejects.toThrow(/HH:MM/)
    await expect(save(alice, { time_zone: 'Mars/Olympus' })).rejects.toThrow(/time zone/)
    await expect(save(alice, { notes: 'x'.repeat(501) })).rejects.toThrow()
  })

  it('searches by distance within the radius', async () => {
    await save(alice, { name: 'Far', ...north(CAMPUS, 2000) })
    await save(alice, { name: 'Near', ...north(CAMPUS, 100) })
    await save(alice, { name: 'Out of range', ...north(CAMPUS, 10_000) })

    const results = await search(ANON, { radius_miles: 2 })
    expect(results.map((r) => r.name)).toEqual(['Near', 'Far'])
    expect(results[0].distance_meters).toBeCloseTo(100, -1)
    expect(results[0].rooms).toHaveLength(2)

    expect((await search(ANON, { radius_miles: 25 })).map((r) => r.name)).toContain('Out of range')
  })

  it('filters on rooms and attributes', async () => {
    await save(alice, { name: 'Standard' })
    await save(alice, {
      name: 'Family',
      fee: 'paid',
      access_type: 'customers_only',
      rooms: [{ designation: 'all_gender', layout: 'family', changing_table: 'yes', ada_accessible: 'yes' }],
    })
    await save(alice, {
      name: 'Single',
      rooms: [{ designation: 'all_gender', layout: 'single_user', changing_table: 'unknown', ada_accessible: 'no' }],
    })

    const names = async (args: Record<string, unknown>) => (await search(ANON, args)).map((r) => r.name).sort()
    expect(await names({ all_gender: true })).toEqual(['Family', 'Single'])
    expect(await names({ family: true })).toEqual(['Family'])
    expect(await names({ single_user: true })).toEqual(['Family', 'Single'])
    expect(await names({ changing_table: true })).toEqual(['Family', 'Standard'])
    expect(await names({ ada_accessible: true })).toEqual(['Family', 'Standard'])
    expect(await names({ free_only: true })).toEqual(['Single', 'Standard'])
    expect(await names({ public_only: true })).toEqual(['Single', 'Standard'])
  })

  it('filters on open now in the restroom time zone', async () => {
    const all = Array(7).fill({ kind: 'all_day' })
    const closed = Array(7).fill({ kind: 'closed' })
    await save(alice, { name: 'Always', hours: all })
    await save(alice, { name: 'Never', hours: closed })
    await save(alice, { name: 'Unknown' })

    const results = await search(ANON, { open_now: true })
    expect(results.map((r) => r.name)).toEqual(['Always'])
    const byName = Object.fromEntries((await search(ANON)).map((r) => [r.name, r.is_open]))
    expect(byName).toEqual({ Always: true, Never: false, Unknown: null })
  })

  it('records edit history with field-level diffs', async () => {
    const id = await save(alice)
    await save(bob, { id, name: 'Renamed', fee: 'paid' })
    await save(bob, { id, name: 'Renamed', fee: 'paid' }) // no-op edit is not recorded

    const history = await db.rpc<Record<string, any>>(ANON, 'get_location_history', { location_id: id })
    expect(history.map((h) => h.kind)).toEqual(['update', 'create'])
    expect(history[0].editor_display_name).toBe('bob')
    expect(history[0].changes).toEqual({
      name: { old: 'Test Restroom', new: 'Renamed' },
      fee: { old: 'free', new: 'paid' },
    })
  })

  it('warns about similar listings within 50 m', async () => {
    await save(alice, { name: "McDonald's" })
    await save(alice, { name: 'Library', ...north(CAMPUS, 20) })
    await save(alice, { name: "McDonald's", ...north(CAMPUS, 200) })

    const dupes = await db.rpc<Record<string, any>>(ANON, 'find_possible_duplicates', {
      ...{ near_lat: north(CAMPUS, 30).lat, near_lng: CAMPUS.lng },
      candidate_name: 'mcdonalds',
    })
    expect(dupes.map((d) => d.name)).toEqual(["McDonald's"])
    expect(dupes[0].distance_meters).toBeLessThan(50)
  })

  it('confirming marks a listing verified', async () => {
    const id = await save(alice)
    await db.rpc(bob, 'confirm_location', { location_id: id })
    const [loc] = await db.rpc<{ get_location: any }>(ANON, 'get_location', { location_id: id })
    expect(loc.get_location.verified).toBe(true)
    expect(loc.get_location.last_confirmed_at).not.toBeNull()
  })

  it('rate-limits new listings', async () => {
    for (let i = 0; i < 10; i++) await save(alice, { name: `Spot ${i}`, ...north(CAMPUS, i * 100) })
    await expect(save(alice, { name: 'One too many' })).rejects.toThrow(/Too many changes/)
    await save(admin, { name: 'Admins are not limited' })
  })
})

describe('reviews', () => {
  it('averages ratings to one decimal place', async () => {
    const id = await save(alice)
    const review = (c: Caller, overall: number, cleanliness: number) =>
      db.as(c, (tx) =>
        tx.query(`insert into reviews (location_id, overall, cleanliness) values ($1, $2, $3)`, [
          id,
          overall,
          cleanliness,
        ]),
      )
    await review(alice, 5, 4)
    await review(bob, 4, 4)
    await review(admin, 4, 5)

    const [r] = await search(ANON)
    expect(Number(r.avg_overall)).toBe(4.3)
    expect(Number(r.avg_cleanliness)).toBe(4.3)
    expect(r.review_count).toBe(3)
    expect(await search(ANON, { min_cleanliness: 4.5 })).toHaveLength(0)
    expect(await search(ANON, { min_cleanliness: 4 })).toHaveLength(1)
  })

  it('allows one review per user per listing, with valid ratings, as yourself', async () => {
    const id = await save(alice)
    const insert = (c: Caller, sql: string, params: unknown[]) => db.as(c, (tx) => tx.query(sql, params))
    await insert(bob, `insert into reviews (location_id, overall, cleanliness) values ($1, 5, 5)`, [id])
    await expect(
      insert(bob, `insert into reviews (location_id, overall, cleanliness) values ($1, 4, 4)`, [id]),
    ).rejects.toThrow(/duplicate key/)
    await expect(
      insert(alice, `insert into reviews (location_id, overall, cleanliness) values ($1, 6, 5)`, [id]),
    ).rejects.toThrow(/check constraint/)
    await expect(
      insert(alice, `insert into reviews (location_id, author_id, overall, cleanliness) values ($1, $2, 5, 5)`, [
        id,
        bob.userId,
      ]),
    ).rejects.toThrow(/permission denied/)
  })

  it('save_my_review creates then replaces the caller’s review', async () => {
    const id = await save(alice)
    await db.rpc(bob, 'save_my_review', {
      location_id: id,
      overall: 2,
      cleanliness: 3,
      comment: '  ',
      anonymous: false,
    })
    await db.rpc(bob, 'save_my_review', {
      location_id: id,
      overall: 5,
      cleanliness: 4,
      comment: 'Better now',
      anonymous: true,
    })
    const reviews = await db.rpc<Record<string, any>>(bob, 'get_location_reviews', { location_id: id })
    expect(reviews).toHaveLength(1)
    expect(reviews[0]).toMatchObject({
      overall: 5,
      cleanliness: 4,
      comment: 'Better now',
      anonymous: true,
      is_mine: true,
    })

    await expect(db.rpc(bob, 'save_my_review', { location_id: id, overall: 0, cleanliness: 4 })).rejects.toThrow(
      /check constraint/,
    )
    await expect(db.rpc(ANON, 'save_my_review', { location_id: id, overall: 3, cleanliness: 3 })).rejects.toThrow()

    await db.rpc(bob, 'delete_my_review', { location_id: id })
    expect(await db.rpc(bob, 'get_location_reviews', { location_id: id })).toHaveLength(0)
  })

  it('hides anonymous reviewers from everyone but admins', async () => {
    const id = await save(alice)
    await db.as(bob, (tx) =>
      tx.query(
        `insert into reviews (location_id, overall, cleanliness, comment, anonymous) values ($1, 3, 2, 'meh', true)`,
        [id],
      ),
    )
    await db.as(alice, (tx) =>
      tx.query(`insert into reviews (location_id, overall, cleanliness) values ($1, 5, 5)`, [id]),
    )

    const forGuest = await db.rpc<Record<string, any>>(ANON, 'get_location_reviews', { location_id: id })
    const anon = forGuest.find((r) => r.anonymous)!
    expect(anon.author_display_name).toBeNull()
    expect(anon.author_id).toBeNull()
    expect(forGuest.find((r) => !r.anonymous)!.author_display_name).toBe('Alice A')

    const forBob = await db.rpc<Record<string, any>>(bob, 'get_location_reviews', { location_id: id })
    expect(forBob.find((r) => r.anonymous)!.is_mine).toBe(true)

    const forAdmin = await db.rpc<Record<string, any>>(admin, 'get_location_reviews', { location_id: id })
    expect(forAdmin.find((r) => r.anonymous)!.author_display_name).toBe('bob')

    // Other users can't read the reviews table directly to unmask authors.
    const direct = await db.as(alice, (tx) => tx.query(`select author_id from reviews where anonymous`))
    expect(direct.rows).toHaveLength(0)
  })
})

describe('reports and favorites', () => {
  it('reports are visible only to the reporter and admins', async () => {
    const id = await save(alice)
    await db.as(bob, (tx) => tx.query(`insert into reports (location_id, reason) values ($1, 'closed')`, [id]))
    await expect(
      db.as(bob, (tx) => tx.query(`insert into reports (location_id, reason) values ($1, 'spam')`, [id])),
    ).rejects.toThrow(/check constraint/)

    expect((await db.as(alice, (tx) => tx.query(`select * from reports`))).rows).toHaveLength(0)
    expect((await db.as(bob, (tx) => tx.query(`select * from reports`))).rows).toHaveLength(1)
    await expect(db.rpc(alice, 'admin_list_reports')).rejects.toThrow(/Admins only/)
    expect(await db.rpc(admin, 'admin_list_reports')).toHaveLength(1)
  })

  it('favorites are private', async () => {
    const id = await save(alice)
    await db.as(bob, (tx) => tx.query(`insert into favorites (location_id) values ($1)`, [id]))
    expect((await db.as(alice, (tx) => tx.query(`select * from favorites`))).rows).toHaveLength(0)
    const [loc] = await db.rpc<{ get_location: any }>(bob, 'get_location', { location_id: id })
    expect(loc.get_location.is_favorite).toBe(true)

    const favs = await db.rpc<{ get_favorites: any }>(bob, 'get_favorites')
    expect(favs.map((f) => f.get_favorites.id)).toEqual([id])
    expect(await db.rpc(alice, 'get_favorites')).toHaveLength(0)
  })

  it('lists my contributions', async () => {
    const id = await save(alice)
    await save(bob, { id, name: 'Better name' })
    await db.as(bob, (tx) =>
      tx.query(`insert into reviews (location_id, overall, cleanliness) values ($1, 4, 3)`, [id]),
    )

    const [{ get_my_contributions: mine }] = await db.rpc<{ get_my_contributions: any }>(bob, 'get_my_contributions')
    expect(mine.reviews).toHaveLength(1)
    expect(mine.reviews[0].location_name).toBe('Better name')
    expect(mine.edits).toEqual([expect.objectContaining({ kind: 'update', changed_fields: ['name'], location_id: id })])
    const [{ get_my_contributions: guest }] = await db.rpc<{ get_my_contributions: any }>(ANON, 'get_my_contributions')
    expect(guest).toBeNull()
  })
})

describe('moderation', () => {
  it('suspended users cannot contribute', async () => {
    const id = await save(alice)
    await db.rpc(admin, 'admin_set_suspension', { user_id: bob.userId, until: '2999-01-01T00:00:00Z', reason: 'spam' })
    await expect(save(bob)).rejects.toThrow(/suspended/)
    await expect(
      db.as(bob, (tx) => tx.query(`insert into reviews (location_id, overall, cleanliness) values ($1, 1, 1)`, [id])),
    ).rejects.toThrow(/row-level security/)

    await db.rpc(admin, 'admin_set_suspension', { user_id: bob.userId, until: null })
    await save(bob, { name: 'Back again' })
  })

  it('only admins can moderate', async () => {
    const id = await save(alice)
    await expect(db.rpc(alice, 'admin_set_location_deleted', { location_id: id, deleted: true })).rejects.toThrow(
      /Admins only/,
    )
    await expect(db.rpc(alice, 'admin_set_suspension', { user_id: bob.userId, until: null })).rejects.toThrow(
      /Admins only/,
    )
    await expect(db.rpc(admin, 'admin_set_suspension', { user_id: admin.userId, until: null })).rejects.toThrow(
      /yourself/,
    )
  })

  it('removed listings disappear for users but not admins', async () => {
    const id = await save(alice)
    await db.rpc(admin, 'admin_set_location_deleted', { location_id: id, deleted: true })
    expect(await search(ANON)).toHaveLength(0)
    expect((await db.rpc<{ get_location: any }>(ANON, 'get_location', { location_id: id }))[0].get_location).toBeNull()
    expect(
      (await db.rpc<{ get_location: any }>(admin, 'get_location', { location_id: id }))[0].get_location,
    ).not.toBeNull()
  })

  it('merges duplicates, moving reviews and favorites', async () => {
    const keep = await save(alice, { name: 'Gas Station' })
    const dupe = await save(bob, { name: 'Gas Station (dupe)', ...north(CAMPUS, 10) })
    const review = (c: Caller, loc: string, overall: number) =>
      db.as(c, (tx) =>
        tx.query(`insert into reviews (location_id, overall, cleanliness) values ($1, $2, 3)`, [loc, overall]),
      )
    await review(alice, keep, 5)
    await review(alice, dupe, 1) // same author on both: dropped
    await review(bob, dupe, 2) // moved
    await db.as(bob, (tx) => tx.query(`insert into favorites (location_id) values ($1)`, [dupe]))
    await db.as(bob, (tx) => tx.query(`insert into reports (location_id, reason) values ($1, 'duplicate')`, [dupe]))

    await db.rpc(admin, 'admin_merge_locations', { duplicate_id: dupe, keep_id: keep })

    const results = await search(ANON)
    expect(results.map((r) => r.name)).toEqual(['Gas Station'])
    expect(results[0].review_count).toBe(2)
    const favs = await db.as(bob, (tx) => tx.query<{ location_id: string }>(`select location_id from favorites`))
    expect(favs.rows).toEqual([{ location_id: keep }])
    expect(await db.rpc(admin, 'admin_list_reports', { status_filter: 'open' })).toHaveLength(0)
  })

  it('rolls a listing back to an earlier version', async () => {
    const id = await save(alice, { name: 'Good name' })
    await save(bob, { id, name: 'Vandalized', rooms: [{ designation: 'mens', layout: 'single_user' }] })
    const history = await db.rpc<{ id: number; kind: string }>(ANON, 'get_location_history', { location_id: id })
    const created = history.find((h) => h.kind === 'create')!

    await db.rpc(admin, 'admin_rollback_location', { edit_id: created.id })
    const [r] = await search(ANON)
    expect(r.name).toBe('Good name')
    expect(r.rooms).toHaveLength(2)
    const after = await db.rpc<{ kind: string }>(ANON, 'get_location_history', { location_id: id })
    expect(after[0].kind).toBe('rollback')
  })

  it('admins can hide reviews', async () => {
    const id = await save(alice)
    await db.as(bob, (tx) =>
      tx.query(`insert into reviews (location_id, overall, cleanliness, comment) values ($1, 1, 1, 'rude')`, [id]),
    )
    const [{ id: reviewId }] = await db.rpc<{ id: string }>(ANON, 'get_location_reviews', { location_id: id })
    await db.rpc(admin, 'admin_set_review_hidden', { review_id: reviewId, hidden: true })
    expect(await db.rpc(ANON, 'get_location_reviews', { location_id: id })).toHaveLength(0)
    expect((await search(ANON))[0].review_count).toBe(0)
  })
})
