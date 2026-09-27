import { useEffect, useState } from 'react'
import { Link } from 'react-router'

import { errorMessage } from '../api/http.js'
import { getPublicSettings } from '../api/settings.js'
import Button from '../components/common/Button.jsx'
import Spinner from '../components/common/Spinner.jsx'
import TextField from '../components/common/TextField.jsx'
import AuthLayout from '../components/layout/AuthLayout.jsx'
import { useAuth } from '../context/AuthContext.jsx'

const EMPTY = { username: '', displayName: '', email: '', password: '' }

export default function RegisterPage() {
  const { register } = useAuth()
  const [fields, setFields] = useState(EMPTY)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  // Just a quick hint and an early "closed" message - the server enforces
  // both regardless, so a stale or failed fetch here can never let through
  // something the server would otherwise refuse.
  const [publicSettings, setPublicSettings] = useState(null)

  useEffect(() => {
    getPublicSettings()
      .then(setPublicSettings)
      .catch(() => {})
  }, [])

  const update = (name) => (e) => setFields((f) => ({ ...f, [name]: e.target.value }))

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      // The server validates everything again - the browser's checks are
      // only there to give quicker feedback.
      await register(fields)
    } catch (err) {
      setError(errorMessage(err))
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Join now and start chatting"
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-brand-600 hover:underline">
            Log in
          </Link>
        </>
      }
    >
      {publicSettings && !publicSettings.registrationOpen ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800" role="status">
          Registration is currently closed. Please check back later.
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <TextField
            label="Username"
            hint="3-20 characters: lowercase letters, numbers, _ or . - this is how friends find you, and it can't be changed."
            value={fields.username}
            onChange={(e) => setFields((f) => ({ ...f, username: e.target.value.toLowerCase() }))}
            autoComplete="username"
            autoCapitalize="none"
            pattern="[a-z0-9_.]{3,20}"
            minLength={3}
            maxLength={20}
            required
          />
          <TextField
            label="Display name"
            value={fields.displayName}
            onChange={update('displayName')}
            autoComplete="name"
            maxLength={40}
            required
          />
          <TextField
            label="Email"
            type="email"
            hint={
              publicSettings?.allowedEmailDomains?.length
                ? `Must end in: ${publicSettings.allowedEmailDomains.join(', ')}`
                : undefined
            }
            value={fields.email}
            onChange={update('email')}
            autoComplete="email"
            required
          />
          <TextField
            label="Password"
            type="password"
            hint="8-72 characters"
            value={fields.password}
            onChange={update('password')}
            autoComplete="new-password"
            minLength={8}
            maxLength={72}
            required
          />

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
              {error}
            </p>
          )}

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting && <Spinner light className="h-4 w-4" />}
            Sign up
          </Button>
        </form>
      )}
    </AuthLayout>
  )
}
