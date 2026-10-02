import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react'

import { askAi, clearAi, retryAi, stopAi } from '../../api/ai.js'
import { errorMessage } from '../../api/http.js'
import { useChatStore } from '../../store/useChatStore.js'
import { kindOf } from '../../utils/files.js'
import { dayLabel, isSameDay } from '../../utils/time.js'
import Button from '../common/Button.jsx'
import ConfirmDialog from '../common/ConfirmDialog.jsx'
import Dialog from '../common/Dialog.jsx'
import { AlertIcon, BackIcon, LockIcon, TrashIcon } from '../common/Icons.jsx'
import Skeleton from '../common/Skeleton.jsx'
import Spinner from '../common/Spinner.jsx'
import TypingDots from '../common/TypingDots.jsx'
import AiAvatar from './AiAvatar.jsx'
import AiBubble from './AiBubble.jsx'
import AiComposer from './AiComposer.jsx'

const NEAR_BOTTOM_PX = 120
const LOAD_OLDER_PX = 80
// Show "N messages left today" once someone gets this close to the limit.
const SHOW_LEFT_FROM = 5

const SUGGESTIONS = [
  'Explain recursion with a simple example',
  'Plan my study week for exams',
  'Write a leave application for college',
  'Translate "How are you?" into Hindi',
]

