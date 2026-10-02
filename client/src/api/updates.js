import { http } from './http.js'

// The "PingMe" updates channel - read by every logged-in user.

// { latest, unreadCount } for the pinned row in the chat list.
export const getUpdatesSummary = () => http.get('/updates/summary').then((r) => r.data)

// Without `before`: the latest page. With `before`: the page older than that
// post. Resolves to { updates, hasMore }, oldest -> newest (like chat history).
export const getUpdates = (before) =>
  http.get('/updates', { params: before ? { before } : {} }).then((r) => r.data)

// I have now read everything up to this post. The server only ever moves the
// pointer forward, so sending an older id is harmless.
export const markUpdatesRead = (upToId) => http.post('/updates/read', { upToId })
