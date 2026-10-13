import axios from 'axios'

export const http = axios.create({
  baseURL: '/api',
  withCredentials: true,
})

// set by AuthContext, rather than imported, to avoid a circular import
let onUnauthorized = () => {}
export function setUnauthorizedHandler(handler) {
  onUnauthorized = handler
}

http.interceptors.response.use(
  (response) => response,
  (error) => {
    const url = error.config?.url ?? ''
    // a 401 from /auth/me means "not logged in yet", from /auth/login "wrong password"
    if (error.response?.status === 401 && url !== '/auth/me' && url !== '/auth/login') {
      onUnauthorized()
    }
    return Promise.reject(error)
  },
)

export function errorMessage(error) {
  return error?.response?.data?.message ?? 'Network error - please check your connection'
}