// The PingMe AI chat. Questions go to the server over REST (they may carry a
// file); the answer streams back over the socket - see useSocketEvents and
// server/src/services/aiService.js.
export default function AiChat() {
  const ai = useChatStore((s) => s.ai)
  const store = useChatStore.getState
  const [viewing, setViewing] = useState(null) // a photo open full size
  const [confirmClear, setConfirmClear] = useState(false)
  const { items, status, latest, available, imageGeneration, dailyLimit, usedToday, hasMore } = ai
  const answering = latest?.role === 'model' && latest.status === 'streaming'
  const latestAnswerId = [...items].reverse().find((m) => m.role === 'model' && m.id)?.id

  // Load (or refresh) the latest page every time the chat is opened, and
  // the summary too, for an up-to-date "messages left today".
  useEffect(() => {
    store().fetchAiMessages()
    store().fetchAiSummary()
  }, [store])

  // Sends a question that is shown on screen already (`pending`, which has
  // no id yet). Used for the first try and for Retry.
  async function deliver(pending) {
    const { clientId } = pending
    store().updatePendingAiMessage(clientId, { status: pending.file ? 'uploading' : 'sending', progress: 0 })
    try {
      const { question, answer } = await askAi(
        { text: pending.text, clientId, mode: pending.mode, file: pending.file, voice: pending.voice },
        (progress) => store().updatePendingAiMessage(clientId, { progress }),
      )
      store().addAiMessages([question, answer].filter(Boolean))
      // The saved copy now shows the file from the server - release the
      // temporary blob: URL that previewed it.
      if (pending.attachment) URL.revokeObjectURL(pending.attachment.url)
    } catch (err) {
      store().updatePendingAiMessage(clientId, { status: 'failed' })
      store().addToast(errorMessage(err), 'error')
    }
  }

  // Optimistic, like a chat message: the question appears at once (a file
  // previewed from a blob: URL), with a clientId made here so a Retry is
  // recognised by the server instead of being saved twice.
  function send({ text, file, voice, mode }) {
    const pending = {
      id: null,
      clientId: crypto.randomUUID(),
      role: 'user',
      text,
      mode,
      forwarded: false,
      createdAt: new Date().toISOString(),
      status: file ? 'uploading' : 'sending',
      progress: 0,
      file,
      voice,
      attachment: file
        ? {
            name: file.name,
            size: file.size,
            mimeType: file.type,
            kind: voice ? 'audio' : kindOf(file),
            url: URL.createObjectURL(file),
            durationMs: voice?.durationMs ?? null,
            waveform: voice?.waveform ?? null,
          }
        : null,
    }
    store().addPendingAiMessage(pending)
    deliver(pending)
  }

  function removeQuestion(pending) {
    if (pending.attachment) URL.revokeObjectURL(pending.attachment.url)
    store().removePendingAiMessage(pending.clientId)
  }

  function retryAnswer() {
    retryAi()
      .then((answer) => store().addAiMessages([answer]))
      .catch((err) => store().addToast(errorMessage(err), 'error'))
  }

  function stop() {
    stopAi().catch((err) => store().addToast(errorMessage(err), 'error'))
  }

  async function clear() {
    try {
      await clearAi()
      store().clearAiChat()
    } catch (err) {
      store().addToast(errorMessage(err), 'error')
    }
  }

  const left = Math.max(0, dailyLimit - usedToday)

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-slate-50" aria-label="PingMe AI">
      <header className="flex items-center gap-3 border-b border-slate-200 bg-surface px-3 py-3 sm:px-4">
        <button
          type="button"
          onClick={() => store().setActiveConversation(null)}
          className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none md:hidden"
          aria-label="Back to chats"
        >
          <BackIcon />
        </button>
        <AiAvatar />
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-slate-900">PingMe AI</h2>
          <p className="truncate text-xs text-slate-500">
            {answering ? (
              <span className="inline-flex items-center gap-1.5 font-medium text-brand-600">
                thinking <TypingDots />
              </span>
            ) : (
              'AI assistant · powered by Gemini'
            )}
          </p>
        </div>
        {items.length > 0 && (
          <button
            type="button"
            onClick={() => setConfirmClear(true)}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none"
            aria-label="Clear chat"
            title="Clear chat"
          >
            <TrashIcon className="h-5 w-5" />
          </button>
        )}
      </header>

      {status === 'error' && items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <AlertIcon className="h-8 w-8 text-red-500" />
          <p className="text-sm text-slate-600">Could not load your chat with PingMe AI.</p>
          <Button size="sm" onClick={() => store().fetchAiMessages()}>
            Try again
          </Button>
        </div>
      ) : status !== 'ready' && items.length === 0 ? (
        <div className="chat-background flex min-h-0 flex-1 flex-col justify-end gap-2 p-4" role="status">
          <span className="sr-only">Loading…</span>
          <Skeleton className="ml-auto h-10 w-48" />
          <Skeleton className="h-20 w-64" />
        </div>
      ) : items.length === 0 ? (
        <Welcome onPick={(text) => available && send({ text, mode: 'chat' })} />
      ) : (
        <AiMessageList
          items={items}
          hasMore={hasMore}
          latestAnswerId={latestAnswerId}
          onOpenImage={setViewing}
          onRetryQuestion={deliver}
          onRemoveQuestion={removeQuestion}
          onRetryAnswer={retryAnswer}
        />
      )}

      {available ? (
        <>
          {dailyLimit > 0 && left <= SHOW_LEFT_FROM && (
            <p className="bg-slate-100 px-4 pt-2 text-center text-xs text-slate-500" aria-live="polite">
              {left === 0
                ? "You've used all of today's PingMe AI messages - more tomorrow."
                : `${left} PingMe AI message${left === 1 ? '' : 's'} left today`}
            </p>
          )}
          <AiComposer onSend={send} onStop={stop} answering={answering} imageGeneration={imageGeneration} />
        </>
      ) : (
        <div className="flex items-center justify-center gap-2 border-t border-slate-200 bg-slate-100 px-4 py-3.5 text-sm text-slate-500">
          <LockIcon className="h-4 w-4 shrink-0" />
          PingMe AI is turned off right now
        </div>
      )}

      <Dialog open={Boolean(viewing)} onClose={() => setViewing(null)} title={viewing?.name ?? 'Photo'} wide>
        {viewing && <img src={viewing.url} alt="" className="mx-auto max-h-[70vh] max-w-full rounded-lg object-contain" />}
      </Dialog>

      <ConfirmDialog
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        title="Clear chat with PingMe AI?"
        confirmLabel="Clear chat"
        danger
        onConfirm={clear}
      >
        Every message, photo and file in this chat will be deleted, on all your devices. This cannot be undone.
      </ConfirmDialog>
    </section>
  )
}

