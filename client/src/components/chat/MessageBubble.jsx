import { formatTime } from '../../utils/time.js'
import { AlertIcon, CheckIcon, ClockIcon } from '../common/Icons.jsx'

// Message text is rendered as a plain React text node, which React always
// escapes - so a message containing <script> just shows those characters.
// There is no dangerouslySetInnerHTML anywhere in the app.
// `whitespace-pre-wrap` keeps the user's line breaks (Shift+Enter).
export default function MessageBubble({ message, mine, onRetry }) {
  const { status } = message

  return (
    <li className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
      <div className="max-w-[80%] sm:max-w-[70%]">
        <div
          className={`rounded-2xl px-3.5 py-2 text-sm break-words whitespace-pre-wrap ${
            mine
              ? 'rounded-br-md bg-blue-600 text-white'
              : 'rounded-bl-md bg-white text-slate-900 shadow-sm'
          } ${status === 'failed' ? 'opacity-70' : ''}`}
        >
          {message.text}
        </div>

        <div
          className={`mt-0.5 flex items-center gap-1 text-[11px] text-slate-500 ${
            mine ? 'justify-end' : 'justify-start'
          }`}
        >
          <span>{formatTime(message.createdAt)}</span>
          {mine && status === 'sending' && (
            <span className="inline-flex items-center gap-0.5">
              <ClockIcon className="h-3 w-3" />
              <span className="sr-only">Sending</span>
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
