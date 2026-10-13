import { http } from './http.js'

export const updateProfile = (fields) => http.patch('/users/me', fields).then((r) => r.data.user)

export const uploadAvatar = (image) => {
  const form = new FormData()
  form.append('avatar', image, 'avatar.webp')
  return http.put('/users/me/avatar', form).then((r) => r.data.user)
}

export const getBlocked = () => http.get('/users/me/blocked').then((r) => r.data.users)
export const blockUser = (userId) => http.post(`/users/${userId}/block`)
export const unblockUser = (userId) => http.delete(`/users/${userId}/block`)
