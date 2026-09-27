import { Fragment, useLayoutEffect, useRef, useState } from 'react'

import { useChatStore } from '../../store/useChatStore.js'
import { dayLabel, isSameDay } from '../../utils/time.js'
import Dialog from '../common/Dialog.jsx'
import { ArrowDownIcon, DownloadIcon } from '../common/Icons.jsx'
import Spinner from '../common/Spinner.jsx'
import MessageBubble from './MessageBubble.jsx'

// "Near the bottom" = within this many pixels of it.
const NEAR_BOTTOM_PX = 120
const LOAD_OLDER_PX = 80

export default function MessageList({
  conversationId,
  messages,
  hasMore,
  myId,
  friendName,
  readUpTo,
  deliveredUpTo,
  onRetry,
  onReply,
}) {
  const fetchOlder = useChatStore((s) => s.fetchOlder)
  const listRef = useRef(null)
  const nearBottom = useRef(true)
  const lastKey = useRef(null)
  // Set just before older messages load: the scroll position to restore.
  const restoreFrom = useRef(null)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [showNewPill, setShowNewPill] = useState(false)
  const [viewing, setViewing] = useState(null) // the photo open full size

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

  // Photos and videos only get their real height once they load, AFTER the
  // scroll-to-bottom above has run. If the user was at the bottom, keep them
  // there.
  function handleMediaLoad() {
    const el = listRef.current
    if (el && nearBottom.current) el.scrollTop = el.scrollHeight
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
        className="chat-background h-full overflow-y-auto px-3 py-4 sm:px-6"
        role="log"
        aria-label="Messages"
      >
        {/* Positioned over the list rather than inside it, so showing it
            does not change the content height the scroll restore relies on. */}
        {loadingOlder && (
          <div className="pointer-events-none absolute inset-x-0 top-2 flex justify-center">
            <span className="rounded-full bg-surface p-1.5 shadow">
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
                    <span className="rounded-full bg-surface px-3 py-1 text-xs font-medium text-slate-500 shadow-sm">
                      {dayLabel(m.createdAt)}
                    </span>
                  </li>
                )}
                <MessageBubble
                  message={m}
                  mine={m.senderId === myId}
                  myId={myId}
                  friendName={friendName}
                  // Same-length hex ids compare correctly as strings. Read
                  // implies delivered, so either pointer covering it counts.
                  read={Boolean(m.id && readUpTo && m.id <= readUpTo)}
                  delivered={Boolean(
                    m.id &&
                      ((deliveredUpTo && m.id <= deliveredUpTo) || (readUpTo && m.id <= readUpTo)),
                  )}
                  onRetry={onRetry}
                  onOpenImage={setViewing}
                  onMediaLoad={handleMediaLoad}
                  onReply={onReply}
                />
              </Fragment>
            )
          })}
        </ol>
      </div>

      {showNewPill && (
        <button
          type="button"
          onClick={scrollToBottom}
          className="absolute bottom-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-lg hover:bg-brand-700 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          New messages
          <ArrowDownIcon className="h-4 w-4" />
        </button>
      )}

      <Dialog open={Boolean(viewing)} onClose={() => setViewing(null)} title={viewing?.name ?? ''} wide>
        {viewing && (
          <div className="flex flex-col items-center gap-3">
            <img src={viewing.url} alt={viewing.name} className="max-h-[70vh] max-w-full rounded-lg object-contain" />
            {!viewing.local && (
              <a
                href={viewing.url}
                download={viewing.name}
                className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none"
              >
                <DownloadIcon className="h-4 w-4" />
                Download
              </a>
            )}
          </div>
        )}
      </Dialog>
    </div>
  )
}
