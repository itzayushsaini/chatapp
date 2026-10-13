import { useEffect, useRef } from 'react'

// Skips an Escape already used by a dialog, menu or recording, so it steps back one thing at a time.
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
