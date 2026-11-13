const formatMinute = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

// The API uses an exclusive end. Include the entire selected last day.
export function rangeOf(days: number | null, now = new Date()) {
  if (!days) return { start: undefined, end: undefined }
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  start.setDate(start.getDate() - days + 1)
  const end = new Date(now)
  end.setHours(0, 0, 0, 0)
  end.setDate(end.getDate() + 1)
  return { start: formatMinute(start), end: formatMinute(end) }
}

export function calendarRange(from: string, to: string) {
  const end = new Date(`${to}T00:00:00`)
  end.setDate(end.getDate() + 1)
  return { start: `${from} 00:00`, end: formatMinute(end) }
}
