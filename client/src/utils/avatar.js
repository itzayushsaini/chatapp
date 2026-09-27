// No image uploads: an avatar is the user's initials on a coloured circle.
//
// Every colour here is dark enough for white text to pass WCAG contrast.
const COLORS = [
  '#1D4ED8', // blue
  '#6D28D9', // violet
  '#BE185D', // pink
  '#B91C1C', // red
  '#C2410C', // orange
  '#047857', // emerald
  '#0F766E', // teal
  '#4338CA', // indigo
]

// The colour is worked out from the username, so the same person always has
// the same colour on every screen and every device - nothing is stored.
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
