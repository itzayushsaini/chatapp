import { useEffect, useRef, useState } from 'react'

import { useSocket } from '../../context/SocketContext.jsx'
import { useChatStore } from '../../store/useChatStore.js'
import { formatBytes } from '../../utils/files.js'
import { formatTime } from '../../utils/time.js'
import Dialog from '../common/Dialog.jsx'
import {
  AlertIcon,
  CheckCheckIcon,
  CheckIcon,
  ClockIcon,
  CopyIcon,
  DownloadIcon,
  FileIcon,
  ForwardIcon,
  MoreVerticalIcon,
  ReplyIcon,
  TrashIcon,
} from '../common/Icons.jsx'
import ForwardDialog from './ForwardDialog.jsx'

const ACK_TIMEOUT_MS = 10_000
// Matches the server's own window (messageService.js) - purely to decide
// whether to SHOW the "Delete for everyone" option; the server is what
// actually enforces it.
const DELETE_FOR_EVERYONE_WINDOW_MS = 60 * 60 * 1000

// A short label for a quoted reply's preview, when the original had no text
// of its own (a photo, video or plain file).
function attachmentSnippetLabel(kind) {
  if (kind === 'image') return '📷 Photo'
  if (kind === 'video') return '🎥 Video'
  if (kind === 'file') return '📄 File'
  return 'Message'
}

