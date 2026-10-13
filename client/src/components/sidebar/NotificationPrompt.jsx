import { useState } from 'react'

import {
  dismissPrompt,
  notificationPermission,
  promptDismissed,
  requestNotificationPermission,
} from '../../utils/notifications.js'
import { ensurePushSubscription } from '../../utils/push.js'

// Permission is only requested from the Enable click; browsers block requests the user didn't ask for.
export default function NotificationPrompt() {
  const [visible, setVisible] = useState(
    () => notificationPermission() === 'default' && !promptDismissed(),
  )
  if (!visible) return null

  async function enable() {
    const result = await requestNotificationPermission()
    setVisible(false)
    if (result === 'granted') ensurePushSubscription().catch(() => {})
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
