import { useState } from 'react'

import { useInstallApp } from '../../hooks/useInstallApp.js'
import { dismissInstallOffer, installOfferDismissed } from '../../utils/install.js'
import { SmartphoneIcon } from '../common/Icons.jsx'
import InstallAppDialog from '../common/InstallAppDialog.jsx'

// A one-line offer to install PingMe as an app - the same idea as the
// notifications offer just above it. Shown only when installing is possible
// right now (the browser offered it, or this is an iPhone/iPad) and until it
// is installed or dismissed. Settings → App always has it too.
export default function InstallPrompt() {
  const { state, install } = useInstallApp()
  const [dismissed, setDismissed] = useState(installOfferDismissed)
  const [stepsOpen, setStepsOpen] = useState(false)

  if (dismissed || (state !== 'prompt' && state !== 'ios')) return null

  function dismiss() {
    dismissInstallOffer()
    setDismissed(true)
  }

  return (
    <>
      <div className="animate-slide-down mx-3 mt-2 flex items-center gap-2 rounded-lg bg-brand-50 px-3 py-2 text-sm text-slate-700">
        <SmartphoneIcon className="h-4 w-4 shrink-0 text-brand-700" />
        <span className="min-w-0 flex-1">Install PingMe as an app</span>
        <button
          type="button"
          onClick={() => (state === 'ios' ? setStepsOpen(true) : install())}
          className="shrink-0 rounded-md px-2 py-1 font-medium text-brand-700 hover:bg-brand-100 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none"
        >
          Install
        </button>
        <button
          type="button"
          onClick={dismiss}
          className="shrink-0 rounded-md px-1.5 py-0.5 text-lg leading-none text-slate-500 hover:bg-brand-100 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none"
          aria-label="Dismiss install offer"
        >
          ×
        </button>
      </div>
      <InstallAppDialog open={stepsOpen} onClose={() => setStepsOpen(false)} />
    </>
  )
}
