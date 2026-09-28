import { useEffect, useState } from 'react'

import { clearChat, getSharedAttachments, setMuted } from '../../api/conversations.js'
import { unfriend } from '../../api/friends.js'
import { errorMessage } from '../../api/http.js'
import { useFriendStatus } from '../../hooks/useFriendStatus.js'
import { blockUser } from '../../api/profile.js'
import { useChatStore } from '../../store/useChatStore.js'
import { formatBytes } from '../../utils/files.js'
import { previewTime } from '../../utils/time.js'
import Avatar from '../common/Avatar.jsx'
import ConfirmDialog from '../common/ConfirmDialog.jsx'
import Dialog from '../common/Dialog.jsx'
import { BanIcon, DownloadIcon, FileIcon, TrashIcon, UserMinusIcon, VideoIcon } from '../common/Icons.jsx'
import Spinner from '../common/Spinner.jsx'
import Switch from '../common/Switch.jsx'
import VoicePlayer from './VoicePlayer.jsx'

// How many photos/videos the grid shows before "Show all".
const MEDIA_PREVIEW = 6

// "Contact info" - opened from the chat header, like WhatsApp's panel on the
// right: their profile, the photos/videos and documents sent in this chat,
// and the actions that only affect MY side of it (mute, clear chat, block,
// remove friend).
export default function ContactInfoPanel({ item, onClose }) {
  const { friend, conversationId, muted = false } = item
  const status = useFriendStatus(friend.id, conversationId).text
  const store = useChatStore.getState
  // Re-list the shared files whenever a message arrives or is deleted here.
  const latestId = useChatStore((s) => s.messagesByConversation[conversationId]?.messages.at(-1)?.id)
  const messageCount = useChatStore((s) => s.messagesByConversation[conversationId]?.messages.length)

  const [shared, setShared] = useState(null) // null while loading
  const [showAllMedia, setShowAllMedia] = useState(false)
  const [viewing, setViewing] = useState(null) // the photo/video open full size
  const [confirm, setConfirm] = useState(null) // 'clear' | 'block' | 'unfriend'
  const [savingMute, setSavingMute] = useState(false)

  useEffect(() => {
    let cancelled = false
    getSharedAttachments(conversationId)
      .then((items) => !cancelled && setShared(items))
      .catch(() => !cancelled && setShared([]))
    return () => {
      cancelled = true
    }
  }, [conversationId, latestId, messageCount])

  const byKind = (...kinds) => (shared ?? []).filter((s) => kinds.includes(s.attachment.kind))
  const media = byKind('image', 'video')
  const voiceNotes = byKind('audio')
  const docs = byKind('file')

  async function toggleMute(next) {
    setSavingMute(true)
    try {
      store().setMuted(conversationId, await setMuted(conversationId, next))
    } catch (err) {
      store().addToast(errorMessage(err), 'error')
    } finally {
      setSavingMute(false)
    }
  }

  // Each returns normally on success so ConfirmDialog closes; errors become
  // a toast and the dialog closes too (nothing to retry inside it).
  async function run(action) {
    try {
      await action()
    } catch (err) {
      store().addToast(errorMessage(err), 'error')
    }
  }

  const doClear = () =>
    run(async () => {
      await clearChat(conversationId)
      store().clearConversation(conversationId)
      store().addToast('Chat cleared')
    })

  const doBlock = () =>
    run(async () => {
      await blockUser(friend.id)
      store().removeFriend(friend.id)
      store().addToast(`${friend.displayName} is blocked`)
    })

  const doUnfriend = () =>
    run(async () => {
      await unfriend(friend.id)
      store().removeFriend(friend.id)
    })

  return (
    <aside
      aria-label="Contact info"
      className="animate-fade-in absolute inset-0 z-20 flex min-h-0 flex-col bg-slate-50 md:left-auto md:w-96 md:border-l md:border-slate-200 md:shadow-xl lg:w-80 lg:static lg:shadow-none xl:w-96"
    >
      <div className="flex items-center gap-3 bg-surface px-4 py-3.5">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg px-2 py-1 text-xl leading-none text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none"
          aria-label="Close contact info"
        >
          ×
        </button>
        <h2 className="font-semibold text-slate-900">Contact info</h2>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain pb-4">
        {/* Who they are - PublicUser fields only, the same as anywhere else. */}
        <section className="flex flex-col items-center bg-surface px-6 pt-6 pb-5 text-center">
          <Avatar user={friend} size="xl" />
          <p className="mt-3 text-lg font-semibold text-slate-900">{friend.displayName}</p>
          <p className="text-sm text-slate-500">@{friend.username}</p>
          {status && <p className="mt-1 text-xs text-slate-500">{status}</p>}
        </section>

        <section className="bg-surface px-5 py-4">
          <h3 className="text-xs font-medium tracking-wide text-slate-500 uppercase">About</h3>
          <p
            className={`mt-1.5 text-sm break-words whitespace-pre-wrap ${
              friend.bio ? 'text-slate-800' : 'text-slate-400 italic'
            }`}
          >
            {friend.bio || 'No bio yet'}
          </p>
        </section>

        <section className="bg-surface px-5 py-4" aria-label="Media">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-medium tracking-wide text-slate-500 uppercase">
              Photos and videos {shared && `(${media.length})`}
            </h3>
            {media.length > MEDIA_PREVIEW && (
              <button
                type="button"
                onClick={() => setShowAllMedia((v) => !v)}
                className="rounded text-xs font-medium text-brand-700 hover:underline focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none"
              >
                {showAllMedia ? 'Show less' : 'Show all'}
              </button>
            )}
          </div>
          {shared === null ? (
            <div className="flex justify-center py-4">
              <Spinner />
            </div>
          ) : media.length === 0 ? (
            <p className="mt-1.5 text-sm text-slate-400">No photos or videos yet</p>
          ) : (
            <ul className="mt-2 grid grid-cols-3 gap-1.5">
              {(showAllMedia ? media : media.slice(0, MEDIA_PREVIEW)).map(({ attachment }) => (
                <li key={attachment.id}>
                  <MediaThumb attachment={attachment} onOpen={() => setViewing(attachment)} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="bg-surface px-5 py-4" aria-label="Voice messages">
          <h3 className="text-xs font-medium tracking-wide text-slate-500 uppercase">
            Voice messages {shared && `(${voiceNotes.length})`}
          </h3>
          {shared !== null && voiceNotes.length === 0 && (
            <p className="mt-1.5 text-sm text-slate-400">No voice messages yet</p>
          )}
          <ul className="mt-1 divide-y divide-slate-100">
            {voiceNotes.map(({ attachment, senderId, createdAt }) => (
              <li key={attachment.id} className="py-2">
                <p className="mb-1 text-xs text-slate-500">
                  {senderId === friend.id ? friend.displayName : 'You'} · {previewTime(createdAt)}
                </p>
                <VoicePlayer attachment={attachment} mine={senderId !== friend.id} compact />
              </li>
            ))}
          </ul>
        </section>

        <section className="bg-surface px-5 py-4" aria-label="Documents">
          <h3 className="text-xs font-medium tracking-wide text-slate-500 uppercase">
            Documents {shared && `(${docs.length})`}
          </h3>
          {shared !== null && docs.length === 0 && (
            <p className="mt-1.5 text-sm text-slate-400">No documents yet</p>
          )}
          <ul className="mt-1 divide-y divide-slate-100">
            {docs.map(({ attachment }) => (
              <li key={attachment.id}>
                <a
                  href={attachment.url}
                  download={attachment.name}
                  className="flex items-center gap-3 rounded-lg py-2 hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-brand-700">
                    <FileIcon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-slate-900">{attachment.name}</span>
                    <span className="block text-xs text-slate-500">{formatBytes(attachment.size)}</span>
                  </span>
                  <DownloadIcon className="h-4 w-4 shrink-0 text-slate-500" />
                  <span className="sr-only">Download</span>
                </a>
              </li>
            ))}
          </ul>
        </section>

        <section className="bg-surface px-4 py-2">
          <Switch
            checked={muted}
            onChange={toggleMute}
            disabled={savingMute}
            label="Mute notifications"
            description="Messages still arrive, without a pop-up notification."
          />
        </section>

        <section className="bg-surface py-2">
          <DangerRow icon={<TrashIcon className="h-5 w-5" />} onClick={() => setConfirm('clear')}>
            Clear chat
          </DangerRow>
          <DangerRow icon={<UserMinusIcon className="h-5 w-5" />} onClick={() => setConfirm('unfriend')}>
            Remove friend
          </DangerRow>
          <DangerRow icon={<BanIcon className="h-5 w-5" />} onClick={() => setConfirm('block')}>
            Block {friend.displayName}
          </DangerRow>
        </section>
      </div>

      <MediaViewer attachment={viewing} onClose={() => setViewing(null)} />

      <ConfirmDialog
        open={confirm === 'clear'}
        onClose={() => setConfirm(null)}
        title="Clear this chat?"
        confirmLabel="Clear chat"
        danger
        onConfirm={doClear}
      >
        <p>
          All messages in this chat will be removed <strong>for you</strong>. {friend.displayName} will
          still see them.
        </p>
      </ConfirmDialog>
      <ConfirmDialog
        open={confirm === 'unfriend'}
        onClose={() => setConfirm(null)}
        title={`Remove ${friend.displayName}?`}
        confirmLabel="Remove friend"
        danger
        onConfirm={doUnfriend}
      >
        <p>You won&apos;t be able to message each other until one of you sends a new friend request.</p>
      </ConfirmDialog>
      <ConfirmDialog
        open={confirm === 'block'}
        onClose={() => setConfirm(null)}
        title={`Block ${friend.displayName}?`}
        confirmLabel="Block"
        danger
        onConfirm={doBlock}
      >
        <p>
          They will be removed from your friends, and neither of you will be able to find the other by
          username or send a friend request. They are not told. You can unblock them in Settings.
        </p>
      </ConfirmDialog>
    </aside>
  )
}

function DangerRow({ icon, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 px-5 py-2.5 text-left text-sm font-medium text-red-600 hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none focus-visible:ring-inset"
    >
      {icon}
      {children}
    </button>
  )
}

function MediaThumb({ attachment, onOpen }) {
  const label = `Open ${attachment.kind === 'video' ? 'video' : 'photo'} ${attachment.name}`
  return (
    <button
      type="button"
      onClick={onOpen}
      className="relative block aspect-square w-full overflow-hidden rounded-md bg-slate-200 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none"
      aria-label={label}
      title={attachment.name}
    >
      {attachment.kind === 'video' ? (
        <>
          <video src={attachment.url} preload="metadata" muted className="h-full w-full object-cover" />
          <span className="absolute inset-0 flex items-center justify-center bg-black/25 text-white">
            <VideoIcon />
          </span>
        </>
      ) : (
        <img src={attachment.url} alt="" loading="lazy" className="h-full w-full object-cover" />
      )}
    </button>
  )
}

// A photo or video from the grid, full size.
function MediaViewer({ attachment, onClose }) {
  return (
    <Dialog open={Boolean(attachment)} onClose={onClose} title={attachment?.name ?? ''} wide>
      {attachment?.kind === 'video' ? (
        <video src={attachment.url} controls autoPlay className="max-h-[70vh] w-full rounded-lg bg-black">
          <track kind="captions" />
        </video>
      ) : (
        attachment && (
          <img src={attachment.url} alt={attachment.name} className="mx-auto max-h-[70vh] rounded-lg" />
        )
      )}
    </Dialog>
  )
}
