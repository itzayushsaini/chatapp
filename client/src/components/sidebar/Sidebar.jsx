import { useAuth } from '../../context/AuthContext.jsx'
import { useChatStore } from '../../store/useChatStore.js'
import Avatar from '../common/Avatar.jsx'
import { LogoutIcon } from '../common/Icons.jsx'
import Logo from '../common/Logo.jsx'
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
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <Logo small />
      </div>

      <div role="tablist" aria-label="Sidebar" className="flex gap-1 px-3" onKeyDown={handleTabKey}>
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
              className={`relative flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-sm font-medium focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none ${
                selected ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {t.label}
              {t.id === 'requests' && incomingCount > 0 && (
                <span
                  className="min-w-5 rounded-full bg-blue-600 px-1.5 text-xs leading-5 font-semibold text-white"
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
        className="mt-2 min-h-0 flex-1 overflow-y-auto"
      >
        {tab === 'chats' && <ChatsTab />}
        {tab === 'requests' && <RequestsTab />}
        {tab === 'add' && <AddFriendTab />}
      </div>

      {/* Me, and logout */}
      <div className="flex items-center gap-3 border-t border-slate-200 px-4 py-3">
        <Avatar user={user} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-slate-900">{user.displayName}</p>
          <p className="truncate text-xs text-slate-500">@{user.username}</p>
        </div>
        <button
          type="button"
          onClick={logout}
          className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-red-600 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none"
          aria-label="Log out"
          title="Log out"
        >
          <LogoutIcon />
        </button>
      </div>
    </aside>
  )
}
