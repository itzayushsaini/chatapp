import { http } from './http.js'

// Unauthenticated - safe to call before login (register/login pages, the
// announcement banner).
export const getPublicSettings = () => http.get('/settings/public').then((r) => r.data.settings)
