import { useState } from 'react'

import { forwardToAi } from '../../api/ai.js'
import { errorMessage } from '../../api/http.js'
import { useAuth } from '../../context/AuthContext.jsx'
import { useSocket } from '../../context/SocketContext.jsx'
import { useChatStore } from '../../store/useChatStore.js'
import { attachmentLabel } from '../../utils/files.js'
import AiAvatar from '../ai/AiAvatar.jsx'
import Avatar from '../common/Avatar.jsx'
import Button from '../common/Button.jsx'

const ACK_TIMEOUT_MS = 10_000

const CHECKBOX =
  'h-4 w-4 rounded border-slate-300 text-brand-600 focus-visible:ring-2 focus-visible:ring-brand-500'

// Lets the user pick any number of friends to copy `message` into, in one
// go - the same multi-select WhatsApp offers when forwarding. PingMe AI is
// offered first (while it is available): forwarding a message there asks
// PingMe AI about it.
export default function ForwardDialog({ message, onClose }) {
  const socket = useSocket()
  const { user } = useAuth()
  const friends = useChatStore((s) => s.friends)
  const aiAvailable = useChatStore((s) => s.ai.available)
  const store = useChatStore.getState
  const [selected, setSelected] = useState(() => new Set())
  const [toAi, setToAi] = useState(false)
  const [sending, setSending] = useState(false)
  const count = selected.size + (toAi ? 1 : 0)

  function toggle(conversationId) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(conversationId)) next.delete(conversationId)
      else next.add(conversationId)
      return next
    })
  }

  // To friends: one socket event for all of them. Resolves to one result per
  // chat ({ ok, error? }) - never rejects.
  function forwardToFriends() {
    if (selected.size === 0) return Promise.resolve([])
    return new Promise((resolve) => {
      socket
        .timeout(ACK_TIMEOUT_MS)
        .emit('message:forward', { messageId: message.id, toConversationIds: [...selected] }, (err, ack) => {
          if (err || !ack?.ok) return resolve([{ ok: false, error: ack?.error ?? 'Could not forward message' }])
          for (const result of ack.results) {
            if (result.ok) store().receiveMessage(result.message, user.id)
          }
          resolve(ack.results)
        })
    })
  }

  // To PingMe AI: a REST call, like asking it a question. The answer then
  // streams into the PingMe AI chat over the socket.
  function forwardToPingMeAi() {
    if (!toAi) return Promise.resolve([])
    return forwardToAi(message.id, crypto.randomUUID())
      .then(({ question, answer }) => {
        store().addAiMessages([question, answer].filter(Boolean))
        return [{ ok: true }]
      })
      .catch((err) => [{ ok: false, error: errorMessage(err) }])
  }

  async function submit() {
    if (count === 0 || sending) return
    setSending(true)
    const results = (await Promise.all([forwardToPingMeAi(), forwardToFriends()])).flat()
    setSending(false)

    const failed = results.filter((r) => !r.ok)
    if (failed.length === 0) {
      store().addToast(results.length === 1 ? 'Message forwarded' : `Forwarded to ${results.length} chats`)
    } else if (failed.length < results.length) {
      store().addToast('Forwarded, but not to everyone you picked', 'error')
    } else {
      store().addToast(failed[0].error ?? 'Could not forward message', 'error')
    }
    onClose()
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg bg-slate-50 p-2.5 text-sm text-slate-600">
        <p className="line-clamp-2 wrap-anywhere">{message.text || (message.attachment ? attachmentLabel(message.attachment) : '')}</p>
      </div>

      {friends.length === 0 && !aiAvailable ? (
        <p className="text-sm text-slate-500">You have no friends to forward this to yet.</p>
      ) : (
        <ul className="max-h-72 space-y-1 overflow-y-auto overscroll-contain">
          {aiAvailable && (
            <li>
              <label className="flex cursor-pointer items-center gap-3 rounded-lg p-2 hover:bg-slate-50">
                <input type="checkbox" checked={toAi} onChange={() => setToAi((v) => !v)} className={CHECKBOX} />
                <AiAvatar size="sm" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-slate-900">PingMe AI</span>
                  <span className="block truncate text-xs text-slate-500">Ask PingMe AI about this message</span>
                </span>
              </label>
            </li>
          )}
          {friends.map(({ friend, conversationId }) => (
            <li key={conversationId}>
              <label className="flex cursor-pointer items-center gap-3 rounded-lg p-2 hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={selected.has(conversationId)}
                  onChange={() => toggle(conversationId)}
                  className={CHECKBOX}
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
        <Button onClick={submit} disabled={count === 0 || sending}>
          {sending ? 'Forwarding...' : `Forward${count > 0 ? ` (${count})` : ''}`}
        </Button>
      </div>
    </div>
  )
}
