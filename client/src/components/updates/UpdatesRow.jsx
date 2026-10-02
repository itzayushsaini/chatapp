import { UPDATES_CHAT_ID, useChatStore } from '../../store/useChatStore.js'
import { previewTime } from '../../utils/time.js'
import { VerifiedIcon } from '../common/Icons.jsx'
import PingMeAvatar from './PingMeAvatar.jsx'

// The pinned "PingMe" row at the very top of the Chats list - always there,
// even before you have any friends, like WhatsApp's own official chat.
export default function UpdatesRow() {
  const latest = useChatStore((s) => s.updates.latest)
  const unread = useChatStore((s) => s.updates.unreadCount)
  const isActive = useChatStore((s) => s.activeConversationId === UPDATES_CHAT_ID)
  const open = useChatStore((s) => s.setActiveConversation)

  const preview = !latest
    ? 'Official updates from the PingMe team'
    : latest.imageUrl
    ? `📷 ${latest.text || 'Photo'}`
    : latest.text

  return (
    <button
      type="button"
      onClick={() => open(UPDATES_CHAT_ID)}
      aria-current={isActive ? 'true' : undefined}
      className={`relative flex w-full items-center gap-3 px-3 py-3 text-left transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500 focus-visible:outline-none ${
        isActive ? 'bg-slate-100' : 'hover:bg-slate-50'
      }`}
    >
      {isActive && (
        <span className="absolute inset-y-1 left-0 w-1 rounded-r-full bg-brand-600" aria-hidden="true" />
      )}
      <PingMeAvatar />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="flex min-w-0 items-center gap-1">
            <span className="truncate text-sm font-semibold text-slate-900">PingMe</span>
            <VerifiedIcon className="h-4 w-4 shrink-0 text-brand-600" />
            <span className="sr-only">(official account)</span>
          </span>
          {latest && <span className="shrink-0 text-xs text-slate-500">{previewTime(latest.createdAt)}</span>}
        </span>
        <span className="flex items-center justify-between gap-2">
          <span className={`truncate text-sm ${unread ? 'font-medium text-slate-900' : 'text-slate-500'}`}>
            {preview}
          </span>
          {unread > 0 && (
            <span
              className="animate-pop min-w-5 shrink-0 rounded-full bg-brand-600 px-1.5 text-center text-xs leading-5 font-semibold text-white"
              aria-label={`${unread} unread`}
            >
              {unread}
            </span>
          )}
        </span>
      </span>
    </button>
  )
}
