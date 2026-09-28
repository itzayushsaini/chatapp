import { useState } from 'react'

import {
  dismissPrompt,
  notificationPermission,
  promptDismissed,
  requestNotificationPermission,
} from '../../utils/notifications.js'

// A one-line offer to turn on message notifications. Shown only while the
// browser has not been asked yet ("default") - once allowed, blocked, or
// dismissed here, it never comes back. The browser's own permission popup is
// only opened from the Enable click, since browsers ignore (or quietly
// block) a permission request the user did not ask for.
export default function NotificationPrompt() {
  const [visible, setVisible] = useState(
    () => notificationPermission() === 'default' && !promptDismissed(),
  )
  if (!visible) return null

  async function enable() {
    await requestNotificationPermission()
    setVisible(false)
  }

  function dismiss() {
    dismissPrompt()
    setVisible(false)
  }

  return (
    <div className="animate-slide-down mx-3 mt-2 flex items-center gap-2 rounded-lg bg-brand-50 px-3 py-2 text-sm text-slate-700">
      <span className="min-w-0 flex-1">Get notified when a message arrives</span>
      <button
        type="button"
        onClick={enable}
        className="shrink-0 rounded-md px-2 py-1 font-medium text-brand-700 hover:bg-brand-100 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none"
      >
        Enable
      </button>
      <button
        type="button"
        onClick={dismiss}
        className="shrink-0 rounded-md px-1.5 py-0.5 text-lg leading-none text-slate-500 hover:bg-brand-100 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none"
        aria-label="Dismiss notifications offer"
      >
        ×
      </button>
    </div>
  )
}
