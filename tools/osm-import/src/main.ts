// Import restrooms from OpenStreetMap into a SQL file.
//
//   npm run import -w @restspot/osm-import -- --preset nwa --likely --out ../../supabase/seed/osm-nwa.sql
//
// The bbox is south,west,north,east. Uses the public Overpass API (free, no key);
// please keep areas reasonable (a metro area or a state).
import { writeFileSync } from 'node:fs'
import { overpassLikelyQuery, overpassQuery, toLikelyListing, toListing, type OsmElement } from './osm.ts'
import { toSql } from './sql.ts'

const PRESETS: Record<string, [number, number, number, number]> = {
  // Northwest Arkansas: Fayetteville, Springdale, Rogers, Bentonville.
  nwa: [35.95, -94.35, 36.45, -94.0],
  arkansas: [33.0, -94.62, 36.5, -89.64],
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

async function main() {
  const preset = arg('preset') ?? 'nwa'
  const bboxArg = arg('bbox')
  const bbox = bboxArg ? (bboxArg.split(',').map(Number) as [number, number, number, number]) : PRESETS[preset]
  if (!bbox || bbox.length !== 4 || bbox.some(Number.isNaN)) {
    throw new Error(`Use --bbox south,west,north,east or --preset ${Object.keys(PRESETS).join('|')}`)
  }
  const out = arg('out') ?? `osm-${bboxArg ? 'bbox' : preset}.sql`
  const endpoint = arg('endpoint') ?? 'https://overpass-api.de/api/interpreter'

  const includeLikely = process.argv.includes('--likely')

  // The public Overpass server rate-limits (429) and returns 5xx under load; back off and retry.
  async function overpass(query: string): Promise<OsmElement[]> {
    for (let attempt = 0, wait = 15; ; attempt++, wait *= 2) {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'RestSpot-capstone-importer/0.1',
        },
        body: new URLSearchParams({ data: query }),
      })
      if (res.ok) return ((await res.json()) as { elements: OsmElement[] }).elements
      if ([429, 502, 503, 504].includes(res.status) && attempt < 4) {
        console.log(`Overpass is busy (${res.status}); retrying in ${wait}s…`)
        await new Promise((r) => setTimeout(r, wait * 1000))
        continue
      }
      throw new Error(`Overpass returned ${res.status}: ${(await res.text()).slice(0, 300)}`)
    }
  }

  console.log(`Querying Overpass for restrooms in ${bbox.join(',')}…`)
  const known = (await overpass(overpassQuery(bbox))).map(toListing)
  let likely: ReturnType<typeof toLikelyListing>[] = []
  if (includeLikely) {
    console.log('Querying Overpass for places that likely have restrooms…')
    likely = (await overpass(overpassLikelyQuery(bbox))).map(toLikelyListing)
  }

  // Mapped restrooms win over "likely" ones for the same OSM element.
  const seen = new Set<string>()
  const listings = [...known, ...likely]
    .filter((l): l is NonNullable<typeof l> => l !== null)
    .filter((l) => (seen.has(l.sourceRef) ? false : (seen.add(l.sourceRef), true)))

  const mapped = listings.filter((l) => l.source === 'osm')
  const withRooms = mapped.filter((l) => l.rooms.length > 0).length
  const withHours = listings.filter((l) => l.hours.some((d) => d.kind !== 'unknown')).length
  console.log(
    `${mapped.length} mapped restrooms (${withRooms} with room details), ` +
      `${listings.length - mapped.length} likely restrooms, ${withHours} with hours.`,
  )

  writeFileSync(out, toSql(listings, `OSM import of bbox ${bbox.join(',')} on ${new Date().toISOString()}`))
  console.log(`Wrote ${out}`)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
