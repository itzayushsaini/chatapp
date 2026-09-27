import { useEffect } from 'react'

import { unfriend } from '../../api/friends.js'
import { errorMessage } from '../../api/http.js'
import { useAuth } from '../../context/AuthContext.jsx'
import { useSocket } from '../../context/SocketContext.jsx'
import { useChatStore } from '../../store/useChatStore.js'
import { lastSeenLabel } from '../../utils/time.js'
import Avatar from '../common/Avatar.jsx'
import Button from '../common/Button.jsx'
import { AlertIcon, BackIcon, UserMinusIcon } from '../common/Icons.jsx'
import Spinner from '../common/Spinner.jsx'
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
    socket
      .timeout(ACK_TIMEOUT_MS)
      .emit(
        'message:send',
        { conversationId, text: message.text, clientId: message.clientId },
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

  // Optimistic sending: show the bubble immediately, then send. The clientId
  // is made here, in the browser, so a Retry can reuse it and the server
  // recognises the retry instead of saving the message twice.
  function send(text) {
    const message = {
      clientId: crypto.randomUUID(),
      conversationId,
      senderId: user.id,
      text,
      createdAt: new Date().toISOString(),
      status: 'sending',
    }
    store().addPendingMessage(message)
    emit(message)
  }

  function retry(message) {
    store().setMessageStatus(conversationId, message.clientId, 'sending')
    emit(message)
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
      <Avatar user={friend} online={presence?.online ?? false} />
      <div className="min-w-0 flex-1">
        <h2 className="truncate font-semibold text-slate-900">{friend.displayName}</h2>
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
    </header>
  )
}
