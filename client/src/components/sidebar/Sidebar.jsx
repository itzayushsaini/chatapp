import { useState } from 'react'

import { useAuth } from '../../context/AuthContext.jsx'
import { useChatStore } from '../../store/useChatStore.js'
import Avatar from '../common/Avatar.jsx'
import { LogoutIcon } from '../common/Icons.jsx'
import ProfileDialog from '../profile/ProfileDialog.jsx'
import AddFriendTab from './AddFriendTab.jsx'
import ChatsTab from './ChatsTab.jsx'
import RequestsTab from './RequestsTab.jsx'

const TABS = [
  { id: 'chats', label: 'Chats' },
  { id: 'requests', label: 'Requests' },
  { id: 'add', label: 'Add Friend' },
]

export default function Sidebar({ className = '' }) {
  const { user, logout } = useAuth()
  const tab = useChatStore((s) => s.sidebarTab)
  const setTab = useChatStore((s) => s.setSidebarTab)
  const incomingCount = useChatStore((s) => s.requests.incoming.length)
  const [profileOpen, setProfileOpen] = useState(false)

  // Arrow keys move between tabs - the standard keyboard pattern for tabs.
  function handleTabKey(event) {
    const index = TABS.findIndex((t) => t.id === tab)
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
    if (!step) return
    const next = TABS[(index + step + TABS.length) % TABS.length]
    setTab(next.id)
    document.getElementById(`tab-${next.id}`)?.focus()
  }

  return (
    <aside className={`flex-col border-r border-slate-200 bg-white ${className}`}>
      {/* My avatar (opens my profile) on the left, log out on the right -
          the same top-bar layout WhatsApp uses, instead of a footer. */}
      <div className="flex items-center justify-between bg-slate-100 px-3 py-2.5">
        <button
          type="button"
          onClick={() => setProfileOpen(true)}
          className="flex min-w-0 items-center gap-2.5 rounded-lg py-1 pr-2 pl-1 text-left hover:bg-black/5 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none"
          aria-label="Edit your profile"
          title="Edit your profile"
        >
          <Avatar user={user} size="sm" />
          <span className="min-w-0">
            <span className="block max-w-40 truncate text-sm font-medium text-slate-900">
              {user.displayName}
            </span>
            <span className="block truncate text-xs text-slate-500">@{user.username}</span>
          </span>
        </button>
        <button
          type="button"
          onClick={logout}
          className="rounded-full p-2 text-slate-600 hover:bg-black/5 hover:text-red-600 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none"
          aria-label="Log out"
          title="Log out"
        >
          <LogoutIcon className="h-5 w-5" />
        </button>
      </div>

      <div role="tablist" aria-label="Sidebar" className="flex gap-1 px-3 pt-2 pb-1.5" onKeyDown={handleTabKey}>
        {TABS.map((t) => {
          const selected = t.id === tab
          return (
            <button
              key={t.id}
              id={`tab-${t.id}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`panel-${t.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setTab(t.id)}
              className={`relative flex flex-1 items-center justify-center gap-1.5 rounded-full px-2 py-1.5 text-sm font-medium focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none ${
                selected ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {t.label}
              {t.id === 'requests' && incomingCount > 0 && (
                <span
                  className={`min-w-5 rounded-full px-1.5 text-xs leading-5 font-semibold ${
                    selected ? 'bg-white/25 text-white' : 'bg-brand-600 text-white'
                  }`}
                  aria-label={`${incomingCount} incoming`}
                >
                  {incomingCount}
                </span>
              )}
            </button>
          )
        })}
      </div>

      <div
        id={`panel-${tab}`}
        role="tabpanel"
        aria-labelledby={`tab-${tab}`}
        className="min-h-0 flex-1 overflow-y-auto"
      >
        {tab === 'chats' && <ChatsTab />}
        {tab === 'requests' && <RequestsTab />}
        {tab === 'add' && <AddFriendTab />}
      </div>

      <ProfileDialog open={profileOpen} onClose={() => setProfileOpen(false)} />
    </aside>
  )
}
