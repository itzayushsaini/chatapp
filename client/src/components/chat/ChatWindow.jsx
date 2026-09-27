import { useEffect, useState } from 'react'

import { uploadAttachment } from '../../api/conversations.js'
import { unfriend } from '../../api/friends.js'
import { errorMessage } from '../../api/http.js'
import { useAuth } from '../../context/AuthContext.jsx'
import { useSocket } from '../../context/SocketContext.jsx'
import { useChatStore } from '../../store/useChatStore.js'
import { kindOf } from '../../utils/files.js'
import { lastSeenLabel } from '../../utils/time.js'
import Avatar from '../common/Avatar.jsx'
import Button from '../common/Button.jsx'
import { AlertIcon, BackIcon, UserMinusIcon } from '../common/Icons.jsx'
import Spinner from '../common/Spinner.jsx'
import UserProfileDialog from '../profile/UserProfileDialog.jsx'
import MessageInput from './MessageInput.jsx'
import MessageList from './MessageList.jsx'

// How long to wait for the server's ack before marking a message as failed.
const ACK_TIMEOUT_MS = 10_000

export default function ChatWindow({ conversationId }) {
  const socket = useSocket()
  const { user } = useAuth()
  const item = useChatStore((s) => s.friends.find((f) => f.conversationId === conversationId))
  const entry = useChatStore((s) => s.messagesByConversation[conversationId])
  const store = useChatStore.getState

  // Load the latest page the first time this chat is opened.
  useEffect(() => {
    if (!store().messagesByConversation[conversationId]) store().fetchLatest(conversationId)
  }, [conversationId, store])

  if (!item) return null
  const { friend } = item

  // Sends over the socket and waits for the ack. socket.timeout() makes the
  // callback fire with an error if no ack arrives in time - for example if
  // the connection dropped. The message then shows "Failed - Retry".
  function emit(message) {
    const payload = { conversationId, text: message.text, clientId: message.clientId }
    if (message.attachmentId) payload.attachmentId = message.attachmentId

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
  function send(text, file) {
    const message = {
      clientId: crypto.randomUUID(),
      conversationId,
      senderId: user.id,
      text,
      createdAt: new Date().toISOString(),
      status: file ? 'uploading' : 'sending',
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

  async function handleUnfriend() {
    if (!window.confirm(`Remove ${friend.displayName} from your friends?`)) return
    try {
      await unfriend(friend.id)
      store().removeFriend(friend.id)
    } catch (err) {
      store().addToast(errorMessage(err), 'error')
    }
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col bg-slate-50" aria-label={`Chat with ${friend.displayName}`}>
      <ChatHeader friend={friend} onBack={() => store().setActiveConversation(null)} onUnfriend={handleUnfriend} />

      {!entry || entry.status === 'loading' ? (
        <div className="flex flex-1 items-center justify-center">
          <Spinner />
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
          onRetry={retry}
        />
      )}

      <MessageInput onSend={send} disabled={entry?.status !== 'ready'} />
    </section>
  )
}

function ChatHeader({ friend, onBack, onUnfriend }) {
  const presence = useChatStore((s) => s.presence[friend.id])
  const [profileOpen, setProfileOpen] = useState(false)

  const status = presence?.online
    ? 'Online'
    : presence?.lastSeen
      ? lastSeenLabel(presence.lastSeen)
      : 'Offline'

  return (
    <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-3 py-3 sm:px-4">
      {/* Only on small screens, where the list and the chat are separate views. */}
      <button
        type="button"
        onClick={onBack}
        className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none md:hidden"
        aria-label="Back to chats"
      >
        <BackIcon />
      </button>
      {/* The picture and the name both open their profile. The picture is
          skipped by Tab (tabIndex -1) so keyboard users have one stop. */}
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setProfileOpen(true)}
        className="shrink-0 rounded-full"
        aria-hidden="true"
      >
        <Avatar user={friend} online={presence?.online ?? false} />
      </button>
      <div className="min-w-0 flex-1">
        <h2 className="truncate font-semibold text-slate-900">
          <button
            type="button"
            onClick={() => setProfileOpen(true)}
            className="max-w-full truncate rounded text-left hover:underline focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none"
            title="View profile"
          >
            {friend.displayName}
          </button>
        </h2>
        <p className={`truncate text-xs ${presence?.online ? 'text-emerald-600' : 'text-slate-500'}`}>
          {status}
        </p>
      </div>
      <button
        type="button"
        onClick={onUnfriend}
        className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-red-600 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none"
        aria-label={`Remove ${friend.displayName} from friends`}
        title="Remove friend"
      >
        <UserMinusIcon />
      </button>
      <UserProfileDialog
        user={friend}
        status={status}
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
      />
    </header>
  )
}
