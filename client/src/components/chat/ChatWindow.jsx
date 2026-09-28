import { useEffect, useState } from 'react'

import { uploadAttachment } from '../../api/conversations.js'
import { errorMessage } from '../../api/http.js'
import { useAuth } from '../../context/AuthContext.jsx'
import { useSocket } from '../../context/SocketContext.jsx'
import { useFriendStatus } from '../../hooks/useFriendStatus.js'
import { useChatStore } from '../../store/useChatStore.js'
import { kindOf } from '../../utils/files.js'
import Avatar from '../common/Avatar.jsx'
import Button from '../common/Button.jsx'
import { AlertIcon, BackIcon, BellOffIcon } from '../common/Icons.jsx'
import Skeleton from '../common/Skeleton.jsx'
import TypingDots from '../common/TypingDots.jsx'
import ContactInfoPanel from './ContactInfoPanel.jsx'
import MessageInput from './MessageInput.jsx'
import MessageList from './MessageList.jsx'

// How long to wait for the server's ack before marking a message as failed.
const ACK_TIMEOUT_MS = 10_000

export default function ChatWindow({ conversationId }) {
  const socket = useSocket()
  const { user } = useAuth()
  const item = useChatStore((s) => s.friends.find((f) => f.conversationId === conversationId))
  const entry = useChatStore((s) => s.messagesByConversation[conversationId])
  const readUpTo = useChatStore((s) => s.readUpTo[conversationId] ?? null)
  const deliveredUpTo = useChatStore((s) => s.deliveredUpTo[conversationId] ?? null)
  const store = useChatStore.getState
  const [replyTarget, setReplyTarget] = useState(null)
  const [infoOpen, setInfoOpen] = useState(false)

  // A different chat clears the reply-in-progress state and closes the
  // contact info panel.
  useEffect(() => {
    setReplyTarget(null)
    setInfoOpen(false)
  }, [conversationId])

  // Load the latest page the first time this chat is opened.
  useEffect(() => {
    if (!store().messagesByConversation[conversationId]) store().fetchLatest(conversationId)
  }, [conversationId, store])

  // Opening a chat marks everything currently in it as read - the same
  // moment WhatsApp does. (New messages that arrive while it stays open are
  // marked read separately, in useSocketEvents.) Only while the tab is
  // actually visible: a chat left open in a minimised tab has not been
  // SEEN, so it stays "delivered" until the tab is shown again - which is
  // what the visibilitychange listener catches.
  useEffect(() => {
    function markLatestRead() {
      if (document.hidden) return
      const current = store().messagesByConversation[conversationId]
      if (current?.status !== 'ready' || !current.messages.length) return
      const latest = [...current.messages].reverse().find((m) => m.id)
      if (latest) socket.emit('conversation:read', { conversationId, upToMessageId: latest.id })
    }
    markLatestRead()
    document.addEventListener('visibilitychange', markLatestRead)
    return () => document.removeEventListener('visibilitychange', markLatestRead)
    // Only re-run when the LATEST message actually changes, not on every
    // store update (e.g. presence ticking) that happens to touch this entry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, entry?.status, entry?.messages?.at(-1)?.id])

  if (!item) return null
  const { friend } = item

  // Sends over the socket and waits for the ack. socket.timeout() makes the
  // callback fire with an error if no ack arrives in time - for example if
  // the connection dropped. The message then shows "Failed - Retry".
  function emit(message) {
    const payload = { conversationId, text: message.text, clientId: message.clientId }
    if (message.attachmentId) payload.attachmentId = message.attachmentId
    if (message.replyToId) payload.replyToId = message.replyToId

    socket
      .timeout(ACK_TIMEOUT_MS)
      .emit(
        'message:send',
        payload,
        (err, ack) => {
          if (!err && ack?.ok) {
            store().confirmMessage(ack.message)
            return
          }
          store().setMessageStatus(conversationId, message.clientId, 'failed')
          if (!err && ack?.error) store().addToast(ack.error, 'error')
        },
      )
  }

  // A message with a file goes in two steps: upload the file (REST, with a
  // progress bar), then send the message pointing at it (socket). If the
  // upload already worked, a Retry skips straight to step 2.
  async function deliver(message) {
    const { clientId } = message
    if (message.file && !message.attachmentId) {
      try {
        const attachment = await uploadAttachment(conversationId, message.file, (progress) =>
          store().updatePendingMessage(conversationId, clientId, { progress }),
        )
        message = { ...message, attachmentId: attachment.id }
        store().updatePendingMessage(conversationId, clientId, {
          attachmentId: attachment.id,
          status: 'sending',
        })
      } catch (err) {
        store().setMessageStatus(conversationId, clientId, 'failed')
        store().addToast(errorMessage(err), 'error')
        return
      }
    }
    emit(message)
  }

  // Optimistic sending: show the bubble immediately, then send. The clientId
  // is made here, in the browser, so a Retry can reuse it and the server
  // recognises the retry instead of saving the message twice.
  function send(text, file, replyToId) {
    const message = {
      clientId: crypto.randomUUID(),
      conversationId,
      senderId: user.id,
      text,
      createdAt: new Date().toISOString(),
      status: file ? 'uploading' : 'sending',
    }
    if (replyToId) {
      message.replyToId = replyToId
      // Shown at once, from what's already on screen - replaced by the
      // server's own snapshot once the ack/message:new arrives.
      message.replyTo = {
        messageId: replyTarget.id,
        senderId: replyTarget.senderId,
        textSnippet: replyTarget.text?.slice(0, 120) ?? '',
        attachmentKind: replyTarget.attachment?.kind ?? null,
      }
    }
    if (file) {
      message.file = file
      message.progress = 0
      // What the bubble shows until the server has the file: the file itself,
      // from a temporary blob: URL. `local` marks it for clean-up later.
      message.attachment = {
        name: file.name,
        size: file.size,
        kind: kindOf(file),
        url: URL.createObjectURL(file),
        local: true,
      }
    }
    store().addPendingMessage(message)
    deliver(message)
  }

  function retry(message) {
    // Read the latest copy: the upload may have finished since this render.
    const current =
      store().messagesByConversation[conversationId]?.messages.find(
        (m) => m.clientId === message.clientId && !m.id,
      ) ?? message
    const status = current.file && !current.attachmentId ? 'uploading' : 'sending'
    store().updatePendingMessage(conversationId, current.clientId, { status, progress: 0 })
    deliver(current)
  }

  return (
    <section className="relative flex min-h-0 flex-1" aria-label={`Chat with ${friend.displayName}`}>
      {/* Keyed by conversationId so the WHOLE pane (header, list, input) is
          torn down and rebuilt on every switch - not just the list inside it.
          Without this, an old MessageList could end up not being cleanly
          replaced, leaving a stale instance showing the previous chat's
          messages under the new chat's header. */}
      <div key={conversationId} className="flex min-h-0 min-w-0 flex-1 flex-col bg-slate-50">
        <ChatHeader
          friend={friend}
          muted={Boolean(item.muted)}
          conversationId={conversationId}
          onBack={() => store().setActiveConversation(null)}
          onOpenInfo={() => setInfoOpen(true)}
        />

        {!entry || entry.status === 'loading' ? (
          <div className="chat-background flex min-h-0 flex-1 flex-col justify-end gap-2 p-4" role="status">
            <span className="sr-only">Loading messages…</span>
            <Skeleton className="h-9 w-48" />
            <Skeleton className="ml-auto h-9 w-40" />
            <Skeleton className="h-9 w-56" />
            <Skeleton className="ml-auto h-9 w-32" />
          </div>
        ) : entry.status === 'error' ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
            <AlertIcon className="h-8 w-8 text-red-500" />
            <p className="text-sm text-slate-600">Could not load messages.</p>
            <Button size="sm" onClick={() => store().fetchLatest(conversationId)}>
              Try again
            </Button>
          </div>
        ) : (
          <MessageList
            key={conversationId}
            conversationId={conversationId}
            messages={entry.messages}
            hasMore={entry.hasMore}
            myId={user.id}
            friendName={friend.displayName}
            readUpTo={readUpTo}
            deliveredUpTo={deliveredUpTo}
            onRetry={retry}
            onReply={setReplyTarget}
          />
        )}

        <MessageInput
          key={conversationId}
          onSend={send}
          onTyping={(isTyping) => socket.emit('typing', { conversationId, isTyping })}
          disabled={entry?.status !== 'ready'}
          replyTarget={replyTarget}
          myId={user.id}
          friendName={friend.displayName}
          onCancelReply={() => setReplyTarget(null)}
        />
      </div>

      {/* Over the chat on small and medium screens, beside it on wide ones. */}
      {infoOpen && <ContactInfoPanel item={item} onClose={() => setInfoOpen(false)} />}
    </section>
  )
}

function ChatHeader({ friend, muted, conversationId, onBack, onOpenInfo }) {
  const status = useFriendStatus(friend.id, conversationId)

  return (
    <header className="flex items-center gap-3 border-b border-slate-200 bg-surface px-3 py-3 sm:px-4">
      {/* Only on small screens, where the list and the chat are separate views. */}
      <button
        type="button"
        onClick={onBack}
        className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none md:hidden"
        aria-label="Back to chats"
      >
        <BackIcon />
      </button>
      {/* The picture and the name both open Contact info. The picture is
          skipped by Tab (tabIndex -1) so keyboard users have one stop. */}
      <button
        type="button"
        tabIndex={-1}
        onClick={onOpenInfo}
        className="shrink-0 rounded-full"
        aria-hidden="true"
      >
        <Avatar user={friend} online={status.online} />
      </button>
      <div className="min-w-0 flex-1">
        <h2 className="flex items-center gap-1.5 font-semibold text-slate-900">
          <button
            type="button"
            onClick={onOpenInfo}
            className="max-w-full truncate rounded text-left hover:underline focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none"
            title="Contact info"
          >
            {friend.displayName}
          </button>
          {muted && (
            <span title="Notifications muted">
              <BellOffIcon className="h-4 w-4 shrink-0 text-slate-400" />
              <span className="sr-only">(muted)</span>
            </span>
          )}
        </h2>
        <p
          className={`flex items-center gap-1 truncate text-xs ${status.active ? 'text-emerald-600' : 'text-slate-500'}`}
          aria-live="polite"
        >
          {status.text}
          {status.typing && <TypingDots />}
        </p>
      </div>
    </header>
  )
}