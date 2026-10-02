import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react'

import { markUpdatesRead } from '../../api/updates.js'
import { useChatStore } from '../../store/useChatStore.js'
import { dayLabel, formatTime, isSameDay } from '../../utils/time.js'
import Button from '../common/Button.jsx'
import Dialog from '../common/Dialog.jsx'
import { AlertIcon, BackIcon, LockIcon, VerifiedIcon } from '../common/Icons.jsx'
import Skeleton from '../common/Skeleton.jsx'
import Spinner from '../common/Spinner.jsx'
import PingMeAvatar from './PingMeAvatar.jsx'

const NEAR_BOTTOM_PX = 120
const LOAD_OLDER_PX = 80

// The "PingMe" updates channel: posts from the PingMe team, shown like a
// chat, but read-only - there is no message box, only a note saying so,
// exactly like WhatsApp's own official chat.
export default function UpdatesChannel() {
  const updates = useChatStore((s) => s.updates)
  const store = useChatStore.getState
  const { items, hasMore, status, latest, unreadCount } = updates

  // Load (or refresh) the latest page every time the channel is opened.
  useEffect(() => {
    store().fetchUpdates()
  }, [store])

  // Mark everything read - but only while the tab is actually visible, the
  // same rule as a chat: open in a minimised tab is not "seen". Runs again
  // whenever a new post arrives while the channel is open.
  useEffect(() => {
    function markRead() {
      if (document.hidden) return
      const { latest: newest, unreadCount: count } = store().updates
      if (!newest || count === 0) return
      store().clearUpdatesUnread()
      // If this fails, ask the server for the real count again.
      markUpdatesRead(newest.id).catch(() => store().fetchUpdatesSummary())
    }
    markRead()
    document.addEventListener('visibilitychange', markRead)
    return () => document.removeEventListener('visibilitychange', markRead)
  }, [latest?.id, unreadCount, store])

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-slate-50" aria-label="PingMe updates">
      <header className="flex items-center gap-3 border-b border-slate-200 bg-surface px-3 py-3 sm:px-4">
        <button
          type="button"
          onClick={() => store().setActiveConversation(null)}
          className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none md:hidden"
          aria-label="Back to chats"
        >
          <BackIcon />
        </button>
        <PingMeAvatar />
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-1.5 font-semibold text-slate-900">
            PingMe
            <VerifiedIcon className="h-4 w-4 shrink-0 text-brand-600" />
            <span className="sr-only">(official account)</span>
          </h2>
          <p className="truncate text-xs text-slate-500">Official updates from the PingMe team</p>
        </div>
      </header>

      {status === 'error' && items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <AlertIcon className="h-8 w-8 text-red-500" />
          <p className="text-sm text-slate-600">Could not load updates.</p>
          <Button size="sm" onClick={() => store().fetchUpdates()}>
            Try again
          </Button>
        </div>
      ) : status !== 'ready' && items.length === 0 ? (
        <div className="chat-background flex min-h-0 flex-1 flex-col justify-end gap-2 p-4" role="status">
          <span className="sr-only">Loading updates…</span>
          <Skeleton className="h-16 w-64" />
          <Skeleton className="h-10 w-48" />
        </div>
      ) : (
        <UpdatesList items={items} hasMore={hasMore} />
      )}

      {/* No message box: only PingMe posts here. */}
      <div className="flex items-center justify-center gap-2 border-t border-slate-200 bg-slate-100 px-4 py-3.5 text-sm text-slate-500">
        <LockIcon className="h-4 w-4 shrink-0" />
        Only PingMe can send messages here
      </div>
    </section>
  )
}

