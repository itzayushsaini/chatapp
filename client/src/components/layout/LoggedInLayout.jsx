import { useEffect } from 'react'
import { Outlet } from 'react-router'

import { SocketProvider } from '../../context/SocketContext.jsx'
import { useSocketEvents } from '../../hooks/useSocketEvents.js'
import { useChatStore } from '../../store/useChatStore.js'
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
  const totalUnread = useChatStore((s) =>
    Object.values(s.unreadCounts).reduce((sum, count) => sum + count, 0),
  )

  // All real-time listeners, registered once for the whole logged-in app.
  useSocketEvents()

  // Initial data comes over REST; sockets then keep it up to date.
  useEffect(() => {
    const { fetchFriends, fetchRequests } = useChatStore.getState()
    fetchFriends()
    fetchRequests()
  }, [])

  // "(3) PingMe" in the browser tab, so unread messages are visible even
  // while looking at another tab.
  useEffect(() => {
    document.title = totalUnread > 0 ? `(${totalUnread}) PingMe` : 'PingMe'
    return () => {
      document.title = 'PingMe'
    }
  }, [totalUnread])

  return (
    <div className="flex h-dvh flex-col">
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
