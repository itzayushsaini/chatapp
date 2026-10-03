import { useEffect, useId, useRef } from 'react'

// A modal built on the browser's own <dialog> element. showModal() gives us,
// for free: focus moves into the dialog and stays there, Escape closes it,
// the page behind cannot be clicked, and screen readers announce it.
//
// The content is only rendered while open, so a form inside starts fresh
// every time the dialog opens.
export default function Dialog({ open, onClose, title, children, wide = false }) {
  const ref = useRef(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = ref.current
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      // Fired by Escape and by dialog.close() - keep React's state in step.
      onClose={onClose}
      // A click on the dialog element itself (not its content) is a click on
      // the dark backdrop around it.
      onClick={(e) => e.target === ref.current && onClose()}
      // text-left: a dialog opened from a centred section (the home page's
      // hero) would otherwise inherit text-align: center.
      className={`m-auto w-[calc(100%-2rem)] rounded-2xl bg-surface p-0 text-left shadow-xl backdrop:bg-black/50 ${
        wide ? 'max-w-3xl' : 'max-w-md'
      }`}
    >
      {open && (
        <div className="p-5 sm:p-6">
          <div className="mb-4 flex items-center justify-between gap-4">
            <h2 id={titleId} className="text-lg font-semibold text-slate-900">
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-2 py-1 text-xl leading-none text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none"
              aria-label="Close"
            >
              ×
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  )
}
