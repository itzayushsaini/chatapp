import { Navigate, Route, Routes } from 'react-router'

import { FullScreenLoader } from './components/common/Spinner.jsx'
import { useAuth } from './context/AuthContext.jsx'
import { SocketProvider } from './context/SocketContext.jsx'
import ChatPage from './pages/ChatPage.jsx'
import ForgotPasswordPage from './pages/ForgotPasswordPage.jsx'
import LoginPage from './pages/LoginPage.jsx'
import RegisterPage from './pages/RegisterPage.jsx'
import ResetPasswordPage from './pages/ResetPasswordPage.jsx'

// Five routes. Which ones you may see depends only on whether you are
// logged in, so the redirects all live here in one place:
//   logged out -> "/" sends you to /login
//   logged in  -> /login, /register, /forgot-password and /reset-password
//                 all send you to "/"
//   anything else -> "/"
export default function App() {
  const { user, loading } = useAuth()

  // Until /auth/me answers we do not know which page to show, so show
  // neither - this is what prevents the login page flashing on refresh.
  if (loading) return <FullScreenLoader />

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
      <Route
        path="/"
        element={
          user ? (
            // The socket only exists inside the logged-in part of the app.
            <SocketProvider>
              <ChatPage />
            </SocketProvider>
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