// Message text is rendered as a plain React text node, which React always
// escapes - so a message containing <script> just shows those characters.
// There is no dangerouslySetInnerHTML anywhere in the app.
// `whitespace-pre-wrap` keeps the user's line breaks (Shift+Enter).
//
// `read` is only meaningful when `mine` is true: has the OTHER person read
// up to this message yet? Drives the single-grey vs double-blue tick.
export default function MessageBubble({
  message,
  mine,
  myId,
  read,
  friendName,
  onRetry,
  onOpenImage,
  onMediaLoad,
  onReply,
}) {
  const { status, attachment, text, replyTo, forwarded, deletedForEveryone } = message
  const socket = useSocket()
  const addToast = useChatStore((s) => s.addToast)
  const store = useChatStore.getState
  const [menuOpen, setMenuOpen] = useState(false)
  const [deleteChoiceOpen, setDeleteChoiceOpen] = useState(false)
  const [forwardOpen, setForwardOpen] = useState(false)

  if (deletedForEveryone) {
    return (
      <li className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
        <div className="max-w-[80%] rounded-lg bg-white/70 px-2.5 py-1.5 text-sm text-slate-500 italic shadow-sm sm:max-w-[65%]">
          This message was deleted
        </div>
      </li>
    )
  }

  function copyText() {
    setMenuOpen(false)
    navigator.clipboard
      .writeText(text)
      .then(() => addToast('Copied'))
      .catch(() => addToast('Could not copy', 'error'))
  }

  function deleteForMe() {
    setDeleteChoiceOpen(false)
    socket.timeout(ACK_TIMEOUT_MS).emit('message:delete', { conversationId: message.conversationId, messageId: message.id, mode: 'me' }, (err, ack) => {
      if (err || !ack?.ok) return addToast(ack?.error ?? 'Could not delete message', 'error')
      store().applyMessageDeleted(ack.conversationId, ack.messageId, ack.mode)
    })
  }

  function deleteForEveryone() {
    setDeleteChoiceOpen(false)
    socket
      .timeout(ACK_TIMEOUT_MS)
      .emit('message:delete', { conversationId: message.conversationId, messageId: message.id, mode: 'everyone' }, (err, ack) => {
        if (err || !ack?.ok) return addToast(ack?.error ?? 'Could not delete message', 'error')
        store().applyMessageDeleted(ack.conversationId, ack.messageId, ack.mode)
        if ('lastMessage' in ack) store().setLastMessage(ack.conversationId, ack.lastMessage)
      })
  }

  const canDeleteForEveryone =
    mine && Boolean(message.id) && Date.now() - new Date(message.createdAt).getTime() < DELETE_FOR_EVERYONE_WINDOW_MS

  return (
    <li className={`group flex ${mine ? 'justify-end' : 'justify-start'}`}>
      <div className={`flex max-w-[80%] items-start gap-1 sm:max-w-[65%] ${mine ? 'flex-row-reverse' : ''}`}>
        <div
          className={`overflow-hidden rounded-lg text-sm shadow-sm ${
            mine ? 'rounded-tr-none bg-brand-100 text-slate-900' : 'rounded-tl-none bg-white text-slate-900'
          } ${status === 'failed' ? 'opacity-70' : ''} ${attachment ? 'p-1' : 'px-2.5 py-1.5'}`}
        >
          {replyTo && (
            <div className="mx-1 mt-1 mb-1.5 rounded-md border-l-4 border-brand-500 bg-black/5 px-2 py-1 text-xs">
              <p className="font-medium text-brand-700">{replyTo.senderId === myId ? 'You' : friendName}</p>
              <p className="truncate text-slate-600">
                {replyTo.textSnippet || attachmentSnippetLabel(replyTo.attachmentKind)}
              </p>
            </div>
          )}
          {forwarded && (
            <p className="mx-1 mt-1 flex items-center gap-1 text-xs text-slate-500 italic">
              <ForwardIcon className="h-3.5 w-3.5" /> Forwarded
            </p>
          )}
          {attachment && (
            <Attachment
              attachment={attachment}
              mine={mine}
              onOpenImage={onOpenImage}
              onMediaLoad={onMediaLoad}
            />
          )}
          {status === 'uploading' && <UploadProgress progress={message.progress ?? 0} />}
          {text && (
            <p className={`break-words whitespace-pre-wrap ${attachment ? 'px-2 pt-1.5' : ''}`}>{text}</p>
          )}

          {/* Time and tick sit INSIDE the bubble, bottom-right - the same
              place WhatsApp puts them, rather than as a caption below it. */}
          <div className={`flex items-center justify-end gap-1 text-[11px] text-black/45 ${attachment && !text ? 'px-2 pb-1' : ''}`}>
            <span>{formatTime(message.createdAt)}</span>
            {mine && <MessageStatus status={status} read={read} onRetry={() => onRetry(message)} />}
          </div>
        </div>

        {/* Hidden by default on desktop (appears on hover), always tappable
            on touch, so it never blocks reading the message text. */}
        {message.id && (
          <div className="relative shrink-0 self-center">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="rounded-full p-1 text-slate-400 opacity-0 hover:bg-slate-200/70 hover:text-slate-700 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none group-hover:opacity-100"
              aria-label="Message actions"
              aria-haspopup="menu"
            >
              <MoreVerticalIcon className="h-4 w-4" />
            </button>
            {menuOpen && (
              <ActionsMenu
                onClose={() => setMenuOpen(false)}
                align={mine ? 'right' : 'left'}
                items={[
                  { label: 'Reply', icon: ReplyIcon, onClick: () => onReply(message) },
                  ...(text ? [{ label: 'Copy', icon: CopyIcon, onClick: copyText }] : []),
                  { label: 'Forward', icon: ForwardIcon, onClick: () => setForwardOpen(true) },
                  { label: 'Delete', icon: TrashIcon, danger: true, onClick: () => setDeleteChoiceOpen(true) },
                ]}
              />
            )}
          </div>
        )}
      </div>

      <Dialog open={deleteChoiceOpen} onClose={() => setDeleteChoiceOpen(false)} title="Delete message?">
        <div className="flex flex-col gap-2">
          {canDeleteForEveryone && (
            <button
              type="button"
              onClick={deleteForEveryone}
              className="rounded-lg px-3 py-2 text-left text-sm font-medium text-red-600 hover:bg-red-50"
            >
              Delete for everyone
            </button>
          )}
          <button
            type="button"
            onClick={deleteForMe}
            className="rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-900 hover:bg-slate-100"
          >
            Delete for me
          </button>
        </div>
      </Dialog>

      <Dialog open={forwardOpen} onClose={() => setForwardOpen(false)} title="Forward message">
        {forwardOpen && <ForwardDialog message={message} onClose={() => setForwardOpen(false)} />}
      </Dialog>
    </li>
  )
}

