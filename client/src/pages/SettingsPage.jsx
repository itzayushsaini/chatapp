import { useEffect, useState } from 'react'
import { Link } from 'react-router'

import { errorMessage } from '../api/http.js'
import { getBlocked, unblockUser, updateProfile } from '../api/profile.js'
import Avatar from '../components/common/Avatar.jsx'
import Button from '../components/common/Button.jsx'
import {
  BackIcon,
  BanIcon,
  BellIcon,
  ChatIcon,
  HelpIcon,
  KeyIcon,
  LogoutIcon,
  MonitorIcon,
  MoonIcon,
  SunIcon,
} from '../components/common/Icons.jsx'
import LogoutDialog from '../components/common/LogoutDialog.jsx'
import Spinner from '../components/common/Spinner.jsx'
import Switch from '../components/common/Switch.jsx'
import ProfileDialog from '../components/profile/ProfileDialog.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { useChatStore } from '../store/useChatStore.js'
import {
  notificationPermission,
  notificationsEnabled,
  requestNotificationPermission,
  setNotificationsEnabled,
} from '../utils/notifications.js'
import { enterToSend, setEnterToSend } from '../utils/preferences.js'
import { applyTheme } from '../utils/theme.js'

const ISSUES_URL = 'https://github.com/itzayushsaini/chatapp/issues'

// Everything about MY account and this device, in one place. It lives under
// LoggedInLayout, so the socket stays connected while it is open - new
// messages still arrive, badge the tab title and notify.
export default function SettingsPage() {
  const { user } = useAuth()
  const [profileOpen, setProfileOpen] = useState(false)
  const [confirmLogout, setConfirmLogout] = useState(false)

  return (
    <main className="flex min-h-0 flex-1 flex-col bg-slate-50">
      <header className="flex items-center gap-3 bg-surface px-3 py-3 shadow-sm sm:px-4">
        <Link
          to="/"
          className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none"
          aria-label="Back to chats"
        >
          <BackIcon />
        </Link>
        <h1 className="text-lg font-semibold text-slate-900">Settings</h1>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto w-full max-w-2xl space-y-4 px-3 py-4 sm:px-4 sm:py-6">
          {/* Me - the same profile editor the sidebar opens. */}
          <section className="flex items-center gap-4 rounded-2xl bg-surface p-4 shadow-sm">
            <Avatar user={user} size="lg" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-slate-900">{user.displayName}</p>
              <p className="truncate text-sm text-slate-500">@{user.username}</p>
              {user.bio && <p className="mt-0.5 truncate text-sm text-slate-600">{user.bio}</p>}
            </div>
            <Button variant="secondary" size="sm" onClick={() => setProfileOpen(true)}>
              Edit profile
            </Button>
          </section>

          <AccountSection onChangePassword={() => setProfileOpen(true)} />
          <PrivacySection />
          <NotificationsSection />
          <ChatsSection />
          <ThemeSection />

          <Card icon={<HelpIcon className="h-5 w-5" />} title="Help & support">
            <p className="text-sm text-slate-600">
              Found a bug, or have an idea? Tell us on GitHub - every report is read by the team.
            </p>
            <a
              href={ISSUES_URL}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-block rounded text-sm font-medium text-brand-700 hover:underline focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none"
            >
              Report a problem or suggest a feature ↗
            </a>
            <p className="mt-3 text-xs text-slate-500">
              PingMe - a B.Tech CSE 2nd year project, COER University.
            </p>
          </Card>

          <button
            type="button"
            onClick={() => setConfirmLogout(true)}
            className="flex w-full items-center gap-3 rounded-2xl bg-surface px-4 py-3.5 text-left text-sm font-medium text-red-600 shadow-sm hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none"
          >
            <LogoutIcon className="h-5 w-5" />
            Log out
          </button>
        </div>
      </div>

      <ProfileDialog open={profileOpen} onClose={() => setProfileOpen(false)} />
      <LogoutDialog open={confirmLogout} onClose={() => setConfirmLogout(false)} />
    </main>
  )
}

function Card({ icon, title, children }) {
  return (
    <section
      className="rounded-2xl bg-surface p-4 shadow-sm transition-shadow duration-200 hover:shadow-md"
      aria-label={title}
    >
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
        <span className="text-brand-700">{icon}</span>
        {title}
      </h2>
      {children}
    </section>
  )
}

function AccountSection({ onChangePassword }) {
  const { user } = useAuth()
  // How this account can sign in. A password account that has also used
  // "Continue with Google" (same email) can do both.
  const method =
    user.authProvider === 'google'
      ? 'Google'
      : user.googleLinked
        ? 'Password or Google'
        : 'Password'

  return (
    <Card icon={<KeyIcon className="h-5 w-5" />} title="Account">
      <dl className="space-y-3 text-sm">
        <div>
          <dt className="text-slate-500">Email</dt>
          <dd className="text-slate-900">{user.email}</dd>
          <dd className="text-xs text-slate-500">Only you can see this.</dd>
        </div>
        <div>
          <dt className="text-slate-500">Sign-in method</dt>
          <dd className="text-slate-900">{method}</dd>
        </div>
      </dl>
      <Button variant="secondary" size="sm" className="mt-3" onClick={onChangePassword}>
        Change password
      </Button>
    </Card>
  )
}

