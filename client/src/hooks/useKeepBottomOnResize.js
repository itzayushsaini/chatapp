import { useEffect } from 'react'

// When a message list gets SHORTER - the phone keyboard opened, or the
// window was resized - the newest messages would end up hidden below. If
// the reader was already at the bottom, keep the newest one in view, the way
// WhatsApp does. Someone who had scrolled up to read is left where they are.
//
// `listRef` is the scrolling element; `nearBottomRef` is the list's own
// "was the reader near the bottom?" ref, kept up to date on every scroll.
export function useKeepBottomOnResize(listRef, nearBottomRef) {
  useEffect(() => {
    const list = listRef.current
    if (!list || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => {
      if (nearBottomRef.current) list.scrollTop = list.scrollHeight
    })
    observer.observe(list)
    return () => observer.disconnect()
  }, [listRef, nearBottomRef])
}
