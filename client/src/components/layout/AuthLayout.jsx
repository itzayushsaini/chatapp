import { Link } from 'react-router'

import AnnouncementBanner from '../common/AnnouncementBanner.jsx'
import { ChatIcon, LockIcon, SparklesIcon, ZapIcon } from '../common/Icons.jsx'
import Logo from '../common/Logo.jsx'

// Shown beside the form on wide screens (from 1024px up). On a phone the
// form needs every pixel, so the panel is not there at all.
const POINTS = [
  { icon: LockIcon, title: 'Private by design', text: 'Anyone can find you, but only people you accept can message you.' },
  { icon: ZapIcon, title: 'Instant', text: 'Messages arrive the moment they are sent, with read receipts and typing.' },
  { icon: SparklesIcon, title: 'PingMe AI built in', text: 'Ask questions, share a photo or a PDF - right inside the app.' },
]

// The page shared by login, register, forgot- and reset-password: the form
// card on the right, and - on a wide screen - a green brand panel on the left.
export default function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <main className="auth-background flex min-h-dvh flex-col bg-slate-50">
      <AnnouncementBanner />
      <div className="flex flex-1">
        <div className="flex flex-1 items-center justify-center px-4 py-10">
          <div className="w-full max-w-sm">
            <div className="mb-6 flex justify-center">
              {/* Back to the public home page. */}
              <Link
                to="/"
                className="rounded-xl focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none"
                aria-label="PingMe home"
              >
                <Logo />
              </Link>
            </div>
            <div className="animate-scale-in rounded-2xl border border-slate-200 bg-surface p-6 shadow-md shadow-slate-900/5 sm:p-8">
              <h1 className="text-center text-xl font-semibold text-slate-900">{title}</h1>
              <p className="mt-1 text-center text-sm text-slate-500">{subtitle}</p>
              <div className="mt-6">{children}</div>
            </div>
            <p className="mt-6 text-center text-sm text-slate-600">{footer}</p>
          </div>
        </div>

        {/* After the form in the page, so a screen reader reads the form
            first; lg:order-first puts it on the left for everyone else.
            Fixed hex colours on purpose: a green panel with white text must
            look the same in light and dark mode (the theme's brand-700 turns
            light teal in dark mode). */}
        <aside className="relative hidden w-[44%] max-w-xl shrink-0 overflow-hidden bg-gradient-to-br from-[#00a884] to-[#014d41] p-12 text-white lg:order-first lg:flex lg:flex-col lg:justify-between">
          <span className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-white/10" aria-hidden="true" />
          <span className="pointer-events-none absolute -bottom-32 -left-20 h-96 w-96 rounded-full bg-white/5" aria-hidden="true" />

          <p className="relative flex items-center gap-2 text-2xl font-bold">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/25">
              <ChatIcon className="h-5 w-5" />
            </span>
            PingMe
          </p>

          <div className="relative">
            <p className="text-3xl leading-tight font-semibold tracking-tight">
              Chat with the people
              <br />
              you actually know.
            </p>
            <ul className="mt-8 space-y-5">
              {POINTS.map((p) => (
                <li key={p.title} className="flex gap-3">
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/15">
                    <p.icon className="h-5 w-5" />
                  </span>
                  <span>
                    <span className="block font-medium">{p.title}</span>
                    <span className="block text-sm text-white/75">{p.text}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <p className="relative text-xs text-white/60">B.Tech CSE project · COER University, Roorkee</p>
        </aside>
      </div>
    </main>
  )
}
