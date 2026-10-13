import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react'

import { useKeepBottomOnResize } from '../../hooks/useKeepBottomOnResize.js'
import { useChatStore } from '../../store/useChatStore.js'
import { dayLabel, isSameDay } from '../../utils/time.js'
import Dialog from '../common/Dialog.jsx'
import { ArrowDownIcon, DownloadIcon } from '../common/Icons.jsx'
import Spinner from '../common/Spinner.jsx'
import MessageBubble from './MessageBubble.jsx'

const NEAR_BOTTOM_PX = 120
const LOAD_OLDER_PX = 80
const GROUP_WITHIN_MS = 5 * 60 * 1000
const DAY_PILL_MS = 1400

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
  // True once the first page is shown, so opening a chat doesn't slide in every bubble
  const historyShownRef = useRef(false)
  const restoreFrom = useRef(null)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [showNewPill, setShowNewPill] = useState(false)
  const [viewing, setViewing] = useState(null)
  const [floatingDay, setFloatingDay] = useState(null)
  const dayTimer = useRef(null)
  // Scrolls the list does by itself don't show the floating date
  const quietUntil = useRef(0)
  const scrollByCode = (ms = 400) => {
    quietUntil.current = Date.now() + ms
  }
  useEffect(() => () => clearTimeout(dayTimer.current), [])

  useKeepBottomOnResize(listRef, nearBottom)

  useLayoutEffect(() => {
    const el = listRef.current
    if (!el) return
    historyShownRef.current = true

    if (restoreFrom.current) {
      // Older messages were added above, so keep the same distance from the bottom
      scrollByCode()
      el.scrollTop = el.scrollHeight - restoreFrom.current.height + restoreFrom.current.top
      restoreFrom.current = null
      return
    }

    const last = messages[messages.length - 1]
    const key = last?.clientId ?? null
    if (key === lastKey.current) return

    const isFirstRender = lastKey.current === null
    lastKey.current = key
    if (isFirstRender || nearBottom.current || last?.senderId === myId) {
      scrollByCode()
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

    if (Date.now() >= quietUntil.current) {
      const topEdge = el.getBoundingClientRect().top
      let day = null
      for (const separator of el.querySelectorAll('[data-day]')) {
        if (separator.getBoundingClientRect().top > topEdge + 8) break
        day = separator.dataset.day
      }
      setFloatingDay(day)
      clearTimeout(dayTimer.current)
      dayTimer.current = setTimeout(() => setFloatingDay(null), DAY_PILL_MS)
    }

    if (el.scrollTop < LOAD_OLDER_PX && hasMore && !loadingOlder) {
      setLoadingOlder(true)
      restoreFrom.current = { height: el.scrollHeight, top: el.scrollTop }
      const added = await fetchOlder(conversationId)
      if (!added) restoreFrom.current = null
      setLoadingOlder(false)
    }
  }

  // Photos and videos only get their real height once they load, so stay at the bottom
  function handleMediaLoad() {
    const el = listRef.current
    if (el && nearBottom.current) {
      scrollByCode()
      el.scrollTop = el.scrollHeight
    }
  }

  function scrollToBottom() {
    const el = listRef.current
    scrollByCode(900)
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    setShowNewPill(false)
  }

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={listRef}
        onScroll={handleScroll}
        className="chat-background h-full overflow-y-auto overscroll-contain px-3 py-4 sm:px-6"
        role="log"
        aria-label="Messages"
      >
        {/* Over the list, not in it, so it doesn't change the height the scroll restore relies on */}
        {floatingDay && (
          <div className="pointer-events-none absolute inset-x-0 top-2 z-10 flex justify-center" aria-hidden="true">
            <span className="animate-fade-in rounded-full bg-surface/95 px-3 py-1 text-xs font-medium text-slate-600 shadow-md ring-1 ring-slate-200">
              {floatingDay}
            </span>
          </div>
        )}
        {loadingOlder && (
          <div className="pointer-events-none absolute inset-x-0 top-12 flex justify-center">
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
            const grouped =
              Boolean(previous) &&
              !newDay &&
              previous.senderId === m.senderId &&
              new Date(m.createdAt) - new Date(previous.createdAt) < GROUP_WITHIN_MS
            return (
              <Fragment key={m.clientId}>
                {newDay && (
                  <li className="flex justify-center py-2" data-day={dayLabel(m.createdAt)}>
                    <span className="rounded-full bg-surface px-3 py-1 text-xs font-medium text-slate-500 shadow-sm">
                      {dayLabel(m.createdAt)}
                    </span>
                  </li>
                )}
                <MessageBubble
                  message={m}
                  isNew={historyShownRef.current && i === messages.length - 1}
                  mine={m.senderId === myId}
                  grouped={grouped}
                  myId={myId}
                  friendName={friendName}
                  // Same-length hex ids compare correctly as strings; read implies delivered
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
          className="animate-pop absolute bottom-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-lg transition-colors duration-150 hover:bg-brand-700 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:outline-none"
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
