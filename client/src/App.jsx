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
import NotFoundPage from './pages/NotFoundPage.jsx'
import RegisterPage from './pages/RegisterPage.jsx'
import ResetPasswordPage from './pages/ResetPasswordPage.jsx'
import SettingsPage from './pages/SettingsPage.jsx'

export default function App() {
  const { user, loading, bootError, retrySession } = useAuth()

  // wait for /auth/me so the login page doesn't flash on refresh
  if (loading) return <FullScreenLoader />

  // server unreachable: not the login page, they may already be logged in
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
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
