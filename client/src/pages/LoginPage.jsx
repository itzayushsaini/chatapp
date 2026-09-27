import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'

import { errorMessage } from '../api/http.js'
import Button from '../components/common/Button.jsx'
import GoogleButton from '../components/common/GoogleButton.jsx'
import Spinner from '../components/common/Spinner.jsx'
import TextField from '../components/common/TextField.jsx'
import AuthLayout from '../components/layout/AuthLayout.jsx'
import { useAuth } from '../context/AuthContext.jsx'

// The server's Google sign-in ends every failure with a redirect to
// /login?error=<code> (see auth.controller.js googleCallback) - only these
// known codes are ever shown, never text taken from the URL itself.
const GOOGLE_ERRORS = {
  google_failed: "Google sign-in didn't work. Please try again.",
  google_unavailable: 'Google sign-in is not available right now.',
  registration_closed: 'Registration is currently closed, so new accounts cannot be created.',
  suspended: 'Your account has been suspended.',
}

export default function LoginPage() {
  const { login } = useAuth()
  const [params] = useSearchParams()
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  // Ticked: stay logged in for 30 days, across browser restarts. Unticked:
  // logged out when the browser is closed - the safer choice on a shared
  // computer, so it is the default.
  const [rememberMe, setRememberMe] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  // Set by ResetPasswordPage after a successful reset (?reset=success).
  const justReset = params.get('reset') === 'success'
  // Set by the server when "Continue with Google" did not work out.
  const googleError = GOOGLE_ERRORS[params.get('error')]

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      // On success the user is set, and the router sends us to the chat.
      await login(identifier, password, rememberMe)
    } catch (err) {
      setError(errorMessage(err))
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Log in to continue to your chats"
      footer={
        <>
          Don&apos;t have an account?{' '}
          <Link to="/register" className="font-medium text-brand-600 hover:underline">
            Sign up
          </Link>
        </>
      }
    >
      {justReset && (
        <p className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700" role="status">
          Password reset. Please log in with your new password.
        </p>
      )}
      {googleError && (
        <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {googleError}
        </p>
      )}

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <TextField
          label="Username or email"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          autoComplete="username"
          autoCapitalize="none"
          required
        />
        <div>
          <TextField
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
          <div className="mt-2 flex items-center justify-between gap-2">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-brand-600 focus-visible:ring-2 focus-visible:ring-brand-500"
              />
              Remember me
            </label>
            <Link
              to="/forgot-password"
              className="rounded text-sm font-medium text-brand-600 hover:underline focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none"
            >
              Forgot password?
            </Link>
          </div>
        </div>

        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {error}
          </p>
        )}

        <Button
          type="submit"
          className="w-full"
          disabled={submitting || !identifier.trim() || !password}
        >
          {submitting && <Spinner light className="h-4 w-4" />}
          Log in
        </Button>
      </form>
      <GoogleButton />
    </AuthLayout>
  )
}
