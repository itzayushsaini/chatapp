import { useRef, useState } from 'react'

import { formatDuration } from '../../utils/time.js'
import { SendIcon, TrashIcon } from '../common/Icons.jsx'

// How far left the recording strip has to be dragged to cancel.
const CANCEL_SWIPE_PX = 120

// Replaces the composer while a voice note is being recorded: a red dot and
// timer, the live waveform, and Cancel / Send.
//
// Swipe to cancel: drag the strip to the left (finger or mouse) and let go
// past the line - or keep going - to throw the recording away. The strip
// follows your finger and fades as it gets closer, so it is obvious what
// letting go will do. The Cancel button and the Escape key do the same for
// anyone who would rather not swipe.
export default function VoiceRecorderBar({ elapsedMs, levels, onCancel, onSend }) {
  const [dragX, setDragX] = useState(0)
  const drag = useRef(null)

  function onPointerDown(event) {
    drag.current = { startX: event.clientX }
    // Keep receiving moves even if the pointer leaves the strip.
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function onPointerMove(event) {
    if (!drag.current) return
    const dx = Math.min(0, event.clientX - drag.current.startX) // left only
    if (dx <= -CANCEL_SWIPE_PX) {
      drag.current = null
      setDragX(0)
      onCancel()
      return
    }
    setDragX(dx)
  }

  function onPointerEnd() {
    drag.current = null
    setDragX(0) // not far enough: spring back
  }

  const fade = 1 - Math.min(1, -dragX / CANCEL_SWIPE_PX) * 0.7

  return (
    <div
      className="flex items-center gap-2"
      role="group"
      aria-label="Recording a voice note"
      onKeyDown={(e) => e.key === 'Escape' && onCancel()}
    >
      <button
        type="button"
        onClick={onCancel}
        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-500 transition-colors duration-150 hover:bg-slate-200 hover:text-red-600 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none"
        aria-label="Cancel voice note"
        title="Cancel"
      >
        <TrashIcon />
      </button>

      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        // touch-action pan-y: a sideways drag belongs to us, not to the
        // browser's own scrolling/back-swipe.
        className={`flex min-w-0 flex-1 touch-pan-y items-center gap-3 rounded-3xl bg-surface px-4 py-2.5 shadow-sm select-none ${
          dragX === 0 ? 'transition-transform duration-200' : ''
        }`}
        style={{ transform: `translateX(${dragX}px)`, opacity: fade }}
      >
        <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-red-600 motion-safe:animate-pulse" aria-hidden="true" />
        <span className="shrink-0 text-sm text-slate-700 tabular-nums" aria-live="off">
          {formatDuration(elapsedMs)}
        </span>
        <LiveWaveform levels={levels} />
        <span className="hidden shrink-0 text-xs text-slate-400 sm:inline" aria-hidden="true">
          ‹ Slide to cancel
        </span>
      </div>

      <button
        type="button"
        onClick={onSend}
        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white transition-[background-color,transform] duration-150 hover:bg-brand-700 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:outline-none active:scale-90"
        aria-label="Send voice note"
        // Focus lands here when recording starts, so Enter sends and
        // Escape (handled above) cancels without touching the mouse.
        autoFocus
      >
        <SendIcon className="h-5 w-5" />
      </button>
    </div>
  )
}

// The last few seconds of loudness, newest on the right, as bars. The raw
// readings are small numbers (normal speech is around 0.05-0.3), hence the
// multiplier.
function LiveWaveform({ levels }) {
  return (
    <span className="flex h-6 min-w-0 flex-1 items-center justify-end gap-0.5 overflow-hidden" aria-hidden="true">
      {levels.map((level, i) => (
        <span
          key={i}
          className="w-[3px] shrink-0 rounded-full bg-slate-400"
          style={{ height: `${Math.max(12, Math.min(100, level * 350))}%` }}
        />
      ))}
    </span>
  )
}