// People I have blocked, with Unblock. Blocking itself is done from a chat's
// Contact info panel.
function PrivacySection() {
  const addToast = useChatStore((s) => s.addToast)
  const [blocked, setBlocked] = useState(null) // null while loading
  const [busyId, setBusyId] = useState(null)

  useEffect(() => {
    getBlocked()
      .then(setBlocked)
      .catch((err) => {
        setBlocked([])
        addToast(errorMessage(err), 'error')
      })
  }, [addToast])

  async function unblock(person) {
    setBusyId(person.id)
    try {
      await unblockUser(person.id)
      setBlocked((list) => list.filter((p) => p.id !== person.id))
      addToast(`${person.displayName} is unblocked`)
    } catch (err) {
      addToast(errorMessage(err), 'error')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <Card icon={<BanIcon className="h-5 w-5" />} title="Privacy">
      <h3 className="text-sm font-medium text-slate-700">Blocked contacts</h3>
      <p className="mt-0.5 text-xs text-slate-500">
        Blocked people can&apos;t find you by username or send you a friend request - and you can&apos;t
        find them. They are not told.
      </p>
      {blocked === null ? (
        <div className="flex justify-center py-3">
          <Spinner />
        </div>
      ) : blocked.length === 0 ? (
        <p className="mt-3 text-sm text-slate-400">You haven&apos;t blocked anyone.</p>
      ) : (
        <ul className="mt-2 divide-y divide-slate-100">
          {blocked.map((person) => (
            <li key={person.id} className="flex items-center gap-3 py-2">
              <Avatar user={person} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-slate-900">{person.displayName}</span>
                <span className="block truncate text-xs text-slate-500">@{person.username}</span>
              </span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => unblock(person)}
                disabled={busyId === person.id}
                aria-label={`Unblock ${person.displayName}`}
              >
                Unblock
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function NotificationsSection() {
  const [permission, setPermission] = useState(notificationPermission)
  const [enabled, setEnabled] = useState(notificationsEnabled)

  // On only if the browser allows it AND the app switch is on.
  const on = permission === 'granted' && enabled

  async function toggle(next) {
    if (!next) {
      setNotificationsEnabled(false)
      setEnabled(false)
      return
    }
    // The browser only asks once; after that it must be changed in the
    // browser's own site settings.
    const result = permission === 'granted' ? 'granted' : await requestNotificationPermission()
    setPermission(result)
    if (result === 'granted') {
      setNotificationsEnabled(true)
      setEnabled(true)
    }
  }

  const note =
    permission === 'unsupported'
      ? "This browser doesn't support notifications."
      : permission === 'denied'
        ? 'Notifications are blocked for this site. Allow them in your browser’s site settings, then come back.'
        : 'A pop-up for each new message while PingMe is open in any tab - even minimised. Muted chats never pop up.'

  return (
    <Card icon={<BellIcon className="h-5 w-5" />} title="Notifications">
      <Switch
        checked={on}
        onChange={toggle}
        disabled={permission === 'unsupported' || permission === 'denied'}
        label="Message notifications"
        description={note}
      />
      <p className="mt-1 px-1 text-xs text-slate-500">This setting is for this browser only.</p>
    </Card>
  )
}

function ChatsSection() {
  const [sendOnEnter, setSendOnEnter] = useState(enterToSend)

  return (
    <Card icon={<ChatIcon className="h-5 w-5" />} title="Chats">
      <Switch
        checked={sendOnEnter}
        onChange={(next) => {
          setEnterToSend(next)
          setSendOnEnter(next)
        }}
        label="Enter to send"
        description={
          sendOnEnter
            ? 'Enter sends the message; Shift+Enter starts a new line.'
            : 'Enter starts a new line; use the Send button to send.'
        }
      />
      <p className="mt-1 px-1 text-xs text-slate-500">This setting is for this browser only.</p>
    </Card>
  )
}

const THEMES = [
  { id: 'light', label: 'Light', icon: <SunIcon className="h-5 w-5" /> },
  { id: 'dark', label: 'Dark', icon: <MoonIcon className="h-5 w-5" /> },
  { id: 'system', label: 'Same as device', icon: <MonitorIcon className="h-5 w-5" /> },
]

// Saved on the account, so it follows me to every device. Applied at once
// (before the server answers) and put back if saving fails.
function ThemeSection() {
  const { user, updateUser } = useAuth()
  const addToast = useChatStore((s) => s.addToast)
  const current = user.theme ?? 'light'

  async function choose(theme) {
    if (theme === current) return
    applyTheme(theme)
    updateUser({ theme })
    try {
      updateUser(await updateProfile({ theme }))
    } catch (err) {
      applyTheme(current)
      updateUser({ theme: current })
      addToast(errorMessage(err), 'error')
    }
  }

  return (
    <Card icon={<SunIcon className="h-5 w-5" />} title="Theme">
      <div role="radiogroup" aria-label="Theme" className="grid grid-cols-3 gap-2">
        {THEMES.map(({ id, label, icon }) => {
          const selected = id === current
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => choose(id)}
              className={`flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-sm font-medium focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none ${
                selected
                  ? 'border-brand-600 bg-brand-50 text-brand-700'
                  : 'border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {icon}
              {label}
            </button>
          )
        })}
      </div>
    </Card>
  )
}
