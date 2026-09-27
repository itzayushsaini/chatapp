import axios from 'axios'

// One axios instance for the whole app. The URL is relative ('/api'), so in
// development it goes to Vite (which proxies it to Express) and in production
// to the same server that served the page. No backend address is hard-coded.
export const http = axios.create({
  baseURL: '/api',
  withCredentials: true, // send the httpOnly session cookie
})

// AuthContext registers what to do when the session has ended. Set this way,
// rather than importing AuthContext here, to avoid a circular import.
let onUnauthorized = () => {}
export function setUnauthorizedHandler(handler) {
  onUnauthorized = handler
}

http.interceptors.response.use(
  (response) => response,
  (error) => {
    const url = error.config?.url ?? ''
    // A 401 on any normal call means the session expired or was revoked:
    // clear the user, which sends them to /login. Two exceptions:
    //   /auth/me    - a 401 there just means "not logged in yet"
    //   /auth/login - a 401 there means "wrong password", shown on the form
    if (error.response?.status === 401 && url !== '/auth/me' && url !== '/auth/login') {
      onUnauthorized()
    }
    return Promise.reject(error)
  },
)

// Every server error has the shape { message }. This turns any failure into
// one readable sentence for the UI.
export function errorMessage(error) {
  return error?.response?.data?.message ?? 'Network error - please check your connection'
}
