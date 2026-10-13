// all dark enough for white text to pass WCAG contrast
const COLORS = [
  '#1D4ED8',
  '#6D28D9',
  '#BE185D',
  '#B91C1C',
  '#C2410C',
  '#047857',
  '#0F766E',
  '#4338CA',
]

export function avatarColor(username) {
  let hash = 0
  for (const char of username) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return COLORS[hash % COLORS.length]
}

// "Rohit Kumar" -> "RK", "priya" -> "P"
export function initials(displayName) {
  const words = displayName.trim().split(/\s+/)
  const letters = words.length > 1 ? words[0][0] + words[words.length - 1][0] : words[0][0]
  return letters.toUpperCase()
}
