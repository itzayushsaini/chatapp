import Logo from './Logo.jsx'

// `light` is for use on a blue button, where a blue spinner would vanish.
export default function Spinner({ className = 'h-6 w-6', light = false }) {
  return (
    <span
      className={`${className} inline-block animate-spin rounded-full border-2 border-t-transparent ${
        light ? 'border-white' : 'border-blue-600'
      }`}
      role="status"
      aria-label="Loading"
    />
  )
}

// Shown while AuthContext asks the server whether we are logged in.
export function FullScreenLoader() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-slate-50">
      <Logo />
      <Spinner className="h-8 w-8" />
    </div>
  )
}
