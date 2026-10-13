import { http } from './http.js'

export const getUpdatesSummary = () => http.get('/updates/summary').then((r) => r.data)

export const getUpdates = (before) =>
  http.get('/updates', { params: before ? { before } : {} }).then((r) => r.data)

// the server only moves the pointer forward, so an older id is harmless
export const markUpdatesRead = (upToId) => http.post('/updates/read', { upToId })
