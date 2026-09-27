import { Component } from 'react'

import Button from './Button.jsx'
import { AlertIcon } from './Icons.jsx'

// The full-screen "Something went wrong" page. Used for two different
// failures: the app crashing while drawing the screen (ErrorBoundary below),
// and the very first "am I logged in?" check not reaching the server at all
// (see AuthContext's bootError).
export function ErrorScreen({ message, onRetry }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-slate-50 px-6 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-red-100 text-red-600">
        <AlertIcon className="h-7 w-7" />
      </span>
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Something went wrong</h1>
        <p className="mt-1 max-w-sm text-sm text-slate-600">{message}</p>
      </div>
      <Button onClick={onRetry}>Try again</Button>
    </main>
  )
}

// React only lets a CLASS component catch an error thrown while rendering
// its children - there is no hook for this. Without it, one bug in one
// component would leave the whole page blank white.
export class ErrorBoundary extends Component {
  state = { crashed: false }

  static getDerivedStateFromError() {
    return { crashed: true }
  }

  componentDidCatch(error, info) {
    // The detail stays in the browser console for developers; the user only
    // sees the friendly screen.
    console.error('Unexpected error while rendering:', error, info.componentStack)
  }

  render() {
    if (this.state.crashed) {
      return (
        <ErrorScreen
          message="The page ran into a problem it could not recover from. Reloading usually fixes it."
          // A full reload, not just re-rendering: whatever state caused the
          // crash would most likely cause it again straight away.
          onRetry={() => window.location.reload()}
        />
      )
    }
    return this.props.children
  }
}
