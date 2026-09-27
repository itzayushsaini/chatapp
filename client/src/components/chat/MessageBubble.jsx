import { formatBytes } from '../../utils/files.js'
import { formatTime } from '../../utils/time.js'
import { AlertIcon, CheckIcon, ClockIcon, DownloadIcon, FileIcon } from '../common/Icons.jsx'

// Message text is rendered as a plain React text node, which React always
// escapes - so a message containing <script> just shows those characters.
// There is no dangerouslySetInnerHTML anywhere in the app.
// `whitespace-pre-wrap` keeps the user's line breaks (Shift+Enter).
export default function MessageBubble({ message, mine, onRetry, onOpenImage, onMediaLoad }) {
  const { status, attachment, text } = message

  return (
    <li className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
      <div className="max-w-[80%] sm:max-w-[70%]">
        <div
          className={`overflow-hidden rounded-2xl text-sm ${
            mine
              ? 'rounded-br-md bg-blue-600 text-white'
              : 'rounded-bl-md bg-white text-slate-900 shadow-sm'
          } ${status === 'failed' ? 'opacity-70' : ''} ${attachment ? 'p-1' : 'px-3.5 py-2'}`}
        >
          {attachment && (
            <Attachment
              attachment={attachment}
              mine={mine}
              onOpenImage={onOpenImage}
              onMediaLoad={onMediaLoad}
            />
          )}
          {status === 'uploading' && <UploadProgress progress={message.progress ?? 0} mine={mine} />}
          {text && (
            <p className={`break-words whitespace-pre-wrap ${attachment ? 'px-2.5 pt-1.5 pb-1' : ''}`}>
              {text}
            </p>
          )}
        </div>

        <div
          className={`mt-0.5 flex items-center gap-1 text-[11px] text-slate-500 ${
            mine ? 'justify-end' : 'justify-start'
          }`}
        >
          <span>{formatTime(message.createdAt)}</span>
          {mine && (status === 'sending' || status === 'uploading') && (
            <span className="inline-flex items-center gap-0.5">
              <ClockIcon className="h-3 w-3" />
              <span className="sr-only">{status === 'uploading' ? 'Uploading' : 'Sending'}</span>
            </span>
          )}
          {mine && !status && (
            <span className="inline-flex items-center">
              <CheckIcon className="h-3 w-3" />
              <span className="sr-only">Sent</span>
            </span>
          )}
          {mine && status === 'failed' && (
            <span className="inline-flex items-center gap-1 text-red-600">
              <AlertIcon className="h-3 w-3" />
              Not sent ·
              <button
                type="button"
                onClick={() => onRetry(message)}
                className="rounded font-semibold underline focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none"
              >
                Retry
              </button>
            </span>
          )}
        </div>
      </div>
    </li>
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
        className="block rounded-xl focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none"
        aria-label={`Open photo ${name}`}
      >
        <img
          src={url}
          alt={name}
          onLoad={onMediaLoad}
          className="max-h-72 w-auto max-w-full rounded-xl bg-slate-200 object-cover"
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
        className="max-h-72 max-w-full rounded-xl bg-black"
      >
        <track kind="captions" />
      </video>
    )
  }

  return (
    <a
      href={url}
      download={name}
      className={`flex min-w-56 items-center gap-3 rounded-xl p-2.5 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none ${
        mine ? 'bg-blue-700/60 hover:bg-blue-700' : 'bg-slate-100 hover:bg-slate-200'
      }`}
    >
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
          mine ? 'bg-white/20' : 'bg-blue-100 text-blue-700'
        }`}
      >
        <FileIcon />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{name}</span>
        <span className={`block text-xs ${mine ? 'text-blue-100' : 'text-slate-500'}`}>{formatBytes(size)}</span>
      </span>
      <DownloadIcon className="h-5 w-5 shrink-0" />
      <span className="sr-only">Download</span>
    </a>
  )
}

function UploadProgress({ progress, mine }) {
  const percent = Math.round(progress * 100)
  return (
    <div className="px-2 pt-2 pb-1">
      <div
        className={`h-1.5 overflow-hidden rounded-full ${mine ? 'bg-blue-400' : 'bg-slate-200'}`}
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Upload progress"
      >
        <div className={`h-full ${mine ? 'bg-white' : 'bg-blue-600'}`} style={{ width: `${percent}%` }} />
      </div>
      <p className={`mt-1 text-[11px] ${mine ? 'text-blue-100' : 'text-slate-500'}`}>Uploading {percent}%</p>
    </div>
  )
}
