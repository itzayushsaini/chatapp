import { useEffect } from 'react'

// When the list gets shorter (e.g. the phone keyboard opens), keep the newest message in view.
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