// What PingMe AI does with what you send - shown before the first message
// and at the start of the history.
function Disclosure() {
  return (
    <p className="mx-auto max-w-md rounded-lg bg-surface/80 px-3 py-2 text-center text-xs leading-relaxed text-slate-500 shadow-sm">
      <LockIcon className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />
      PingMe AI is powered by Google Gemini. What you send here goes to Google to get an answer, and Google may use it
      to improve its products - so don't share passwords or private details. PingMe AI can make mistakes.
    </p>
  )
}

function Welcome({ onPick }) {
  return (
    <div className="chat-background flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-8">
      <div className="m-auto flex max-w-md flex-col items-center gap-4 text-center">
        <AiAvatar size="lg" />
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Hi! I'm PingMe AI ✨</h3>
          <p className="mt-1 text-sm text-slate-600">
            Ask me anything - I can explain topics, help with code, write messages, and read your photos, PDFs and
            voice notes. Forward me a message from any chat to ask about it.
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          {SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => onPick(suggestion)}
              className="rounded-full border border-slate-200 bg-surface px-3 py-1.5 text-sm text-slate-700 shadow-sm transition-colors duration-150 hover:border-brand-500 hover:text-brand-700 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none"
            >
              {suggestion}
            </button>
          ))}
        </div>
        <Disclosure />
      </div>
    </div>
  )
}

// A question keeps its clientId from the moment it is typed, so its bubble
// is not replaced when the saved copy arrives. Answers have no clientId.
const keyOf = (message) => message?.clientId ?? message?.id ?? null

// The same scrolling rules as a chat: open at the bottom, keep the place
// when older messages load above, and follow new text down only if the
// reader is already near the bottom - except a question I just asked,
// which always scrolls into view.
function AiMessageList({ items, hasMore, latestAnswerId, onOpenImage, ...actions }) {
  const fetchOlder = useChatStore((s) => s.fetchOlderAiMessages)
  const listRef = useRef(null)
  const nearBottom = useRef(true)
  const lastKey = useRef(null)
  const restoreFrom = useRef(null)
  const [loadingOlder, setLoadingOlder] = useState(false)
  // Messages already there when the chat opened don't slide in - only new ones.
  const [shownAtOpen] = useState(() => new Set(items.map(keyOf)))

  // Runs on every change, including each streamed piece of an answer.
  useLayoutEffect(() => {
    const el = listRef.current
    if (!el) return
    if (restoreFrom.current) {
      el.scrollTop = el.scrollHeight - restoreFrom.current.height + restoreFrom.current.top
      restoreFrom.current = null
      return
    }
    const last = items[items.length - 1]
    const key = keyOf(last)
    const firstRender = lastKey.current === null
    const iJustAsked = key !== lastKey.current && last?.role === 'user'
    lastKey.current = key
    if (firstRender || iJustAsked || nearBottom.current) el.scrollTop = el.scrollHeight
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
  function handleMediaLoad() {
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
        aria-label="Chat with PingMe AI"
      >
        {loadingOlder && (
          <div className="pointer-events-none absolute inset-x-0 top-2 flex justify-center">
            <span className="rounded-full bg-surface p-1.5 shadow">
              <Spinner className="h-5 w-5" />
            </span>
          </div>
        )}
        {!hasMore && (
          <div className="pb-4">
            <Disclosure />
          </div>
        )}
        <ol className="space-y-1.5">
          {items.map((message, i) => {
            const newDay = i === 0 || !isSameDay(items[i - 1].createdAt, message.createdAt)
            return (
              <Fragment key={keyOf(message)}>
                {newDay && (
                  <li className="flex justify-center py-2">
                    <span className="rounded-full bg-surface px-3 py-1 text-xs font-medium text-slate-500 shadow-sm">
                      {dayLabel(message.createdAt)}
                    </span>
                  </li>
                )}
                <AiBubble
                  message={message}
                  isNew={!shownAtOpen.has(keyOf(message))}
                  isLatestAnswer={message.id === latestAnswerId}
                  onOpenImage={onOpenImage}
                  onMediaLoad={handleMediaLoad}
                  {...actions}
                />
              </Fragment>
            )
          })}
        </ol>
      </div>
    </div>
  )
}
