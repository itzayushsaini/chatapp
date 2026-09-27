import { http } from './http.js'

export const getSettings = () => http.get('/admin/settings').then((r) => r.data.settings)

export const updateSettings = (patch) =>
  http.patch('/admin/settings', patch).then((r) => r.data.settings)

export const listUsers = (params) => http.get('/admin/users', { params }).then((r) => r.data)

export const suspendUser = (userId) =>
  http.patch(`/admin/users/${userId}/suspend`).then((r) => r.data.user)

export const unsuspendUser = (userId) =>
  http.patch(`/admin/users/${userId}/unsuspend`).then((r) => r.data.user)

export const deleteUser = (userId) => http.delete(`/admin/users/${userId}`)

export const getStats = () => http.get('/admin/stats').then((r) => r.data)
