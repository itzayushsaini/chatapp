import { useEffect } from 'react'
import { Outlet, useSearchParams } from 'react-router'

import { useAuth } from '../../context/AuthContext.jsx'
import { SocketProvider } from '../../context/SocketContext.jsx'
import { useSocketEvents } from '../../hooks/useSocketEvents.js'
import { useChatStore } from '../../store/useChatStore.js'
import { ensurePushSubscription } from '../../utils/push.js'
import AnnouncementBanner from '../common/AnnouncementBanner.jsx'
import Toasts from '../common/Toasts.jsx'
import PhotoRequiredScreen from '../profile/PhotoRequiredScreen.jsx'
import PhotoReminder from '../profile/PhotoReminder.jsx'

// Parent of both "/" and "/settings", so opening Settings keeps the socket open.
export default function LoggedInLayout() {
  return (
    <SocketProvider>
      <LiveShell />
    </SocketProvider>
  )
}

// Separate component because useSocketEvents needs the socket from SocketProvider.
function LiveShell() {
  const { user } = useAuth()
  const connection = useChatStore((s) => s.connection)
  const mustAddPhoto = user.photoRequired && !user.avatarUrl
  const remindPhoto = !user.photoRequired && !user.avatarUrl
  const totalUnread = useChatStore(
    (s) => Object.values(s.unreadCounts).reduce((sum, count) => sum + count, 0) + s.updates.unreadCount,
  )

  useSocketEvents()

  useEffect(() => {
    const { fetchFriends, fetchRequests, fetchUpdatesSummary, fetchAiSummary } = useChatStore.getState()
    fetchFriends()
    fetchRequests()
    fetchUpdatesSummary()
    fetchAiSummary()
    ensurePushSubscription().catch(() => {})
  }, [])

  // A tapped push notification opened /?open=<target>: show it, then tidy the address.
  const [searchParams, setSearchParams] = useSearchParams()
  const openParam = searchParams.get('open')
  useEffect(() => {
    if (!openParam) return
    useChatStore.getState().openTarget(openParam)
    setSearchParams({}, { replace: true })
  }, [openParam, setSearchParams])

  useEffect(() => {
    document.title = totalUnread > 0 ? `(${totalUnread}) PingMe` : 'PingMe'
    return () => {
      document.title = 'PingMe'
    }
  }, [totalUnread])

  return (
    // overscroll-none here, not on body, stops scroll chaining only in the chat shell.
    // --app-height (utils/viewport.js) keeps the header above an iPhone keyboard.
    <div className="flex h-[var(--app-height,100dvh)] flex-col overflow-hidden overscroll-none">
      <AnnouncementBanner />
      {connection === 'reconnecting' && (
        <div className="animate-slide-down bg-amber-100 px-4 py-1.5 text-center text-sm text-amber-900" role="status">
          Reconnecting…
        </div>
      )}
      <div className="flex min-h-0 flex-1">{mustAddPhoto ? <PhotoRequiredScreen /> : <Outlet />}</div>
      {remindPhoto && <PhotoReminder />}
      <Toasts />
    </div>
  )
}
