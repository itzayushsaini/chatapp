import { useState } from 'react'

import { useAuth } from '../../context/AuthContext.jsx'
import { useChatStore } from '../../store/useChatStore.js'
import { attachmentLabel } from '../../utils/files.js'
import { previewTime } from '../../utils/time.js'
import Avatar from '../common/Avatar.jsx'
import Button from '../common/Button.jsx'
import { AlertIcon, BellOffIcon, CheckIcon, CopyIcon, UserPlusIcon } from '../common/Icons.jsx'
import Spinner from '../common/Spinner.jsx'
import TypingDots from '../common/TypingDots.jsx'

export default function ChatsTab() {
  const friends = useChatStore((s) => s.friends)
  const status = useChatStore((s) => s.friendsStatus)
  const fetchFriends = useChatStore((s) => s.fetchFriends)

  if (status === 'loading') {
    return (
      <div className="flex justify-center py-10">
        <Spinner />
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
        <AlertIcon className="h-8 w-8 text-red-500" />
        <p className="text-sm text-slate-600">Could not load your chats.</p>
        <Button size="sm" onClick={fetchFriends}>
          Try again
        </Button>
      </div>
    )
  }

  if (friends.length === 0) return <NoFriends />

  return (
    <ul className="divide-y divide-slate-100">
      {friends.map((item) => (
        <li key={item.friend.id}>
          <FriendRow item={item} />
        </li>
      ))}
    </ul>
  )
}

function FriendRow({ item }) {
  const { user } = useAuth()
  const { friend, conversationId, lastMessage } = item
  const online = useChatStore((s) => s.presence[friend.id]?.online ?? false)
  const unread = useChatStore((s) => s.unreadCounts[conversationId] ?? 0)
  const isActive = useChatStore((s) => s.activeConversationId === conversationId)
  const typing = useChatStore((s) => Boolean(s.typing[conversationId]))
  const open = useChatStore((s) => s.setActiveConversation)

  const preview = typing
    ? 'typing…'
    : lastMessage
    ? `${lastMessage.senderId === user.id ? 'You: ' : ''}${
        lastMessage.attachment
          ? attachmentLabel(lastMessage.attachment, lastMessage.text)
          : lastMessage.text
      }`
    : 'Say hello!'

  return (
    <button
      type="button"
      onClick={() => open(conversationId)}
      aria-current={isActive ? 'true' : undefined}
      className={`flex w-full items-center gap-3 px-3 py-3 text-left transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500 focus-visible:outline-none ${
        isActive ? 'bg-slate-100' : 'hover:bg-slate-50'
      }`}
    >
      <Avatar user={friend} online={online} />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="truncate text-sm font-semibold text-slate-900">{friend.displayName}</span>
          {lastMessage && (
            <span className="shrink-0 text-xs text-slate-500">{previewTime(lastMessage.createdAt)}</span>
          )}
        </span>
        <span className="flex items-center justify-between gap-2">
          <span
            className={`flex min-w-0 items-center gap-1 truncate text-sm ${
              typing ? 'font-medium text-emerald-600' : unread ? 'font-medium text-slate-900' : 'text-slate-500'
            }`}
          >
            <span className="truncate">{preview}</span>
            {typing && <TypingDots />}
          </span>
          <span className="flex shrink-0 items-center gap-1.5">
            {item.muted && (
              <span title="Notifications muted">
                <BellOffIcon className="h-4 w-4 text-slate-400" />
                <span className="sr-only">Muted</span>
              </span>
            )}
            {/* A muted chat still counts unread messages, in grey - like
                WhatsApp - so it is visible without demanding attention. */}
            {unread > 0 && (
              <span
                className={`animate-pop min-w-5 rounded-full px-1.5 text-center text-xs leading-5 font-semibold text-white ${
                  item.muted ? 'bg-slate-400' : 'bg-brand-600'
                }`}
                aria-label={`${unread} unread`}
              >
                {unread}
              </span>
            )}
          </span>
        </span>
        <span className="sr-only">{online ? 'Online' : 'Offline'}</span>
      </span>
    </button>
  )
}

// The empty state: nobody can find you unless you share your username, so
// show it with a copy button.
function NoFriends() {
  const { user } = useAuth()
  const setTab = useChatStore((s) => s.setSidebarTab)
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(user.username)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard can be blocked by the browser; the username is on screen anyway.
    }
  }

  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      <p className="font-semibold text-slate-900">No friends yet</p>
      <p className="mt-1 text-sm text-slate-500">Share your username so friends can find you:</p>
      <div className="mt-3 flex items-center gap-2 rounded-lg bg-slate-100 py-1.5 pr-1.5 pl-3">
        <span className="font-mono text-sm text-slate-800">@{user.username}</span>
        <button
          type="button"
          onClick={copy}
          className="rounded-md p-1.5 text-slate-500 hover:bg-surface hover:text-slate-800 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none"
          aria-label={copied ? 'Copied' : 'Copy username'}
        >
          {copied ? <CheckIcon className="h-4 w-4 text-emerald-600" /> : <CopyIcon className="h-4 w-4" />}
        </button>
      </div>
      <Button className="mt-5" onClick={() => setTab('add')}>
        <UserPlusIcon className="h-4 w-4" />
        Add a friend
      </Button>
    </div>
  )
}
