import { useEffect, useState } from 'react'

import { getPublicSettings } from '../../api/settings.js'

// "Continue with Google", on both the login and the register page - with
// Google there is no difference: a new person gets an account, a returning
// one is logged in.
//
// It is a plain link, not a fetch: signing in with Google means leaving
// PingMe for Google's own page, and the server's /api/auth/google starts
// that redirect (see googleAuthService.js). Only shown when the server says
// Google sign-in is set up.
export default function GoogleButton() {
  const [enabled, setEnabled] = useState(false)

  useEffect(() => {
    getPublicSettings()
      .then((s) => setEnabled(Boolean(s.googleSignIn)))
      .catch(() => {})
  }, [])

  if (!enabled) return null

  return (
    <div className="mt-5">
      <div className="flex items-center gap-3 text-xs text-slate-400" aria-hidden="true">
        <span className="h-px flex-1 bg-slate-200" />
        or
        <span className="h-px flex-1 bg-slate-200" />
      </div>
      <a
        href="/api/auth/google"
        className="mt-5 flex w-full items-center justify-center gap-2.5 rounded-lg border border-slate-300 bg-surface px-4 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none"
      >
        <GoogleLogo />
        Continue with Google
      </a>
    </div>
  )
}

// Google's "G" in its four brand colours, as their sign-in guidelines ask.
function GoogleLogo() {
  return (
    <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.8c4.3-4 6.9-9.9 6.9-17.2z" />
      <path fill="#FBBC05" d="M10.6 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.9-6.1z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.8c-2.1 1.4-4.8 2.3-8.5 2.3-6.2 0-11.5-4.1-13.4-9.8l-7.9 6.1C6.6 42.6 14.6 48 24 48z" />
    </svg>
  )
}
