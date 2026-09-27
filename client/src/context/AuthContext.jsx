import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

import * as authApi from '../api/auth.js'
import { setUnauthorizedHandler } from '../api/http.js'
import { useChatStore } from '../store/useChatStore.js'

const AuthContext = createContext(null)

// Holds who is logged in. `loading` is true until /auth/me has answered, and
// the app shows a full-screen spinner until then - so a user who is already
// logged in never sees a flash of the login page on refresh.
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  // Forget the user AND everything we loaded for them, so the next person
  // to log in on this computer cannot see any of it.
  const clearSession = useCallback(() => {
    setUser(null)
    useChatStore.getState().reset()
  }, [])

  useEffect(() => {
    // The cookie is httpOnly, so JavaScript cannot check it directly. Asking
    // the server is the only way to know whether we are logged in.
    authApi
      .me()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false))
  }, [])

  // Any 401 from the API (expired session) logs us out on this side too.
  useEffect(() => setUnauthorizedHandler(clearSession), [clearSession])

  const value = useMemo(
    () => ({
      user,
      loading,
      login: async (identifier, password) => setUser(await authApi.login(identifier, password)),
      register: async (fields) => setUser(await authApi.register(fields)),
      logout: async () => {
        try {
          await authApi.logout()
        } finally {
          clearSession()
        }
      },
    }),
    [user, loading, clearSession],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}
