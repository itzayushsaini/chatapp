import { Fragment, useLayoutEffect, useRef, useState } from 'react'

import { useChatStore } from '../../store/useChatStore.js'
import { dayLabel, isSameDay } from '../../utils/time.js'
import { ArrowDownIcon } from '../common/Icons.jsx'
import Spinner from '../common/Spinner.jsx'
import MessageBubble from './MessageBubble.jsx'

// "Near the bottom" = within this many pixels of it.
const NEAR_BOTTOM_PX = 120
const LOAD_OLDER_PX = 80

export default function MessageList({ conversationId, messages, hasMore, myId, onRetry }) {
  const fetchOlder = useChatStore((s) => s.fetchOlder)
  const listRef = useRef(null)
  const nearBottom = useRef(true)
  const lastKey = useRef(null)
  // Set just before older messages load: the scroll position to restore.
  const restoreFrom = useRef(null)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [showNewPill, setShowNewPill] = useState(false)

  // Runs after React updates the DOM but BEFORE the browser paints, so any
  // scroll adjustment is invisible - no jump.
  useLayoutEffect(() => {
    const el = listRef.current
    if (!el) return

    if (restoreFrom.current) {
      // Older messages were added ABOVE. Without this, the content would
      // shift down and the user would lose their place. Keep the same
      // distance from the bottom instead.
      el.scrollTop = el.scrollHeight - restoreFrom.current.height + restoreFrom.current.top
      restoreFrom.current = null
      return
    }

    const last = messages[messages.length - 1]
    const key = last?.clientId ?? null
    if (key === lastKey.current) return // nothing new at the bottom

    const isFirstRender = lastKey.current === null
    lastKey.current = key
    // Auto-scroll only if the user is already near the bottom (or it is
    // their own message). If they scrolled up to read, do not yank them
    // down - show the "New messages" pill instead.
    if (isFirstRender || nearBottom.current || last?.senderId === myId) {
      el.scrollTop = el.scrollHeight
      setShowNewPill(false)
    } else {
      setShowNewPill(true)
    }
  }, [messages, myId])

  async function handleScroll() {
    const el = listRef.current
    nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX
    if (nearBottom.current) setShowNewPill(false)

    if (el.scrollTop < LOAD_OLDER_PX && hasMore && !loadingOlder) {
      setLoadingOlder(true)
      restoreFrom.current = { height: el.scrollHeight, top: el.scrollTop }
      const added = await fetchOlder(conversationId)
      // Nothing was added (e.g. a network error), so there is no scroll
      // position to restore - forget it so it cannot fire later by mistake.
      if (!added) restoreFrom.current = null
      setLoadingOlder(false)
    }
  }

  function scrollToBottom() {
    const el = listRef.current
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    setShowNewPill(false)
  }

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={listRef}
        onScroll={handleScroll}
        className="h-full overflow-y-auto px-3 py-4 sm:px-6"
        role="log"
        aria-label="Messages"
      >
        {/* Positioned over the list rather than inside it, so showing it
            does not change the content height the scroll restore relies on. */}
        {loadingOlder && (
          <div className="pointer-events-none absolute inset-x-0 top-2 flex justify-center">
            <span className="rounded-full bg-white p-1.5 shadow">
              <Spinner className="h-5 w-5" />
            </span>
          </div>
        )}
        {!hasMore && messages.length > 0 && (
          <p className="pb-4 text-center text-xs text-slate-400">This is the start of your conversation</p>
        )}
        {messages.length === 0 && (
          <p className="mt-10 text-center text-sm text-slate-500">No messages yet. Say hello!</p>
        )}

        <ol className="space-y-1.5">
          {messages.map((m, i) => {
            const previous = messages[i - 1]
            const newDay = !previous || !isSameDay(previous.createdAt, m.createdAt)
            return (
              <Fragment key={m.clientId}>
                {newDay && (
                  <li className="flex justify-center py-2">
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-500 shadow-sm">
                      {dayLabel(m.createdAt)}
                    </span>
                  </li>
                )}
                <MessageBubble message={m} mine={m.senderId === myId} onRetry={onRetry} />
              </Fragment>
            )
          })}
        </ol>
      </div>

      {showNewPill && (
        <button
          type="button"
          onClick={scrollToBottom}
          className="absolute bottom-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-lg hover:bg-blue-700 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          New messages
          <ArrowDownIcon className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}
