import { useRef, useState } from 'react'

import { SendIcon } from '../common/Icons.jsx'

const MAX_LENGTH = 2000
// Show the character counter only once the user is getting close.
const COUNTER_FROM = 1800

export default function MessageInput({ onSend, disabled }) {
  const [text, setText] = useState('')
  const textareaRef = useRef(null)

  const trimmed = text.trim()
  const canSend = !disabled && trimmed.length > 0 && text.length <= MAX_LENGTH

  function submit() {
    if (!canSend) return
    onSend(trimmed)
    setText('')
    resize('')
    textareaRef.current?.focus()
  }

  // Enter sends; Shift+Enter adds a new line. isComposing is true while an
  // input method (e.g. for Hindi or Japanese) is still building a word -
  // Enter then confirms the word and must not send.
  function handleKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      submit()
    }
  }

  // Grow the box with its content, up to about 5 lines.
  function resize(value) {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    if (value) el.style.height = `${Math.min(el.scrollHeight, 128)}px`
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
      className="border-t border-slate-200 bg-white px-3 py-3 sm:px-4"
    >
      <div className="flex items-end gap-2">
        <label htmlFor="message-input" className="sr-only">
          Type a message
        </label>
        <textarea
          id="message-input"
          ref={textareaRef}
          rows={1}
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            resize(e.target.value)
          }}
          onKeyDown={handleKeyDown}
          maxLength={MAX_LENGTH}
          placeholder="Type a message..."
          className="block max-h-32 min-h-10 flex-1 resize-none rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/30 focus:outline-none"
        />
        <button
          type="submit"
          disabled={!canSend}
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white hover:bg-blue-700 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:outline-none disabled:bg-blue-300"
          aria-label="Send message"
        >
          <SendIcon className="h-5 w-5" />
        </button>
      </div>
      {text.length >= COUNTER_FROM && (
        <p
          className={`mt-1 text-right text-xs ${text.length >= MAX_LENGTH ? 'text-red-600' : 'text-slate-500'}`}
          aria-live="polite"
        >
          {text.length} / {MAX_LENGTH}
        </p>
      )}
    </form>
  )
}
