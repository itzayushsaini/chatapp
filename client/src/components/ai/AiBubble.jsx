import { useState } from 'react'

import { useChatStore } from '../../store/useChatStore.js'
import { formatTime } from '../../utils/time.js'
import {
  AlertIcon,
  ChevronDownIcon,
  ClockIcon,
  CopyIcon,
  ForwardIcon,
  ImageIcon,
  LightbulbIcon,
  RefreshIcon,
} from '../common/Icons.jsx'
import Spinner from '../common/Spinner.jsx'
import TypingDots from '../common/TypingDots.jsx'
import { Attachment, UploadProgress } from '../chat/MessageBubble.jsx'
import Markdown from './Markdown.jsx'

// One message in the PingMe AI chat: my question on the right (like my own
// chat messages), PingMe AI's answer on the left.
//
// `isNew` (it arrived after the chat was opened) is read once, at the first
// render, so the slide-in plays once and never again as an answer streams.
export default function AiBubble({ message, isNew, ...props }) {
  const [animateIn] = useState(() => isNew)
  const Bubble = message.role === 'user' ? Question : Answer
  return <Bubble message={message} animateIn={animateIn} {...props} />
}

const MODE_LABEL = {
  think: { icon: LightbulbIcon, text: 'Think deeper' },
  imagine: { icon: ImageIcon, text: 'Imagine' },
}

function Question({ message, animateIn, onOpenImage, onMediaLoad, onRetryQuestion, onRemoveQuestion }) {
  const { text, attachment, status, forwarded, mode } = message
  const modeLabel = MODE_LABEL[mode]

  return (
    <li className={`flex justify-end ${animateIn ? 'animate-message-in' : ''}`}>
      <div
        className={`max-w-[85%] min-w-0 rounded-lg rounded-tr-none bg-brand-100 text-sm text-slate-900 shadow-sm sm:max-w-[70%] ${
          attachment ? 'overflow-hidden p-1' : 'bubble-tail-mine px-2.5 py-1.5'
        } ${status === 'failed' ? 'opacity-80' : ''}`}
      >
        {forwarded && (
          <p className="mx-1 mt-1 flex items-center gap-1 text-xs text-slate-500 italic">
            <ForwardIcon className="h-3.5 w-3.5" /> Forwarded
          </p>
        )}
        {modeLabel && (
          <p className={`flex items-center gap-1 text-xs font-medium text-brand-700 ${attachment ? 'mx-1 mt-1' : ''}`}>
            <modeLabel.icon className="h-3.5 w-3.5" /> {modeLabel.text}
          </p>
        )}
        {attachment && <Attachment attachment={attachment} mine onOpenImage={onOpenImage} onMediaLoad={onMediaLoad} />}
        {status === 'uploading' && <UploadProgress progress={message.progress ?? 0} />}
        {text && <p className={`whitespace-pre-wrap wrap-anywhere ${attachment ? 'px-2 pt-1.5' : ''}`}>{text}</p>}

        <div className={`flex items-center justify-end gap-1.5 text-[0.6875rem] text-meta ${attachment ? 'px-2 pb-1' : ''}`}>
          <span>{formatTime(message.createdAt)}</span>
          {(status === 'sending' || status === 'uploading') && (
            <span className="inline-flex items-center">
              <ClockIcon className="h-3.5 w-3.5" />
              <span className="sr-only">Sending</span>
            </span>
          )}
          {status === 'failed' && (
            <span className="inline-flex items-center gap-1.5 text-red-600">
              <AlertIcon className="h-3.5 w-3.5" />
              <button type="button" onClick={() => onRetryQuestion(message)} className="rounded font-semibold underline focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none">
                Retry
              </button>
              <button type="button" onClick={() => onRemoveQuestion(message)} className="rounded underline focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none">
                Remove
              </button>
            </span>
          )}
        </div>
      </div>
    </li>
  )
}

