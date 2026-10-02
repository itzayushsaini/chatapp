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

// A post in the "PingMe" updates channel: text and/or one photo. Sent as
// multipart form data so the photo can go with it.
export const postUpdate = ({ text, image }) => {
  const form = new FormData()
  form.append('text', text)
  if (image) form.append('image', image)
  return http.post('/admin/updates', form).then((r) => r.data.update)
}

export const deleteUpdate = (id) => http.delete(`/admin/updates/${id}`)
