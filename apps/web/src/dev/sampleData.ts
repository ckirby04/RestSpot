// Sample listings around the University of Arkansas for local development.
// Coordinates and details are approximate and only for exercising the UI.

/** Bump to rebuild existing local databases when the sample data changes. */
export const SEED_VERSION = 2
import type { PGlite } from '@electric-sql/pglite'

type Day = { kind: 'unknown' | 'closed' | 'all_day' } | { kind: 'open'; open: string; close: string }
type Room = [designation: string, layout: string, changingTable: string, ada: string]

const open = (o: string, c: string): Day => ({ kind: 'open', open: o, close: c })
const every = (d: Day): Day[] => Array(7).fill(d)
const weekdays = (d: Day, weekend: Day): Day[] => [weekend, d, d, d, d, d, weekend]

const STANDARD: Room[] = [
  ['mens', 'multi_stall', 'no', 'yes'],
  ['womens', 'multi_stall', 'yes', 'yes'],
]

const SAMPLES: {
  name: string
  lat: number
  lng: number
  access: string
  fee: string
  key: string
  hours: Day[]
  rooms: Room[]
  notes?: string
  verified?: boolean
}[] = [
  {
    name: 'Arkansas Union',
    lat: 36.0686,
    lng: -94.176,
    access: 'public',
    fee: 'free',
    key: 'no',
    hours: weekdays(open('07:00', '23:00'), open('10:00', '22:00')),
    rooms: [...STANDARD, ['all_gender', 'single_user', 'yes', 'yes']],
    notes: 'All-gender restroom on the second floor near the ballroom.',
    verified: true,
  },
  {
    name: 'Mullins Library',
    lat: 36.0688,
    lng: -94.173,
    access: 'public',
    fee: 'free',
    key: 'no',
    hours: weekdays(open('07:30', '02:00'), open('10:00', '22:00')),
    rooms: STANDARD,
    verified: true,
  },
  {
    name: 'Fayetteville Public Library',
    lat: 36.0596,
    lng: -94.1617,
    access: 'public',
    fee: 'free',
    key: 'no',
    hours: [{ kind: 'closed' }, ...Array(5).fill(open('09:00', '20:00')), open('09:00', '17:00')],
    rooms: [...STANDARD, ['all_gender', 'family', 'yes', 'yes']],
    notes: 'Family restroom by the children’s area.',
    verified: true,
  },
  {
    name: 'Wilson Park',
    lat: 36.0745,
    lng: -94.1657,
    access: 'public',
    fee: 'free',
    key: 'no',
    hours: every(open('06:00', '23:00')),
    rooms: [
      ['mens', 'multi_stall', 'no', 'unknown'],
      ['womens', 'multi_stall', 'unknown', 'unknown'],
    ],
    notes: 'Seasonal — may be locked in winter.',
  },
  {
    name: 'Starbucks — Dickson Street',
    lat: 36.0663,
    lng: -94.1636,
    access: 'customers_only',
    fee: 'free',
    key: 'yes',
    hours: every(open('05:30', '21:00')),
    rooms: [['all_gender', 'single_user', 'yes', 'yes']],
    notes: 'Door code is on your receipt.',
  },
  {
    name: 'Walmart Supercenter — MLK Blvd',
    lat: 36.052,
    lng: -94.188,
    access: 'public',
    fee: 'free',
    key: 'no',
    hours: every(open('06:00', '23:00')),
    rooms: [...STANDARD, ['all_gender', 'family', 'yes', 'yes']],
    verified: true,
  },
  {
    name: 'Shell — Razorback Road',
    lat: 36.056,
    lng: -94.179,
    access: 'customers_only',
    fee: 'free',
    key: 'yes',
    hours: every({ kind: 'all_day' }),
    rooms: [['all_gender', 'single_user', 'no', 'no']],
    notes: 'Ask the cashier for the key.',
  },
  {
    name: 'Bud Walton Arena',
    lat: 36.063,
    lng: -94.178,
    access: 'restricted',
    fee: 'free',
    key: 'no',
    hours: every({ kind: 'unknown' }),
    rooms: STANDARD,
    notes: 'Open to ticket holders during events.',
  },
  {
    name: 'Northwest Arkansas Mall',
    lat: 36.1033,
    lng: -94.1755,
    access: 'public',
    fee: 'free',
    key: 'no',
    hours: weekdays(open('10:00', '21:00'), open('11:00', '19:00')),
    rooms: [...STANDARD, ['all_gender', 'family', 'yes', 'yes']],
    notes: 'Family restrooms near the food court.',
  },
  {
    name: 'Gregory Park',
    lat: 36.079,
    lng: -94.147,
    access: 'public',
    fee: 'free',
    key: 'no',
    hours: every({ kind: 'unknown' }),
    rooms: [['all_gender', 'single_user', 'unknown', 'yes']],
  },
  {
    name: 'Fayetteville Square Pay Toilet',
    lat: 36.0627,
    lng: -94.1597,
    access: 'public',
    fee: 'paid',
    key: 'no',
    hours: every(open('08:00', '20:00')),
    rooms: [['all_gender', 'single_user', 'no', 'yes']],
    notes: '25¢ — fictional example of a paid restroom.',
  },
  {
    name: 'Chick-fil-A — Wedington Drive',
    lat: 36.073,
    lng: -94.201,
    access: 'customers_only',
    fee: 'free',
    key: 'no',
    hours: [{ kind: 'closed' }, ...Array(6).fill(open('06:30', '22:00'))],
    rooms: STANDARD,
  },
]

