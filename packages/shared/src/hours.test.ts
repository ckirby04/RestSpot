import { describe, expect, it } from 'vitest'
import { isOpenNow } from './hours.ts'
import type { DayHours, WeeklyHours } from './types.ts'

const week = (d: DayHours): WeeklyHours => [d, d, d, d, d, d, d]
const CHICAGO = 'America/Chicago'

// 2026-10-19 is a Monday. Chicago is UTC−5 (CDT) on that date.
const chicagoTime = (hhmm: string, date = '2026-10-19') => new Date(`${date}T${hhmm}:00-05:00`)

describe('isOpenNow', () => {
  it('handles a normal daytime interval', () => {
    const hours = week({ kind: 'open', open: '09:00', close: '17:00' })
    expect(isOpenNow(hours, CHICAGO, chicagoTime('08:59'))).toBe(false)
    expect(isOpenNow(hours, CHICAGO, chicagoTime('09:00'))).toBe(true)
    expect(isOpenNow(hours, CHICAGO, chicagoTime('16:59'))).toBe(true)
    expect(isOpenNow(hours, CHICAGO, chicagoTime('17:00'))).toBe(false)
  })

  it('uses the restroom time zone, not the viewer’s', () => {
    const hours = week({ kind: 'open', open: '09:00', close: '17:00' })
    // 10:00 in Chicago is 08:00 in Los Angeles: closed there, open here.
    const at = chicagoTime('10:00')
    expect(isOpenNow(hours, CHICAGO, at)).toBe(true)
    expect(isOpenNow(hours, 'America/Los_Angeles', at)).toBe(false)
  })

  it('handles intervals that run past midnight', () => {
    const hours = week({ kind: 'open', open: '18:00', close: '02:00' })
    expect(isOpenNow(hours, CHICAGO, chicagoTime('23:00'))).toBe(true)
    expect(isOpenNow(hours, CHICAGO, chicagoTime('01:30'))).toBe(true)
    expect(isOpenNow(hours, CHICAGO, chicagoTime('02:00'))).toBe(false)
    expect(isOpenNow(hours, CHICAGO, chicagoTime('12:00'))).toBe(false)
  })

  it('honors an overnight spill even when today is closed', () => {
    const hours = week({ kind: 'closed' })
    hours[0] = { kind: 'open', open: '20:00', close: '03:00' } // Sunday night
    expect(isOpenNow(hours, CHICAGO, chicagoTime('02:00'))).toBe(true) // Monday 2am
    expect(isOpenNow(hours, CHICAGO, chicagoTime('04:00'))).toBe(false)
  })

  it('returns null for unknown hours and true for 24h', () => {
    expect(isOpenNow(week({ kind: 'unknown' }), CHICAGO, chicagoTime('12:00'))).toBeNull()
    expect(isOpenNow(week({ kind: 'all_day' }), CHICAGO, chicagoTime('03:00'))).toBe(true)
  })
})
