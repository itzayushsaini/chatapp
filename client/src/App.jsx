import { Navigate, Route, Routes } from 'react-router'

import { ErrorScreen } from './components/common/ErrorScreen.jsx'
import { FullScreenLoader } from './components/common/Spinner.jsx'
import LoggedInLayout from './components/layout/LoggedInLayout.jsx'
import { useAuth } from './context/AuthContext.jsx'
import AdminPage from './pages/AdminPage.jsx'
import ChatPage from './pages/ChatPage.jsx'
import ForgotPasswordPage from './pages/ForgotPasswordPage.jsx'
import LandingPage from './pages/LandingPage.jsx'
import LoginPage from './pages/LoginPage.jsx'
import RegisterPage from './pages/RegisterPage.jsx'
import ResetPasswordPage from './pages/ResetPasswordPage.jsx'
import SettingsPage from './pages/SettingsPage.jsx'

// Seven routes. Which ones you may see depends only on whether you are
// logged in (and, for /admin, whether you are an admin), so the redirects
// all live here in one place:
//   "/"        -> the chat when logged in, the public home page when not
//   logged out -> "/settings" and "/admin" send you to /login
//   logged in  -> /login, /register, /forgot-password and /reset-password
//                 all send you to "/"
//   logged in but not an admin -> /admin sends you to "/"
//   anything else -> "/"
export default function App() {
  const { user, loading, bootError, retrySession } = useAuth()

  // Until /auth/me answers we do not know which page to show, so show
  // neither - this is what prevents the login page flashing on refresh.
  if (loading) return <FullScreenLoader />

  // The server could not be reached at all. Showing the login page here
  // would be wrong - they may well be logged in already.
  if (bootError) {
    return (
      <ErrorScreen
        message="We couldn't reach PingMe. Please check your internet connection and try again."
        onRetry={retrySession}
      />
    )
  }

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route path="/register" element={user ? <Navigate to="/" replace /> : <RegisterPage />} />
      <Route
        path="/forgot-password"
        element={user ? <Navigate to="/" replace /> : <ForgotPasswordPage />}
      />
      <Route
        path="/reset-password"
        element={user ? <Navigate to="/" replace /> : <ResetPasswordPage />}
      />
      {user ? (
        // The socket only exists inside the logged-in part of the app, and
        // both of these pages share it (see LoggedInLayout).
        <Route element={<LoggedInLayout />}>
          <Route path="/" element={<ChatPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      ) : (
        <>
          <Route path="/" element={<LandingPage />} />
          <Route path="/settings" element={<Navigate to="/login" replace />} />
        </>
      )}
      <Route
        path="/admin"
        element={
          !user ? (
            <Navigate to="/login" replace />
          ) : user.isAdmin ? (
            <AdminPage />
          ) : (
            <Navigate to="/" replace />
          )
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
