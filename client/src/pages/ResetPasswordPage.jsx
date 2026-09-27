import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'

import * as authApi from '../api/auth.js'
import { errorMessage } from '../api/http.js'
import Button from '../components/common/Button.jsx'
import Spinner from '../components/common/Spinner.jsx'
import TextField from '../components/common/TextField.jsx'
import AuthLayout from '../components/layout/AuthLayout.jsx'

// Reached from the link inside the reset email: /reset-password?token=...&email=...
export default function ResetPasswordPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const email = params.get('email') ?? ''
  const token = params.get('token') ?? ''

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // A malformed or missing link - no point showing a form that cannot work.
  if (!email || !token) {
    return (
      <AuthLayout
        title="Invalid reset link"
        subtitle="This link is missing some information. Request a new one below."
        footer={
          <Link to="/login" className="font-medium text-brand-600 hover:underline">
            Back to log in
          </Link>
        }
      >
        <Button className="w-full" onClick={() => navigate('/forgot-password')}>
          Request a new link
        </Button>
      </AuthLayout>
    )
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    if (password !== confirm) {
      setError('Passwords do not match')
      return
    }
    setSubmitting(true)
    try {
      await authApi.resetPassword(email, token, password)
      // Not auto-logged-in: a fresh, explicit login is the clearer signal
      // that the new password is the one now in effect.
      navigate('/login?reset=success', { replace: true })
    } catch (err) {
      setError(errorMessage(err))
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout title="Choose a new password" subtitle={`For ${email}`}>
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <TextField
          label="New password"
          type="password"
          hint="8-72 characters"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          minLength={8}
          maxLength={72}
          required
        />
        <TextField
          label="Confirm new password"
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
          required
        />

        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {error}
          </p>
        )}

        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting && <Spinner light className="h-4 w-4" />}
          Reset password
        </Button>
      </form>
    </AuthLayout>
  )
}
