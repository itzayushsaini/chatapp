import { useEffect, useState } from 'react'

import { getPublicSettings } from '../../api/settings.js'
import { useSocket } from '../../context/SocketContext.jsx'
import { MegaphoneIcon } from './Icons.jsx'

// Used in AuthLayout and ChatPage; only the logged-in copy has a socket, so only it updates live.
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
    <div className="animate-slide-down hidden border-b border-brand-600/20 bg-brand-50 md:block" role="status">
      <div className="mx-auto flex max-w-5xl items-start gap-3 px-4 py-2.5 sm:items-center sm:justify-center sm:px-6">
        <span
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white shadow-sm"
          aria-hidden="true"
        >
          <MegaphoneIcon className="h-3.5 w-3.5" />
        </span>
        <p className="min-w-0 pt-1 text-sm leading-snug text-slate-800 sm:pt-0">
          <span className="sr-only">Announcement: </span>
          <span
            className="mr-2 hidden rounded-full bg-brand-600/15 px-2 py-0.5 align-[1px] text-[0.6875rem] font-semibold tracking-wide text-brand-700 uppercase sm:inline-block"
            aria-hidden="true"
          >
            Announcement
          </span>
          <span className="font-medium wrap-anywhere">{announcement.text}</span>
        </p>
      </div>
    </div>
  )
}
