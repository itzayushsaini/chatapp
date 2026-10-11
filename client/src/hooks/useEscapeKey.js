import { useEffect, useRef } from 'react'

// Calls `handler` when Escape is pressed anywhere on the page - but only when
// nothing else is using that Escape: an open dialog closes itself on Escape
// (the browser does it for <dialog>), an open message menu closes, and a
// voice recording is cancelled (those handlers call preventDefault). Used to
// close the open chat: Escape steps back one thing at a time.
export function useEscapeKey(handler) {
  const latest = useRef(handler)
  useEffect(() => {
    latest.current = handler
  })

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      if (document.querySelector('dialog[open], [role="menu"]')) return
      latest.current(event)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])
}
