import { useState } from 'react'

import { useAuth } from '../../context/AuthContext.jsx'
import { useSocket } from '../../context/SocketContext.jsx'
import { useChatStore } from '../../store/useChatStore.js'
import { attachmentLabel } from '../../utils/files.js'
import Avatar from '../common/Avatar.jsx'
import Button from '../common/Button.jsx'

const ACK_TIMEOUT_MS = 10_000

// Lets the user pick any number of friends to copy `message` into, in one
// go - the same multi-select WhatsApp offers when forwarding.
export default function ForwardDialog({ message, onClose }) {
  const socket = useSocket()
  const { user } = useAuth()
  const friends = useChatStore((s) => s.friends)
  const store = useChatStore.getState
  const [selected, setSelected] = useState(() => new Set())
  const [sending, setSending] = useState(false)

  function toggle(conversationId) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(conversationId)) next.delete(conversationId)
      else next.add(conversationId)
      return next
    })
  }

  function submit() {
    if (selected.size === 0 || sending) return
    setSending(true)
    socket.timeout(ACK_TIMEOUT_MS).emit(
      'message:forward',
      { messageId: message.id, toConversationIds: [...selected] },
      (err, ack) => {
        setSending(false)
        if (err || !ack?.ok) {
          store().addToast(ack?.error ?? 'Could not forward message', 'error')
          return
        }
        const failed = ack.results.filter((r) => !r.ok)
        for (const result of ack.results) {
          if (result.ok) store().receiveMessage(result.message, user.id)
        }
        if (failed.length === 0) {
          store().addToast(ack.results.length === 1 ? 'Message forwarded' : `Forwarded to ${ack.results.length} chats`)
        } else if (failed.length < ack.results.length) {
          store().addToast('Forwarded, but not to everyone you picked', 'error')
        } else {
          store().addToast(failed[0].error ?? 'Could not forward message', 'error')
        }
        onClose()
      },
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg bg-slate-50 p-2.5 text-sm text-slate-600">
        <p className="line-clamp-2 wrap-anywhere">{message.text || (message.attachment ? attachmentLabel(message.attachment) : '')}</p>
      </div>

      {friends.length === 0 ? (
        <p className="text-sm text-slate-500">You have no friends to forward this to yet.</p>
      ) : (
        <ul className="max-h-72 space-y-1 overflow-y-auto overscroll-contain">
          {friends.map(({ friend, conversationId }) => (
            <li key={conversationId}>
              <label className="flex cursor-pointer items-center gap-3 rounded-lg p-2 hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={selected.has(conversationId)}
                  onChange={() => toggle(conversationId)}
                  className="h-4 w-4 rounded border-slate-300 text-brand-600 focus-visible:ring-2 focus-visible:ring-brand-500"
                />
                <Avatar user={friend} size="sm" />
                <span className="truncate text-sm font-medium text-slate-900">{friend.displayName}</span>
              </label>
            </li>
          ))}
        </ul>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={selected.size === 0 || sending}>
          {sending ? 'Forwarding...' : `Forward${selected.size > 0 ? ` (${selected.size})` : ''}`}
        </Button>
      </div>
    </div>
  )
}