const REVIEWS: [sampleIndex: number, reviewer: 0 | 1, overall: number, cleanliness: number, comment: string | null, anonymous: boolean][] = [
  [0, 0, 5, 5, 'Always clean, plenty of stalls.', false],
  [0, 1, 4, 4, null, true],
  [1, 0, 4, 3, 'Busy during finals week.', false],
  [2, 1, 5, 5, 'Great family room with a changing table.', false],
  [3, 0, 2, 2, 'Needs maintenance.', true],
  [4, 1, 4, 4, null, false],
  [5, 0, 3, 3, null, false],
  [6, 1, 2, 1, 'Pretty rough.', true],
  [8, 0, 4, 4, 'Family room was spotless.', false],
]

export async function seedSampleData(
  pg: PGlite,
  accounts: readonly { email: string; password: string; displayName: string; admin: boolean }[],
  sha256: (s: string) => Promise<string>,
) {
  const userIds: string[] = []
  for (const a of accounts) {
    const { rows } = await pg.query<{ id: string }>(
      `insert into auth.users (email, raw_user_meta_data, dev_password_sha256) values ($1, $2, $3) returning id`,
      [a.email, JSON.stringify({ display_name: a.displayName }), await sha256(a.password)],
    )
    userIds.push(rows[0].id)
    if (a.admin) await pg.query(`update public.profiles set role = 'admin' where id = $1`, [rows[0].id])
  }

  const ids: string[] = []
  for (const s of SAMPLES) {
    const { rows } = await pg.query<{ id: string }>(
      `insert into public.locations (name, geog, access_type, fee, key_required, hours, notes, verified, last_confirmed_at, created_by)
       values ($1, extensions.st_setsrid(extensions.st_makepoint($3, $2), 4326)::extensions.geography, $4, $5, $6, $7, $8, $9,
               case when $9 then now() - interval '3 days' end, $10)
       returning id`,
      [s.name, s.lat, s.lng, s.access, s.fee, s.key, JSON.stringify(s.hours), s.notes ?? null, s.verified ?? false, userIds[0]],
    )
    const id = rows[0].id
    ids.push(id)
    for (const [i, [designation, layout, changing, ada]] of s.rooms.entries()) {
      await pg.query(
        `insert into public.rooms (location_id, designation, layout, changing_table, ada_accessible, position) values ($1, $2, $3, $4, $5, $6)`,
        [id, designation, layout, changing, ada, i],
      )
    }
    // Backdated so the sample data doesn't count against the demo user's rate limit.
    await pg.query(
      `insert into public.location_edits (location_id, editor_id, kind, snapshot, created_at)
       select l.id, $2, 'create', public.location_json(l), now() - interval '30 days' from public.locations l where l.id = $1`,
      [id, userIds[0]],
    )
  }

  for (const [idx, reviewer, overall, cleanliness, comment, anonymous] of REVIEWS) {
    await pg.query(
      `insert into public.reviews (location_id, author_id, overall, cleanliness, comment, anonymous) values ($1, $2, $3, $4, $5, $6)`,
      [ids[idx], userIds[reviewer], overall, cleanliness, comment, anonymous],
    )
  }
  await pg.query(
    `insert into public.reports (location_id, reporter_id, reason, comment) values ($1, $2, 'closed', 'Locked every time I visit after 9pm.')`,
    [ids[3], userIds[0]],
  )
}
