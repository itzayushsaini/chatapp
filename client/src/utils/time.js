// All dates arrive from the server as ISO strings in UTC. The browser's
// locale functions convert them to the user's own time zone.

function startOfDay(date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

// 0 = today, 1 = yesterday, 2 = the day before, ...
function daysAgo(date) {
  return Math.round((startOfDay(new Date()) - startOfDay(date)) / 86_400_000)
}

// "10:24 AM"
export function formatTime(date) {
  return new Date(date).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

// Date separators in a chat: "Today", "Yesterday", then "12 September 2026".
export function dayLabel(date) {
  const days = daysAgo(date)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  return new Date(date).toLocaleDateString([], { day: 'numeric', month: 'long', year: 'numeric' })
}

export function isSameDay(a, b) {
  return startOfDay(a).getTime() === startOfDay(b).getTime()
}

// Short time for the sidebar: "10:24 AM", "Yesterday" or "12/09/26".
export function previewTime(date) {
  const days = daysAgo(date)
  if (days === 0) return formatTime(date)
  if (days === 1) return 'Yesterday'
  return new Date(date).toLocaleDateString([], { day: '2-digit', month: '2-digit', year: '2-digit' })
}

// A length of time as a clock: 4200 ms -> "0:04", 75000 ms -> "1:15".
export function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.floor((ms || 0) / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = String(totalSeconds % 60).padStart(2, '0')
  return `${minutes}:${seconds}`
}

// For the chat header: "Last seen today at 10:24 AM".
export function lastSeenLabel(date) {
  const days = daysAgo(date)
  if (days === 0) return `Last seen today at ${formatTime(date)}`
  if (days === 1) return `Last seen yesterday at ${formatTime(date)}`
  return `Last seen ${new Date(date).toLocaleDateString([], { day: 'numeric', month: 'short' })}`
}
