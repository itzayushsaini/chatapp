import { Link } from 'react-router'

import { buttonClass } from '../components/common/buttonClass.js'
import Logo from '../components/common/Logo.jsx'

// Shown for any address PingMe does not have (App.jsx's catch-all route).
// Works the same logged in or out: "Go to PingMe" lands on the chat or on
// the home page, whichever applies.
export default function NotFoundPage() {
  return (
    <main className="auth-background flex min-h-dvh flex-col items-center justify-center gap-6 bg-slate-50 px-6 text-center">
      <Link
        to="/"
        className="rounded-xl focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none"
        aria-label="PingMe home"
      >
        <Logo />
      </Link>
      <div className="animate-scale-in">
        <p className="bg-linear-to-r from-brand-600 to-brand-400 bg-clip-text text-7xl font-extrabold tracking-tight text-transparent sm:text-8xl">
          404
        </p>
        <h1 className="mt-2 text-xl font-semibold text-slate-900">This page doesn’t exist</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm text-slate-600">
          The link may be old or mistyped. Nothing is wrong with your account or your chats.
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        <Link to="/" className={buttonClass({ size: 'lg' })}>
          Go to PingMe
        </Link>
        <button type="button" onClick={() => window.history.back()} className={buttonClass({ variant: 'secondary', size: 'lg' })}>
          Go back
        </button>
      </div>
    </main>
  )
}
