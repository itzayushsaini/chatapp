import { AI_CHAT_ID, useChatStore } from '../../store/useChatStore.js'
import { attachmentLabel } from '../../utils/files.js'
import { previewTime } from '../../utils/time.js'
import TypingDots from '../common/TypingDots.jsx'
import AiAvatar from './AiAvatar.jsx'

// A one-line preview of the latest message, without Markdown symbols.
function previewOf(message) {
  if (message.status === 'error') return message.error
  const text = message.text.replace(/[*_`#>|~]/g, '').replace(/\s+/g, ' ').trim()
  if (message.attachment) return attachmentLabel(message.attachment, text)
  return text || 'Ask me anything'
}

// The pinned "PingMe AI" row at the top of the Chats list - only shown
// while PingMe AI is available (the server has a key and an admin has not
// switched it off).
export default function AiRow() {
  const latest = useChatStore((s) => s.ai.latest)
  const isActive = useChatStore((s) => s.activeConversationId === AI_CHAT_ID)
  const open = useChatStore((s) => s.setActiveConversation)
  const answering = latest?.role === 'model' && latest.status === 'streaming'

  return (
    <button
      type="button"
      onClick={() => open(AI_CHAT_ID)}
      aria-current={isActive ? 'true' : undefined}
      className={`relative flex w-full items-center gap-3 px-3 py-3 text-left transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500 focus-visible:outline-none ${
        isActive ? 'bg-slate-100' : 'hover:bg-slate-50'
      }`}
    >
      {isActive && (
        <span className="absolute inset-y-1 left-0 w-1 rounded-r-full bg-brand-600" aria-hidden="true" />
      )}
      <AiAvatar />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="truncate text-sm font-semibold text-slate-900">PingMe AI</span>
          {latest && <span className="shrink-0 text-xs text-slate-500">{previewTime(latest.createdAt)}</span>}
        </span>
        <span className="block truncate text-sm text-slate-500">
          {answering ? (
            <span className="inline-flex items-center gap-1.5 font-medium text-brand-600">
              thinking <TypingDots />
            </span>
          ) : latest ? (
            previewOf(latest)
          ) : (
            'Ask me anything ✨'
          )}
        </span>
      </span>
    </button>
  )
}
