import Logo from './Logo.jsx'

export default function Spinner({ className = 'h-6 w-6', light = false }) {
  return (
    <span
      className={`${className} inline-block animate-spin rounded-full border-2 border-t-transparent ${
        light ? 'border-white' : 'border-brand-600'
      }`}
      role="status"
      aria-label="Loading"
    />
  )
}

export function FullScreenLoader() {
  return (
    <div className="auth-background flex min-h-dvh flex-col items-center justify-center gap-6 bg-slate-50">
      <Logo />
      <Spinner className="h-8 w-8" />
    </div>
  )
}
