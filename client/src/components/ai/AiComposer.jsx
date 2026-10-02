import { useRef, useState } from 'react'

import { MAX_VOICE_MS, useVoiceRecorder } from '../../hooks/useVoiceRecorder.js'
import { useChatStore } from '../../store/useChatStore.js'
import { AI_ACCEPT, AI_IMAGE_ACCEPT, checkAiFile, kindOf } from '../../utils/files.js'
import { enterToSend } from '../../utils/preferences.js'
import { ImageIcon, LightbulbIcon, MicIcon, PaperclipIcon, SendIcon, StopIcon } from '../common/Icons.jsx'
import { ChosenFile } from '../chat/MessageInput.jsx'
import VoiceRecorderBar from '../chat/VoiceRecorderBar.jsx'

const MAX_LENGTH = 4000
const COUNTER_FROM = 3600
const MIN_VOICE_MS = 500

const ROUND_BUTTON =
  'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white transition-[background-color,transform] duration-150 hover:bg-brand-700 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:outline-none active:scale-90 disabled:bg-brand-300 disabled:active:scale-100'

// A small on/off "chip" above the text box.
function ModeChip({ on, onClick, icon, children, title }) {
  const ChipIcon = icon
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      title={title}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none ${
        on
          ? 'border-brand-600 bg-brand-600 text-white'
          : 'border-slate-300 bg-surface text-slate-600 hover:border-slate-400 hover:text-slate-900'
      }`}
    >
      <ChipIcon className="h-3.5 w-3.5" />
      {children}
    </button>
  )
}

// The message box of the PingMe AI chat - like a chat's, plus two modes:
//   "Think deeper" - Gemini reasons for longer before answering (slower,
//                    better for maths, code and planning).
//   "Imagine"      - create a picture (only when an admin has turned it on).
// While an answer is being written, the round button becomes Stop.
//
// onSend({ text, file, voice, mode }) - `file` and `voice` only when used.
export default function AiComposer({ onSend, onStop, answering, imageGeneration }) {
  const [text, setText] = useState('')
  const [file, setFile] = useState(null)
  const [mode, setMode] = useState('chat')
  const textareaRef = useRef(null)
  const fileInputRef = useRef(null)
  const addToast = useChatStore((s) => s.addToast)
  const [sendOnEnter] = useState(enterToSend)

  const trimmed = text.trim()
  const imagining = mode === 'imagine' && imageGeneration
  const canSend = !answering && (imagining ? trimmed.length > 0 : trimmed.length > 0 || file) && text.length <= MAX_LENGTH
  const showMic = !trimmed && !file && !imagining

  const voice = useVoiceRecorder({
    onLimit: () => {
      addToast(`Voice notes can be up to ${MAX_VOICE_MS / 60000} minutes - sent.`)
      sendVoice()
    },
  })

  async function startVoice() {
    try {
      await voice.start()
    } catch (err) {
      addToast(err.message, 'error')
    }
  }

  async function sendVoice() {
    const result = await voice.stop()
    if (!result) return
    if (result.durationMs < MIN_VOICE_MS) {
      addToast('Hold on a little longer - that voice note was too short.')
      return
    }
    onSend({ text: '', file: result.file, voice: { durationMs: result.durationMs, waveform: result.waveform }, mode: 'chat' })
  }

  function toggleMode(next) {
    setMode((current) => (current === next ? 'chat' : next))
    // Imagine can only use a photo - drop anything else that was picked.
    if (next === 'imagine' && file && kindOf(file) !== 'image') setFile(null)
    textareaRef.current?.focus()
  }

  function submit() {
    if (!canSend) return
    onSend({ text: trimmed, file, mode: imagining ? 'imagine' : mode === 'think' ? 'think' : 'chat' })
    setText('')
    setFile(null)
    resize('')
    textareaRef.current?.focus()
  }

  function handleKeyDown(event) {
    if (!sendOnEnter) return
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      submit()
    }
  }

  function handleFile(event) {
    const chosen = event.target.files[0]
    event.target.value = ''
    if (!chosen) return
    const problem = checkAiFile(chosen)
    if (problem) return addToast(problem, 'error')
    if (imagining && kindOf(chosen) !== 'image') return addToast('To change a picture, choose a photo', 'error')
    setFile(chosen)
    textareaRef.current?.focus()
  }

  function resize(value) {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    if (value) el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }

  const placeholder = imagining
    ? file
      ? 'How should this photo change?'
      : 'Describe the picture you want...'
    : file
      ? 'Ask about this file (optional)...'
      : 'Ask PingMe AI anything'

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
      className="bg-slate-100 px-3 py-2.5 sm:px-4"
    >
      <div className="mb-2 flex flex-wrap gap-2">
        <ModeChip
          on={mode === 'think'}
          onClick={() => toggleMode('think')}
          icon={LightbulbIcon}
          title="Reason for longer before answering - best for maths, code and planning"
        >
          Think deeper
        </ModeChip>
        {imageGeneration && (
          <ModeChip on={mode === 'imagine'} onClick={() => toggleMode('imagine')} icon={ImageIcon} title="Create a picture">
            Imagine
          </ModeChip>
        )}
      </div>

      {file && (
        <div className="animate-slide-down">
          <ChosenFile file={file} onRemove={() => setFile(null)} />
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept={imagining ? AI_IMAGE_ACCEPT : AI_ACCEPT}
        onChange={handleFile}
        className="hidden"
        aria-label="Attach a file for PingMe AI"
        data-testid="ai-attach-input"
      />

      {voice.recording ? (
        <VoiceRecorderBar elapsedMs={voice.elapsedMs} levels={voice.liveLevels} onCancel={voice.cancel} onSend={sendVoice} />
      ) : (
        <div className="flex items-end gap-2">
          <div className="flex flex-1 items-end gap-1 rounded-3xl bg-surface pr-1 pl-1.5 shadow-sm transition-shadow duration-150 focus-within:ring-2 focus-within:ring-brand-500/40">
            <button
              type="button"
              onClick={() => fileInputRef.current.click()}
              className="mb-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-500 transition-colors duration-150 hover:bg-slate-100 hover:text-slate-800 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none"
              aria-label={imagining ? 'Attach a photo to change' : 'Attach a photo, PDF, text file or video'}
              title={imagining ? 'Attach a photo to change' : 'Attach a photo, PDF, text file or video'}
            >
              <PaperclipIcon />
            </button>
            <label htmlFor="ai-input" className="sr-only">
              Ask PingMe AI
            </label>
            <textarea
              id="ai-input"
              ref={textareaRef}
              rows={1}
              value={text}
              onChange={(e) => {
                setText(e.target.value)
                resize(e.target.value)
              }}
              onKeyDown={handleKeyDown}
              maxLength={MAX_LENGTH}
              placeholder={placeholder}
              className="block max-h-40 min-h-10 flex-1 resize-none bg-transparent py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
            />
          </div>
          {answering ? (
            <button type="button" onClick={onStop} className={ROUND_BUTTON} aria-label="Stop answering" title="Stop">
              <StopIcon className="h-5 w-5" />
            </button>
          ) : showMic ? (
            <button type="button" onClick={startVoice} className={ROUND_BUTTON} aria-label="Record a voice question" title="Ask with your voice">
              <MicIcon className="h-5 w-5" />
            </button>
          ) : (
            <button type="submit" disabled={!canSend} className={ROUND_BUTTON} aria-label="Send to PingMe AI">
              <SendIcon className="h-5 w-5" />
            </button>
          )}
        </div>
      )}
      {text.length >= COUNTER_FROM && (
        <p className={`mt-1 text-right text-xs ${text.length >= MAX_LENGTH ? 'text-red-600' : 'text-slate-500'}`} aria-live="polite">
          {text.length} / {MAX_LENGTH}
        </p>
      )}
    </form>
  )
}
