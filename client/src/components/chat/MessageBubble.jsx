import { formatBytes } from '../../utils/files.js'
import { formatTime } from '../../utils/time.js'
import {
  AlertIcon,
  CheckCheckIcon,
  CheckIcon,
  ClockIcon,
  DownloadIcon,
  FileIcon,
} from '../common/Icons.jsx'

// Message text is rendered as a plain React text node, which React always
// escapes - so a message containing <script> just shows those characters.
// There is no dangerouslySetInnerHTML anywhere in the app.
// `whitespace-pre-wrap` keeps the user's line breaks (Shift+Enter).
//
// `read` is only meaningful when `mine` is true: has the OTHER person read
// up to this message yet? Drives the single-grey vs double-blue tick.
export default function MessageBubble({ message, mine, read, onRetry, onOpenImage, onMediaLoad }) {
  const { status, attachment, text } = message

  return (
    <li className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
      <div className="max-w-[80%] sm:max-w-[65%]">
        <div
          className={`overflow-hidden rounded-lg text-sm shadow-sm ${
            mine ? 'rounded-tr-none bg-brand-100 text-slate-900' : 'rounded-tl-none bg-white text-slate-900'
          } ${status === 'failed' ? 'opacity-70' : ''} ${attachment ? 'p-1' : 'px-2.5 py-1.5'}`}
        >
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
      </div>
    </li>
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
