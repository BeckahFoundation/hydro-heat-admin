// Small timezone helpers (no dependency): the sender's quiet hours and daily caps are
// evaluated in the business timezone, not the server's.

function parts(date: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', weekday: 'short',
  })
  const map: Record<string, string> = {}
  for (const p of fmt.formatToParts(date)) map[p.type] = p.value
  return { ymd: `${map.year}-${map.month}-${map.day}`, hour: Number(map.hour) % 24, weekday: map.weekday }
}

export function safeTz(tz: string | null | undefined): string {
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz || 'UTC' }); return tz || 'UTC' } catch { return 'UTC' }
}

export function localDate(date: Date, tz: string): string {
  return parts(date, safeTz(tz)).ymd
}

export function localHour(date: Date, tz: string): number {
  return parts(date, safeTz(tz)).hour
}

export function isWeekend(date: Date, tz: string): boolean {
  const w = parts(date, safeTz(tz)).weekday
  return w === 'Sat' || w === 'Sun'
}

// quiet window [start, end) wrapping midnight when start > end
export function inQuietHours(date: Date, tz: string, start: number, end: number): boolean {
  if (start === end) return false
  const h = localHour(date, tz)
  return start < end ? h >= start && h < end : h >= start || h < end
}

export function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / 86_400_000)
}

export function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 86_400_000)
}

// Start of "tomorrow" in the business timezone, as an absolute instant (approximate to the hour).
export function nextLocalMidnight(now: Date, tz: string): Date {
  let d = new Date(now.getTime())
  const today = localDate(now, tz)
  // step forward hour by hour until the local date changes (cheap, max 24 iterations)
  for (let i = 0; i < 26; i++) {
    d = new Date(d.getTime() + 3_600_000)
    if (localDate(d, tz) !== today) {
      d.setUTCMinutes(0, 0, 0)
      return d
    }
  }
  return addDays(now, 1)
}
