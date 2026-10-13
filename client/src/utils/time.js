function startOfDay(date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

// 0 = today, 1 = yesterday, ... (round, because a DST day isn't exactly 24 h)
function daysAgo(date) {
  return Math.round((startOfDay(new Date()) - startOfDay(date)) / 86_400_000)
}

export function formatTime(date) {
  return new Date(date).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

export function dayLabel(date) {
  const days = daysAgo(date)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  return new Date(date).toLocaleDateString([], { day: 'numeric', month: 'long', year: 'numeric' })
}

export function isSameDay(a, b) {
  return startOfDay(a).getTime() === startOfDay(b).getTime()
}

export function previewTime(date) {
  const days = daysAgo(date)
  if (days === 0) return formatTime(date)
  if (days === 1) return 'Yesterday'
  return new Date(date).toLocaleDateString([], { day: '2-digit', month: '2-digit', year: '2-digit' })
}

// 75000 ms -> "1:15"
export function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.floor((ms || 0) / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = String(totalSeconds % 60).padStart(2, '0')
  return `${minutes}:${seconds}`
}

export function lastSeenLabel(date) {
  const days = daysAgo(date)
  if (days === 0) return `Last seen today at ${formatTime(date)}`
  if (days === 1) return `Last seen yesterday at ${formatTime(date)}`
  return `Last seen ${new Date(date).toLocaleDateString([], { day: 'numeric', month: 'short' })}`
}

// formatted in UTC because the server's days are UTC days
export function utcDayShort(isoDate) {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString([], { day: 'numeric', month: 'short', timeZone: 'UTC' })
}
