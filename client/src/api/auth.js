import { http } from './http.js'

// Each function returns just the data the caller needs.
export const me = () => http.get('/auth/me').then((r) => r.data.user)

export const register = (fields) => http.post('/auth/register', fields).then((r) => r.data.user)

export const login = (identifier, password, rememberMe = false) =>
  http.post('/auth/login', { identifier, password, rememberMe }).then((r) => r.data.user)

export const logout = () => http.post('/auth/logout')

export const forgotPassword = (email) =>
  http.post('/auth/forgot-password', { email }).then((r) => r.data.message)

export const resetPassword = (email, token, password) =>
  http.post('/auth/reset-password', { email, token, password }).then((r) => r.data.message)

export const changePassword = (currentPassword, newPassword) =>
  http.patch('/auth/password', { currentPassword, newPassword }).then((r) => r.data.message)
