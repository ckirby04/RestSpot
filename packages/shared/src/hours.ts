import type { DayHours, WeeklyHours } from './types.ts'

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/

export function isValidHHMM(value: string): boolean {
  return HHMM.test(value)
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** Day of week (0 = Sunday) and minutes since midnight at `now` in `timeZone`. */
export function localTimeIn(timeZone: string, now: Date): { day: number; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  return {
    day: WEEKDAYS.indexOf(get('weekday')),
    minutes: Number(get('hour')) * 60 + Number(get('minute')),
  }
}

/**
 * Whether a restroom is open at `now`, evaluated in the restroom's own time zone.
 * Returns null when the relevant hours are unknown.
 */
export function isOpenNow(hours: WeeklyHours, timeZone: string, now: Date = new Date()): boolean | null {
  const { day, minutes } = localTimeIn(timeZone, now)
  const today = hours[day]
  const yesterday = hours[(day + 6) % 7]

  // Yesterday's hours may run past midnight into today.
  const spill = spillsPastMidnight(yesterday)
  if (spill !== null && minutes < spill) return true

  switch (today.kind) {
    case 'unknown':
      return null
    case 'closed':
      return false
    case 'all_day':
      return true
    case 'open': {
      const open = toMinutes(today.open)
      const close = toMinutes(today.close)
      if (close > open) return minutes >= open && minutes < close
      // Overnight interval (or open == close, treated as 24h).
      return minutes >= open
    }
  }
}

/** If `day` closes after midnight, the minute of the next day at which it closes. */
function spillsPastMidnight(day: DayHours): number | null {
  if (day.kind !== 'open') return null
  const open = toMinutes(day.open)
  const close = toMinutes(day.close)
  return close <= open ? close : null
}
