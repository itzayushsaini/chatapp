import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'

import * as authApi from '../api/auth.js'
import { setUnauthorizedHandler } from '../api/http.js'
import { useChatStore } from '../store/useChatStore.js'
import { removePushSubscription } from '../utils/push.js'
import { applyTheme } from '../utils/theme.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [bootError, setBootError] = useState(false)

  // in a ref so clearSession never changes when the router gives a new navigate
  const navigate = useNavigate()
  const navigateRef = useRef(navigate)
  useEffect(() => {
    navigateRef.current = navigate
  })

  // Goes to /login on purpose: "/" is the home page when logged out.
  const clearSession = useCallback(() => {
    setUser(null)
    useChatStore.getState().reset()
    navigateRef.current('/login', { replace: true })
  }, [])

  // the cookie is httpOnly, so only the server can tell us if we're logged in
  const checkSession = useCallback(() => {
    setLoading(true)
    setBootError(false)
    authApi
      .me()
      .then(setUser)
      .catch((err) => {
        // 401 means "not logged in"; anything else means we don't know yet
        if (err.response?.status === 401) setUser(null)
        else setBootError(true)
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(checkSession, [checkSession])

  // the account's theme wins over what this browser remembered
  const theme = user?.theme
  useEffect(() => {
    if (theme) applyTheme(theme)
  }, [theme])

  const updateUser = useCallback((changes) => {
    setUser((current) => (current ? { ...current, ...changes } : current))
  }, [])

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
          // unsubscribe push while still logged in, so the next user here never gets mine
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
