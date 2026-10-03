import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'

import * as authApi from '../api/auth.js'
import { setUnauthorizedHandler } from '../api/http.js'
import { useChatStore } from '../store/useChatStore.js'
import { removePushSubscription } from '../utils/push.js'
import { applyTheme } from '../utils/theme.js'

const AuthContext = createContext(null)

// Holds who is logged in. `loading` is true until /auth/me has answered, and
// the app shows a full-screen spinner until then - so a user who is already
// logged in never sees a flash of the login page on refresh.
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  // True when the very first "am I logged in?" check could not reach the
  // server at all (offline, server down) - shown as an error screen with a
  // Try Again button, instead of wrongly showing the login page.
  const [bootError, setBootError] = useState(false)

  // Kept in a ref so clearSession (below) never has to change when the
  // router hands us a new navigate function.
  const navigate = useNavigate()
  const navigateRef = useRef(navigate)
  useEffect(() => {
    navigateRef.current = navigate
  })

  // Forget the user AND everything we loaded for them, so the next person
  // to log in on this computer cannot see any of it.
  // Then go to /login on purpose: "/" is the public home page for anyone
  // logged out, so without this, logging out (or a session expiring) would
  // land on the home page instead of the login form.
  const clearSession = useCallback(() => {
    setUser(null)
    useChatStore.getState().reset()
    navigateRef.current('/login', { replace: true })
  }, [])

  // The cookie is httpOnly, so JavaScript cannot check it directly. Asking
  // the server is the only way to know whether we are logged in.
  const checkSession = useCallback(() => {
    setLoading(true)
    setBootError(false)
    authApi
      .me()
      .then(setUser)
      .catch((err) => {
        // A 401 is a real answer ("not logged in"). No response at all, or a
        // server error, means we simply do not know yet.
        if (err.response?.status === 401) setUser(null)
        else setBootError(true)
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(checkSession, [checkSession])

  // My saved theme wins over whatever this browser remembered - so it
  // follows me to a new device - and changes live when I (or my other tab)
  // pick a different one.
  const theme = user?.theme
  useEffect(() => {
    if (theme) applyTheme(theme)
  }, [theme])

  // Merges changes into my profile: after I edit it, or when my other tab
  // edits it (the user:updated socket event).
  const updateUser = useCallback((changes) => {
    setUser((current) => (current ? { ...current, ...changes } : current))
  }, [])

  // Any 401 from the API (expired session) logs us out on this side too.
  useEffect(() => setUnauthorizedHandler(clearSession), [clearSession])

  const value = useMemo(
    () => ({
      user,
      loading,
      bootError,
      retrySession: checkSession,
      updateUser,
      login: async (identifier, password, rememberMe) =>
        setUser(await authApi.login(identifier, password, rememberMe)),
      register: async (fields) => setUser(await authApi.register(fields)),
      logout: async () => {
        try {
          // First, while still logged in: this device stops getting push
          // notifications, so the next person on this computer never sees
          // mine. Never waits more than a few seconds for it.
          await Promise.race([removePushSubscription(), new Promise((resolve) => setTimeout(resolve, 3000))])
          await authApi.logout()
        } finally {
          clearSession()
        }
      },
    }),
    [user, loading, bootError, checkSession, clearSession, updateUser],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}
