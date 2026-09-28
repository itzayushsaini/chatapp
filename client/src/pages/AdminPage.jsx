import { useState } from 'react'
import { Link } from 'react-router'

import OverviewTab from '../components/admin/OverviewTab.jsx'
import SettingsTab from '../components/admin/SettingsTab.jsx'
import UsersTab from '../components/admin/UsersTab.jsx'
import { BackIcon } from '../components/common/Icons.jsx'

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'users', label: 'Users' },
  { id: 'settings', label: 'Settings' },
]

// A standalone page, not part of the chat layout - reachable only via the
// "Admin" link in the sidebar, itself only shown when user.isAdmin. The
// route in App.jsx redirects anyone else straight back to "/".
export default function AdminPage() {
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
        <h1 className="text-lg font-semibold text-slate-900">Admin panel</h1>
      </header>

      <div
        role="tablist"
        aria-label="Admin sections"
        className="flex shrink-0 gap-1 border-b border-slate-200 bg-surface px-4 sm:px-6"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={t.id === tab}
            onClick={() => setTab(t.id)}
            className={`border-b-2 px-3 py-2.5 text-sm font-medium focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none ${
              t.id === tab
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
          {tab === 'overview' && <OverviewTab />}
          {tab === 'users' && <UsersTab />}
          {tab === 'settings' && <SettingsTab />}
        </div>
      </main>
    </div>
  )
}
