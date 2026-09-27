import { useEffect, useRef, useState } from 'react'

import { useChatStore } from '../../store/useChatStore.js'
import { ACCEPT, checkFile, formatBytes, kindOf } from '../../utils/files.js'
import { FileIcon, PaperclipIcon, SendIcon, VideoIcon } from '../common/Icons.jsx'

const MAX_LENGTH = 2000
// Show the character counter only once the user is getting close.
const COUNTER_FROM = 1800

// onSend(text, file) - file is null for a plain text message.
export default function MessageInput({ onSend, disabled }) {
  const [text, setText] = useState('')
  const [file, setFile] = useState(null)
  const textareaRef = useRef(null)
  const fileInputRef = useRef(null)
  const addToast = useChatStore((s) => s.addToast)

  const trimmed = text.trim()
  const canSend = !disabled && (trimmed.length > 0 || file) && text.length <= MAX_LENGTH

  function submit() {
    if (!canSend) return
    onSend(trimmed, file)
    setText('')
    setFile(null)
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

  function handleFile(event) {
    const chosen = event.target.files[0]
    event.target.value = '' // so picking the same file again still fires
    if (!chosen) return
    // Quick feedback only - the server checks the file's real contents.
    const problem = checkFile(chosen)
    if (problem) {
      addToast(problem, 'error')
      return
    }
    setFile(chosen)
    textareaRef.current?.focus()
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
      {file && <ChosenFile file={file} onRemove={() => setFile(null)} />}

      <div className="flex items-end gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPT}
          onChange={handleFile}
          className="hidden"
          aria-label="Attach a file"
          data-testid="attach-input"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current.click()}
          disabled={disabled}
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none disabled:text-slate-300"
          aria-label="Attach a photo, video or document"
          title="Attach a photo, video or document"
        >
          <PaperclipIcon />
        </button>
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
          placeholder={file ? 'Add a caption (optional)...' : 'Type a message...'}
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

// The file waiting to be sent, shown above the input with a Remove button.
function ChosenFile({ file, onRemove }) {
  const kind = kindOf(file)
  const [previewUrl, setPreviewUrl] = useState(null)

  // A photo is previewed from a temporary blob: URL, which must be released
  // when this preview goes away or the memory stays allocated.
  useEffect(() => {
    if (kind !== 'image') return
    const url = URL.createObjectURL(file)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file, kind])

  return (
    <div className="mb-2 flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-2">
      {kind === 'image' && previewUrl ? (
        <img src={previewUrl} alt="" className="h-12 w-12 rounded-lg object-cover" />
      ) : (
        <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
          {kind === 'video' ? <VideoIcon /> : <FileIcon />}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-900">{file.name}</p>
        <p className="text-xs text-slate-500">{formatBytes(file.size)}</p>
      </div>
      <button
        type="button"
        onClick={onRemove}
        className="rounded-lg px-2 py-1 text-xl leading-none text-slate-500 hover:bg-slate-200 hover:text-slate-800 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none"
        aria-label={`Remove ${file.name}`}
      >
        ×
      </button>
    </div>
  )
}