// The last "**Heading**" in the reasoning so far - what Gemini is thinking
// about right now (its thought summaries are written as headed paragraphs).
function currentThought(reasoning) {
  return [...reasoning.matchAll(/\*\*([^*\n]+)\*\*/g)].at(-1)?.[1] ?? null
}

function Answer({ message, animateIn, isLatestAnswer, onOpenImage, onMediaLoad, onRetryAnswer }) {
  const { text, reasoning, status, error, attachment, mode } = message
  const [showReasoning, setShowReasoning] = useState(false)
  const addToast = useChatStore((s) => s.addToast)
  // Still working it out: nothing of the answer itself has arrived yet.
  const thinking = status === 'streaming' && !text && !attachment
  const thought = thinking ? currentThought(reasoning) : null

  function copy() {
    navigator.clipboard
      .writeText(text)
      .then(() => addToast('Copied'))
      .catch(() => addToast('Could not copy', 'error'))
  }

  return (
    <li className={`flex justify-start ${animateIn ? 'animate-message-in' : ''}`}>
      <div className="bubble-tail-theirs max-w-[92%] min-w-0 rounded-lg rounded-tl-none bg-surface px-3 py-2 text-sm text-slate-900 shadow-sm sm:max-w-[80%]">
        {reasoning && !thinking && (
          <button
            type="button"
            onClick={() => setShowReasoning((v) => !v)}
            aria-expanded={showReasoning}
            className="mb-1.5 inline-flex items-center gap-1 rounded text-xs font-medium text-slate-500 hover:text-slate-800 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none"
          >
            <LightbulbIcon className="h-3.5 w-3.5" />
            {showReasoning ? 'Hide reasoning' : 'Show reasoning'}
            <ChevronDownIcon className={`h-3.5 w-3.5 transition-transform duration-150 ${showReasoning ? 'rotate-180' : ''}`} />
          </button>
        )}
        {reasoning && showReasoning && !thinking && (
          <div className="mb-2 border-l-2 border-slate-200 pl-2.5 text-xs text-slate-500">
            <Markdown text={reasoning} />
          </div>
        )}

        {thinking && (
          <p className="flex items-center gap-2 text-slate-500">
            {mode === 'imagine' ? (
              <>
                <Spinner className="h-4 w-4" /> Creating your picture…
              </>
            ) : (
              <>
                <TypingDots className="text-brand-600" />
                <span className="min-w-0 truncate">{thought ? `Thinking: ${thought}` : 'Thinking…'}</span>
              </>
            )}
          </p>
        )}

        {attachment && (
          <div className="mb-1 -mx-1.5">
            <Attachment attachment={attachment} mine={false} onOpenImage={onOpenImage} onMediaLoad={onMediaLoad} />
          </div>
        )}
        {text && <Markdown text={text} />}

        {status === 'stopped' && (
          <p className="mt-1 text-xs text-slate-500 italic">
            {text ? 'You stopped this answer.' : 'You stopped this answer before it started.'}
          </p>
        )}
        {status === 'error' && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-red-600">
            <AlertIcon className="h-4 w-4 shrink-0" />
            <span>{error}</span>
            {isLatestAnswer && (
              <button
                type="button"
                onClick={onRetryAnswer}
                className="inline-flex items-center gap-1 rounded font-semibold underline focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none"
              >
                <RefreshIcon className="h-3.5 w-3.5" /> Try again
              </button>
            )}
          </div>
        )}

        <div className="mt-1 flex items-center justify-end gap-2 text-[0.6875rem] text-meta">
          {text && status !== 'streaming' && (
            <button
              type="button"
              onClick={copy}
              className="rounded p-0.5 hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none"
              aria-label="Copy answer"
              title="Copy"
            >
              <CopyIcon className="h-3.5 w-3.5" />
            </button>
          )}
          <span>{formatTime(message.createdAt)}</span>
        </div>
      </div>
    </li>
  )
}