// The posts, oldest at the top - the same scrolling rules as a chat: open at
// the bottom, keep the reader's place when older posts load above, and only
// follow a new post down if the reader was already near the bottom.
function UpdatesList({ items, hasMore }) {
  const fetchOlder = useChatStore((s) => s.fetchOlderUpdates)
  const listRef = useRef(null)
  const nearBottom = useRef(true)
  const lastId = useRef(null)
  const restoreFrom = useRef(null)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [viewing, setViewing] = useState(null) // the post whose photo is open full size

  useLayoutEffect(() => {
    const el = listRef.current
    if (!el) return
    if (restoreFrom.current) {
      el.scrollTop = el.scrollHeight - restoreFrom.current.height + restoreFrom.current.top
      restoreFrom.current = null
      return
    }
    const newest = items[items.length - 1]?.id ?? null
    if (newest === lastId.current) return
    const firstRender = lastId.current === null
    lastId.current = newest
    if (firstRender || nearBottom.current) el.scrollTop = el.scrollHeight
  }, [items])

  async function handleScroll() {
    const el = listRef.current
    nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX
    if (el.scrollTop < LOAD_OLDER_PX && hasMore && !loadingOlder) {
      setLoadingOlder(true)
      restoreFrom.current = { height: el.scrollHeight, top: el.scrollTop }
      const added = await fetchOlder()
      if (!added) restoreFrom.current = null
      setLoadingOlder(false)
    }
  }

  // A photo only gets its real height once it loads - stay at the bottom.
  function handleImageLoad() {
    const el = listRef.current
    if (el && nearBottom.current) el.scrollTop = el.scrollHeight
  }

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={listRef}
        onScroll={handleScroll}
        className="chat-background h-full overflow-y-auto overscroll-contain px-3 py-4 sm:px-6"
        role="log"
        aria-label="Updates"
      >
        {loadingOlder && (
          <div className="pointer-events-none absolute inset-x-0 top-2 flex justify-center">
            <span className="rounded-full bg-surface p-1.5 shadow">
              <Spinner className="h-5 w-5" />
            </span>
          </div>
        )}
        {items.length === 0 ? (
          <p className="mt-10 text-center text-sm text-slate-500">
            No updates yet - new features will be announced here.
          </p>
        ) : (
          !hasMore && (
            <p className="mx-auto max-w-sm pb-4 text-center text-xs text-slate-500">
              This is where the PingMe team announces new features and news.
            </p>
          )
        )}

        <ol className="space-y-1.5">
          {items.map((update, i) => {
            const newDay = i === 0 || !isSameDay(items[i - 1].createdAt, update.createdAt)
            return (
              <Fragment key={update.id}>
                {newDay && (
                  <li className="flex justify-center py-2">
                    <span className="rounded-full bg-surface px-3 py-1 text-xs font-medium text-slate-500 shadow-sm">
                      {dayLabel(update.createdAt)}
                    </span>
                  </li>
                )}
                <UpdatePost update={update} onOpenImage={setViewing} onImageLoad={handleImageLoad} />
              </Fragment>
            )
          })}
        </ol>
      </div>

      <Dialog open={Boolean(viewing)} onClose={() => setViewing(null)} title="Photo from PingMe" wide>
        {viewing && (
          <img
            src={viewing.imageUrl}
            alt=""
            className="mx-auto max-h-[70vh] max-w-full rounded-lg object-contain"
          />
        )}
      </Dialog>
    </div>
  )
}

// One post: an incoming bubble from PingMe. The text is plain text, shown
// with its line breaks (never as HTML).
function UpdatePost({ update, onOpenImage, onImageLoad }) {
  return (
    <li className="flex justify-start">
      <div
        className={`max-w-[85%] min-w-0 rounded-lg rounded-tl-none bg-surface text-sm text-slate-900 shadow-sm sm:max-w-[70%] ${
          update.imageUrl ? 'overflow-hidden p-1' : 'bubble-tail-theirs px-2.5 py-1.5'
        }`}
      >
        {update.imageUrl && (
          <button
            type="button"
            onClick={() => onOpenImage(update)}
            className="block rounded-md focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none"
            aria-label="Open photo"
          >
            <img
              src={update.imageUrl}
              alt=""
              onLoad={onImageLoad}
              className="max-h-72 w-auto max-w-full rounded-md bg-slate-200 object-cover"
            />
          </button>
        )}
        {update.text && (
          <p className={`whitespace-pre-wrap wrap-anywhere ${update.imageUrl ? 'px-2 pt-1.5' : ''}`}>{update.text}</p>
        )}
        <div className={`flex justify-end text-[11px] text-meta ${update.imageUrl ? 'px-2 pb-1' : ''}`}>
          {formatTime(update.createdAt)}
        </div>
      </div>
    </li>
  )
}