// A tiny dropdown, closed by clicking anywhere else or picking an item.
function ActionsMenu({ items, onClose, align }) {
  const ref = useRef(null)

  useEffect(() => {
    function onOutside(event) {
      if (!ref.current?.contains(event.target)) onClose()
    }
    document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [onClose])

  return (
    <div
      ref={ref}
      role="menu"
      className={`absolute top-full z-10 mt-1 w-40 rounded-lg bg-white py-1 shadow-lg ring-1 ring-black/5 ${
        align === 'right' ? 'right-0' : 'left-0'
      }`}
    >
      {items.map((item) => {
        const ItemIcon = item.icon
        return (
          <button
            key={item.label}
            type="button"
            role="menuitem"
            onClick={() => {
              onClose()
              item.onClick()
            }}
            className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-slate-100 ${
              item.danger ? 'text-red-600' : 'text-slate-700'
            }`}
          >
            <ItemIcon className="h-4 w-4" />
            {item.label}
          </button>
        )
      })}
    </div>
  )
}

// The little status icon after my own message's timestamp: a clock while it
// is on its way, a tick once saved (single grey, or double blue once they
// have read it), or a Retry link if it failed.
function MessageStatus({ status, read, onRetry }) {
  if (status === 'sending' || status === 'uploading') {
    return (
      <span className="inline-flex items-center">
        <ClockIcon className="h-3.5 w-3.5" />
        <span className="sr-only">{status === 'uploading' ? 'Uploading' : 'Sending'}</span>
      </span>
    )
  }

  if (status === 'failed') {
    return (
      <span className="inline-flex items-center gap-1 text-red-600">
        <AlertIcon className="h-3.5 w-3.5" />
        <button
          type="button"
          onClick={onRetry}
          className="rounded font-semibold underline focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none"
        >
          Retry
        </button>
      </span>
    )
  }

  // Saved: one grey tick, or two blue ticks once they have read it.
  return read ? (
    <span className="inline-flex items-center text-tick-read">
      <CheckCheckIcon className="h-4 w-4" />
      <span className="sr-only">Read</span>
    </span>
  ) : (
    <span className="inline-flex items-center text-tick-sent">
      <CheckIcon className="h-3.5 w-3.5" />
      <span className="sr-only">Sent</span>
    </span>
  )
}

// Photos and videos are shown inside the chat; documents are a card with a
// download link. The url is our own /api/attachments/:id route (which checks
// permissions), or - while still uploading - a temporary blob: URL of the
// file on this computer.
function Attachment({ attachment, mine, onOpenImage, onMediaLoad }) {
  const { kind, url, name, size } = attachment

  if (kind === 'image') {
    return (
      <button
        type="button"
        onClick={() => onOpenImage(attachment)}
        className="block rounded-md focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none"
        aria-label={`Open photo ${name}`}
      >
        <img
          src={url}
          alt={name}
          onLoad={onMediaLoad}
          className="max-h-72 w-auto max-w-full rounded-md bg-slate-200 object-cover"
        />
      </button>
    )
  }

  if (kind === 'video') {
    return (
      <video
        src={url}
        controls
        preload="metadata"
        onLoadedMetadata={onMediaLoad}
        className="max-h-72 max-w-full rounded-md bg-black"
      >
        <track kind="captions" />
      </video>
    )
  }

  return (
    <a
      href={url}
      download={name}
      className={`flex min-w-56 items-center gap-3 rounded-md p-2.5 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none ${
        mine ? 'bg-black/5 hover:bg-black/10' : 'bg-slate-100 hover:bg-slate-200'
      }`}
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-brand-700">
        <FileIcon />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{name}</span>
        <span className="block text-xs text-slate-500">{formatBytes(size)}</span>
      </span>
      <DownloadIcon className="h-5 w-5 shrink-0 text-slate-600" />
      <span className="sr-only">Download</span>
    </a>
  )
}

function UploadProgress({ progress }) {
  const percent = Math.round(progress * 100)
  return (
    <div className="px-2 pt-2 pb-1">
      <div
        className="h-1.5 overflow-hidden rounded-full bg-black/10"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Upload progress"
      >
        <div className="h-full bg-brand-600" style={{ width: `${percent}%` }} />
      </div>
      <p className="mt-1 text-[11px] text-black/45">Uploading {percent}%</p>
    </div>
  )
}
