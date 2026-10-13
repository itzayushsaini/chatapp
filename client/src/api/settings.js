import { http } from './http.js'

export const getPublicSettings = () => http.get('/settings/public').then((r) => r.data.settings)
