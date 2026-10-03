import Button from './Button.jsx'
import Dialog from './Dialog.jsx'
import { PlusSquareIcon, ShareIcon, SmartphoneIcon } from './Icons.jsx'

const STEPS = [
  { icon: ShareIcon, text: 'Tap the Share button in Safari (at the bottom of the screen, or at the top on an iPad).' },
  { icon: PlusSquareIcon, text: 'Scroll down and tap "Add to Home Screen".' },
  { icon: SmartphoneIcon, text: 'Tap "Add". PingMe is now on your Home Screen - open it from there.' },
]

// iPhones and iPads have no install button a website can show - Apple only
// allows installing from Safari's Share menu - so these are the steps.
export default function InstallAppDialog({ open, onClose }) {
  return (
    <Dialog open={open} onClose={onClose} title="Install PingMe on your iPhone">
      <ol className="space-y-3">
        {STEPS.map((step, i) => (
          <li key={step.text} className="flex items-start gap-3 text-sm text-slate-700">
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700">
              <step.icon className="h-4 w-4" />
            </span>
            <span className="pt-1.5">
              <span className="font-semibold text-slate-900">{i + 1}. </span>
              {step.text}
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
        Opened from the Home Screen, PingMe runs full screen like an app - and can show notifications even while it is
        closed (iOS 16.4 or newer).
      </p>
      <div className="mt-5 flex justify-end">
        <Button onClick={onClose}>Got it</Button>
      </div>
    </Dialog>
  )
}
