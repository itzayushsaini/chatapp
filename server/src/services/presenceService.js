// userId -> open connections; a count, so closing one of two tabs keeps the user online
const connections = new Map()

export function addConnection(userId) {
  const id = String(userId)
  const count = (connections.get(id) ?? 0) + 1
  connections.set(id, count)
  return count
}

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
