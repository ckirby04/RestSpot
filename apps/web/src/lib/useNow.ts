import { useEffect, useState } from 'react'

/**
 * The current time, refreshed every `intervalMs` (default: a minute). Use this instead
 * of `new Date()` in render so components stay pure and time-based UI (open now,
 * today's hours, suspensions) updates on its own.
 */
export function useNow(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}
