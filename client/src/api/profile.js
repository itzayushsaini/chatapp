import { http } from './http.js'

// Send only the fields that changed: { displayName?, bio?, username? }.
// Resolves to my updated profile.
export const updateProfile = (fields) => http.patch('/users/me', fields).then((r) => r.data.user)

// `image` is a Blob (the cropped picture). FormData makes axios send
// multipart/form-data, the format file uploads use.
export const uploadAvatar = (image) => {
  const form = new FormData()
  form.append('avatar', image, 'avatar.webp')
  return http.put('/users/me/avatar', form).then((r) => r.data.user)
}

export const removeAvatar = () => http.delete('/users/me/avatar').then((r) => r.data.user)
