import { useState } from 'react'
import { Link } from 'react-router'

import * as authApi from '../api/auth.js'
import { errorMessage } from '../api/http.js'
import Button from '../components/common/Button.jsx'
import Spinner from '../components/common/Spinner.jsx'
import TextField from '../components/common/TextField.jsx'
import AuthLayout from '../components/layout/AuthLayout.jsx'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  // The server always answers the same way, whether or not the email is
  // registered - so the message shown here can never be used to check who
  // has an account.
  const [sent, setSent] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await authApi.forgotPassword(email)
      setSent(true)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  if (sent) {
    return (
      <AuthLayout
        title="Check your email"
        subtitle={`If an account exists for ${email}, we've sent a link to reset your password. It expires in 1 hour.`}
        footer={
          <Link to="/login" className="font-medium text-brand-600 hover:underline">
            Back to log in
          </Link>
        }
      >
        <p className="text-center text-sm text-slate-500">
          Didn&apos;t get it? Check your spam folder, or{' '}
          <button
            type="button"
            onClick={() => setSent(false)}
            className="rounded font-medium text-brand-600 hover:underline focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none"
          >
            try again
          </button>
          .
        </p>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title="Forgot your password?"
      subtitle="Enter your email and we'll send you a reset link"
      footer={
        <Link to="/login" className="font-medium text-brand-600 hover:underline">
          Back to log in
        </Link>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <TextField
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
        />

        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {error}
          </p>
        )}

        <Button type="submit" className="w-full" disabled={submitting || !email.trim()}>
          {submitting && <Spinner light className="h-4 w-4" />}
          Send reset link
        </Button>
      </form>
    </AuthLayout>
  )
}
