// Who is online, kept in memory: userId -> number of open connections.
//
// We COUNT connections instead of storing true/false because one user can
// have several tabs open. Closing one of two tabs takes the count from 2 to
// 1, and the user correctly stays online.
//
// Because this lives in the memory of one Node process, the app runs as a
// single instance (see "Scaling note" in the README).
const connections = new Map()

// Returns the new count, so the caller knows when it went 0 -> 1.
export function addConnection(userId) {
  const id = String(userId)
  const count = (connections.get(id) ?? 0) + 1
  connections.set(id, count)
  return count
}

// Returns the new count, so the caller knows when it went 1 -> 0.
export function removeConnection(userId) {
  const id = String(userId)
  const count = (connections.get(id) ?? 1) - 1
  if (count <= 0) connections.delete(id)
  else connections.set(id, count)
  return Math.max(count, 0)
}

export function isOnline(userId) {
  return connections.has(String(userId))
}
