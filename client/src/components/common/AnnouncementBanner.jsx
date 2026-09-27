import { useEffect, useState } from 'react'

import { getPublicSettings } from '../../api/settings.js'
import { useSocket } from '../../context/SocketContext.jsx'

// Shown to EVERYONE with the app open, logged in or not - an admin sets this
// from the admin panel. Rendered in two places (AuthLayout and ChatPage): the
// initial fetch works either way, but only the logged-in copy sits inside a
// socket connection and so is the only one that updates live.
export default function AnnouncementBanner() {
  const socket = useSocket()
  const [announcement, setAnnouncement] = useState(null)

  useEffect(() => {
    getPublicSettings()
      .then((settings) => setAnnouncement(settings.announcement))
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!socket) return
    function onUpdated(settings) {
      setAnnouncement(settings.announcement)
    }
    socket.on('settings:updated', onUpdated)
    return () => socket.off('settings:updated', onUpdated)
  }, [socket])

  if (!announcement?.enabled || !announcement.text) return null

  return (
    <div className="bg-brand-600 px-4 py-1.5 text-center text-sm text-white" role="status">
      {announcement.text}
    </div>
  )
}
