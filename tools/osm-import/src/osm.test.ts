import { describe, expect, it } from 'vitest'
import { parseOpeningHours, toLikelyListing, toListing } from './osm.ts'

describe('parseOpeningHours', () => {
  it('parses 24/7 and simple weekly rules', () => {
    expect(parseOpeningHours('24/7').every((d) => d.kind === 'all_day')).toBe(true)
    const h = parseOpeningHours('Mo-Fr 08:00-17:00; Sa 09:00-12:00; Su off')
    expect(h[0]).toEqual({ kind: 'closed' })
    expect(h[1]).toEqual({ kind: 'open', open: '08:00', close: '17:00' })
    expect(h[5]).toEqual({ kind: 'open', open: '08:00', close: '17:00' })
    expect(h[6]).toEqual({ kind: 'open', open: '09:00', close: '12:00' })
  })

  it('handles day lists, wrapping ranges, and midnight', () => {
    const h = parseOpeningHours('Fr-Mo 6:00-24:00; Tu,We,Th 00:00-24:00')
    expect(h[5]).toEqual({ kind: 'open', open: '06:00', close: '23:59' })
    expect(h[0]).toEqual({ kind: 'open', open: '06:00', close: '23:59' })
    expect(h[1]).toEqual({ kind: 'open', open: '06:00', close: '23:59' })
    expect(h[3]).toEqual({ kind: 'all_day' })
  })

  it('gives up on syntax it does not understand', () => {
    expect(parseOpeningHours('Mo-Fr 08:00-12:00,13:00-17:00').every((d) => d.kind === 'unknown')).toBe(true)
    expect(parseOpeningHours('sunrise-sunset').every((d) => d.kind === 'unknown')).toBe(true)
    expect(parseOpeningHours(undefined).every((d) => d.kind === 'unknown')).toBe(true)
  })
})

describe('toListing', () => {
  it('maps a public toilets feature with gender and accessibility tags', () => {
    const l = toListing({
      type: 'node',
      id: 1,
      lat: 36.06,
      lon: -94.17,
      tags: { amenity: 'toilets', name: 'Park Restrooms', male: 'yes', female: 'yes', wheelchair: 'yes', fee: 'no', changing_table: 'yes', opening_hours: '24/7' },
    })!
    expect(l.sourceRef).toBe('osm:node/1')
    expect(l.accessType).toBe('public')
    expect(l.fee).toBe('free')
    expect(l.rooms.map((r) => r.designation)).toEqual(['mens', 'womens'])
    expect(l.rooms.every((r) => r.ada_accessible === 'yes' && r.changing_table === 'yes')).toBe(true)
    expect(l.hours[3]).toEqual({ kind: 'all_day' })
  })

  it('records no rooms when OSM does not say', () => {
    const l = toListing({ type: 'node', id: 2, lat: 1, lon: 2, tags: { amenity: 'toilets' } })!
    expect(l.name).toBe('Public restroom')
    expect(l.rooms).toEqual([])
    expect(l.fee).toBe('unknown')
  })

  it('imports POIs only when tagged with toilets=yes, using toilets:* details', () => {
    expect(toListing({ type: 'node', id: 3, lat: 1, lon: 2, tags: { amenity: 'fuel', name: 'Shell' } })).toBeNull()
    const l = toListing({
      type: 'way',
      id: 4,
      center: { lat: 1, lon: 2 },
      tags: { amenity: 'fuel', brand: 'Shell', toilets: 'yes', 'toilets:wheelchair': 'no', 'toilets:unisex': 'yes', 'toilets:access': 'customers' },
    })!
    expect(l.name).toBe('Shell')
    expect(l.accessType).toBe('customers_only')
    expect(l.rooms).toEqual([{ designation: 'all_gender', layout: 'single_user', changing_table: 'unknown', ada_accessible: 'no' }])
  })

  it('skips private restrooms and unnamed POIs', () => {
    expect(toListing({ type: 'node', id: 5, lat: 1, lon: 2, tags: { amenity: 'toilets', access: 'private' } })).toBeNull()
    expect(toListing({ type: 'node', id: 6, lat: 1, lon: 2, tags: { shop: 'convenience', toilets: 'yes' } })).toBeNull()
  })
})

describe('toLikelyListing', () => {
  it('imports rest areas and libraries as public, chains and fuel as customers only', () => {
    const rest = toLikelyListing({ type: 'node', id: 10, lat: 1, lon: 2, tags: { highway: 'rest_area' } })!
    expect(rest).toMatchObject({ name: 'Rest area', accessType: 'public', fee: 'free', rooms: [] })
    const lib = toLikelyListing({ type: 'way', id: 11, center: { lat: 1, lon: 2 }, tags: { amenity: 'library', name: 'City Library' } })!
    expect(lib.accessType).toBe('public')
    const mcd = toLikelyListing({
      type: 'node',
      id: 12,
      lat: 1,
      lon: 2,
      tags: { amenity: 'fast_food', brand: "McDonald's", name: "McDonald's", 'addr:housenumber': '1', 'addr:street': 'Main St', opening_hours: '24/7' },
    })!
    expect(mcd).toMatchObject({ name: "McDonald's — 1 Main St", accessType: 'customers_only' })
    expect(mcd.hours[0]).toEqual({ kind: 'all_day' })
  })

  it('skips unknown restaurants, private libraries, and places already tagged with toilets', () => {
    expect(toLikelyListing({ type: 'node', id: 13, lat: 1, lon: 2, tags: { amenity: 'fast_food', name: 'Joe’s Grill' } })).toBeNull()
    expect(toLikelyListing({ type: 'node', id: 14, lat: 1, lon: 2, tags: { amenity: 'library', access: 'private', name: 'X' } })).toBeNull()
    expect(toLikelyListing({ type: 'node', id: 15, lat: 1, lon: 2, tags: { amenity: 'fuel', brand: 'Shell', toilets: 'no' } })).toBeNull()
  })
})
