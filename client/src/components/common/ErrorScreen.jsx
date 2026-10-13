import { Component } from 'react'

import Button from './Button.jsx'
import { AlertIcon } from './Icons.jsx'
import Logo from './Logo.jsx'

export function ErrorScreen({ message, onRetry }) {
  return (
    <main className="auth-background flex min-h-dvh flex-col items-center justify-center gap-6 bg-slate-50 px-6 text-center">
      <Logo />
      <div className="animate-scale-in w-full max-w-sm rounded-2xl border border-slate-200 bg-surface p-8 shadow-md shadow-slate-900/5">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-100 text-red-600">
          <AlertIcon className="h-7 w-7" />
        </span>
        <h1 className="mt-4 text-lg font-semibold text-slate-900">Something went wrong</h1>
        <p className="mt-1 text-sm text-slate-600">{message}</p>
        <Button onClick={onRetry} className="mt-6 w-full">
          Try again
        </Button>
      </div>
    </main>
  )
}

// Only a class component can catch errors thrown while rendering; there is no hook for it.
export class ErrorBoundary extends Component {
  state = { crashed: false }

  static getDerivedStateFromError() {
    return { crashed: true }
  }

  componentDidCatch(error, info) {
    console.error('Unexpected error while rendering:', error, info.componentStack)
  }

  render() {
    if (this.state.crashed) {
      return (
        <ErrorScreen
          message="The page ran into a problem it could not recover from. Reloading usually fixes it."
          // A full reload: just re-rendering would most likely crash again.
          onRetry={() => window.location.reload()}
        />
      )
    }
    return this.props.children
  }
}
