import AnnouncementBanner from '../common/AnnouncementBanner.jsx'
import Logo from '../common/Logo.jsx'

// The centred card shared by the login and register pages.
export default function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <main className="auth-background flex min-h-dvh flex-col bg-slate-50">
      <AnnouncementBanner />
      <div className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-6 flex justify-center">
            <Logo />
          </div>
          <div className="animate-scale-in rounded-2xl border border-slate-200 bg-surface p-6 shadow-sm sm:p-8">
            <h1 className="text-center text-xl font-semibold text-slate-900">{title}</h1>
            <p className="mt-1 text-center text-sm text-slate-500">{subtitle}</p>
            <div className="mt-6">{children}</div>
          </div>
          <p className="mt-6 text-center text-sm text-slate-600">{footer}</p>
        </div>
      </div>
    </main>
  )
}
