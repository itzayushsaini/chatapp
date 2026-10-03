import { useEffect } from 'react'
import { Outlet, useSearchParams } from 'react-router'

import { SocketProvider } from '../../context/SocketContext.jsx'
import { useSocketEvents } from '../../hooks/useSocketEvents.js'
import { useChatStore } from '../../store/useChatStore.js'
import { ensurePushSubscription } from '../../utils/push.js'
import AnnouncementBanner from '../common/AnnouncementBanner.jsx'
import Toasts from '../common/Toasts.jsx'

// Everything the logged-in pages (the chat at "/" and Settings at
// "/settings") share: ONE socket, all its listeners, the initial data, the
// banners and the toasts. Because it sits above both routes, moving between
// them keeps the connection open - messages, notifications and "typing..."
// keep arriving while Settings is open.
export default function LoggedInLayout() {
  return (
    <SocketProvider>
      <LiveShell />
    </SocketProvider>
  )
}

// A separate component because useSocketEvents needs the socket, which only
// exists inside SocketProvider.
function LiveShell() {
  const connection = useChatStore((s) => s.connection)
  const totalUnread = useChatStore(
    (s) => Object.values(s.unreadCounts).reduce((sum, count) => sum + count, 0) + s.updates.unreadCount,
  )

  // All real-time listeners, registered once for the whole logged-in app.
  useSocketEvents()

  // Initial data comes over REST; sockets then keep it up to date.
  useEffect(() => {
    const { fetchFriends, fetchRequests, fetchUpdatesSummary, fetchAiSummary } = useChatStore.getState()
    fetchFriends()
    fetchRequests()
    fetchUpdatesSummary() // the pinned "PingMe" row's preview and badge
    fetchAiSummary() // whether to show the pinned PingMe AI row
    // If notifications are allowed here, make sure this device also gets
    // them while PingMe is closed (Web Push) - quietly; it only adds to the
    // notifications the open app already shows.
    ensurePushSubscription().catch(() => {})
  }, [])

  // PingMe was CLOSED and a push notification was tapped: the service
  // worker opened /?open=<what to show>. Show it, then tidy the address.
  const [searchParams, setSearchParams] = useSearchParams()
  const openParam = searchParams.get('open')
  useEffect(() => {
    if (!openParam) return
    useChatStore.getState().openTarget(openParam)
    setSearchParams({}, { replace: true })
  }, [openParam, setSearchParams])

  // "(3) PingMe" in the browser tab, so unread messages are visible even
  // while looking at another tab.
  useEffect(() => {
    document.title = totalUnread > 0 ? `(${totalUnread}) PingMe` : 'PingMe'
    return () => {
      document.title = 'PingMe'
    }
  }, [totalUnread])

  return (
    // overflow-hidden + overscroll-none here (not on html/body - see
    // index.css) is what stops a message list, once scrolled to its own
    // end, from "scroll chaining" any further wheel input to the page
    // itself. Scoped to just this logged-in chat shell, so every OTHER
    // page (Admin panel, Login/Register) keeps ordinary page scrolling for
    // whatever does not fit the viewport.
    // The height is one screen (100dvh) - or, while a phone keyboard is
    // open on an iPhone, just the part above it (--app-height, set by
    // utils/viewport.js), so the chat header never slides off the top.
    <div className="flex h-[var(--app-height,100dvh)] flex-col overflow-hidden overscroll-none">
      <AnnouncementBanner />
      {connection === 'reconnecting' && (
        <div className="animate-slide-down bg-amber-100 px-4 py-1.5 text-center text-sm text-amber-900" role="status">
          Reconnecting…
        </div>
      )}
      <div className="flex min-h-0 flex-1">
        <Outlet />
      </div>
      <Toasts />
    </div>
  )
}
