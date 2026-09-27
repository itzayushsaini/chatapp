import { useChatStore } from '../../store/useChatStore.js'

// Small pop-up notices: a new friend request, a request accepted, errors.
// aria-live makes screen readers announce each new toast.
export default function Toasts() {
  const toasts = useChatStore((s) => s.toasts)
  const dismiss = useChatStore((s) => s.dismissToast)

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4 sm:right-4 sm:left-auto sm:items-end"
      aria-live="polite"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto flex max-w-sm items-start gap-3 rounded-xl px-4 py-3 text-sm shadow-lg ${
            t.kind === 'error' ? 'bg-red-600 text-white' : 'bg-slate-900 text-white'
          }`}
          role={t.kind === 'error' ? 'alert' : 'status'}
        >
          <span className="flex-1">{t.text}</span>
          <button
            type="button"
            onClick={() => dismiss(t.id)}
            className="rounded px-1 font-semibold opacity-80 hover:opacity-100 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
}
