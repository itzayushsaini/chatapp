import { useState } from 'react'
import { Link } from 'react-router'

import OverviewTab from '../components/admin/OverviewTab.jsx'
import SettingsTab from '../components/admin/SettingsTab.jsx'
import UpdatesTab from '../components/admin/UpdatesTab.jsx'
import UsersTab from '../components/admin/UsersTab.jsx'
import { BackIcon, BarChartIcon, MegaphoneIcon, SettingsIcon, ShieldIcon, UsersIcon } from '../components/common/Icons.jsx'
import { useAuth } from '../context/AuthContext.jsx'

const TABS = [
  { id: 'overview', label: 'Overview', icon: BarChartIcon },
  { id: 'users', label: 'Users', icon: UsersIcon },
  { id: 'updates', label: 'Updates', icon: MegaphoneIcon },
  { id: 'settings', label: 'Settings', icon: SettingsIcon },
]

// A standalone page, not part of the chat layout - reachable only via the
// "Admin" link in the sidebar, itself only shown when user.isAdmin. The
// route in App.jsx redirects anyone else straight back to "/".
export default function AdminPage() {
  const { user } = useAuth()
  const [tab, setTab] = useState('overview')

  return (
    // h-dvh + flex-col, with the scrolling confined to <main> below (same
    // pattern SettingsPage.jsx uses) - so the header and tabs stay in view
    // while the (potentially long) settings content scrolls underneath
    // them, instead of scrolling away with everything else.
    <div className="flex h-dvh flex-col bg-slate-50">
      <header className="flex shrink-0 items-center gap-3 border-b border-slate-200 bg-surface px-4 py-3 sm:px-6">
        <Link
          to="/"
          className="inline-flex items-center gap-1 rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none"
          aria-label="Back to chats"
        >
          <BackIcon className="h-5 w-5" />
        </Link>
        <h1 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
            <ShieldIcon className="h-5 w-5" />
          </span>
          Admin panel
        </h1>
        <p className="ml-auto hidden truncate text-sm text-slate-500 sm:block">
          Signed in as <span className="font-medium text-slate-700">{user.displayName}</span>
        </p>
      </header>

      <div
        role="tablist"
        aria-label="Admin sections"
        className="flex shrink-0 gap-1 overflow-x-auto border-b border-slate-200 bg-surface px-4 sm:px-6"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={t.id === tab}
            onClick={() => setTab(t.id)}
            className={`inline-flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none ${
              t.id === tab
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <t.icon className="hidden h-4 w-4 sm:block" />
            {t.label}
          </button>
        ))}
      </div>

      <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div key={tab} className="animate-fade-in mx-auto max-w-4xl px-4 py-6 sm:px-6">
          {tab === 'overview' && <OverviewTab />}
          {tab === 'users' && <UsersTab />}
          {tab === 'updates' && <UpdatesTab />}
          {tab === 'settings' && <SettingsTab />}
        </div>
      </main>
    </div>
  )
}
