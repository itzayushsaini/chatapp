import { useRef, useState } from 'react'

import { formatDuration } from '../../utils/time.js'
import { PauseIcon, PlayIcon } from '../common/Icons.jsx'

const SPEEDS = [1, 1.5, 2]
// A voice note sent without a waveform (e.g. an .m4a file) still gets bars,
// just flat ones.
const FLAT_WAVEFORM = Array(48).fill(30)
const SEEK_STEP_S = 5

// Only one voice note plays at a time, anywhere in the app: starting one
// pauses whichever was playing before - the same as WhatsApp.
let playingNow = null

// A voice note inside a message bubble (and in Contact info). `attachment`
// is the usual attachment payload plus durationMs / waveform.
export default function VoicePlayer({ attachment, mine = false, compact = false }) {
  const audioRef = useRef(null)
  const [playing, setPlaying] = useState(false)
  const [position, setPosition] = useState(0) // seconds
  const [speed, setSpeed] = useState(1)
  const [mediaDuration, setMediaDuration] = useState(null)

  // Prefer the file's own length; many recordings (Chrome's WebM) do not
  // state one, and then the length measured while recording is used.
  const duration = mediaDuration ?? (attachment.durationMs ? attachment.durationMs / 1000 : 0)
  const bars = attachment.waveform?.length ? attachment.waveform : FLAT_WAVEFORM
  const progress = duration ? Math.min(1, position / duration) : 0
  const playedBars = Math.round(progress * bars.length)

  function toggle() {
    const audio = audioRef.current
    if (!audio.paused) {
      audio.pause()
      return
    }
    if (playingNow && playingNow !== audio) playingNow.pause()
    playingNow = audio
    audio.playbackRate = speed
    audio.play().catch(() => setPlaying(false))
  }

  function seekTo(seconds) {
    if (!duration) return
    const audio = audioRef.current
    const target = Math.max(0, Math.min(duration, seconds))
    audio.currentTime = target
    setPosition(target)
  }

  function onBarsClick(event) {
    const rect = event.currentTarget.getBoundingClientRect()
    seekTo(((event.clientX - rect.left) / rect.width) * duration)
  }

  function onBarsKey(event) {
    const moves = {
      ArrowRight: position + SEEK_STEP_S,
      ArrowUp: position + SEEK_STEP_S,
      ArrowLeft: position - SEEK_STEP_S,
      ArrowDown: position - SEEK_STEP_S,
      Home: 0,
      End: duration,
    }
    if (!(event.key in moves)) return
    event.preventDefault()
    seekTo(moves[event.key])
  }

  function cycleSpeed() {
    const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length]
    setSpeed(next)
    audioRef.current.playbackRate = next
  }

  // Colours that read on both bubble colours, in both themes.
  const played = mine ? 'bg-slate-700' : 'bg-brand-600'
  const unplayed = 'bg-slate-400/60'

  return (
    <div className={`flex items-center gap-2.5 ${compact ? 'w-full' : 'w-64 max-w-full px-1.5 py-1'}`}>
      <audio
        ref={audioRef}
        src={attachment.url}
        preload="metadata"
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration
          if (Number.isFinite(d) && d > 0) setMediaDuration(d)
        }}
        onTimeUpdate={(e) => setPosition(e.currentTarget.currentTime)}
        onPlay={(e) => {
          e.currentTarget.playbackRate = speed // some browsers reset it on play
          setPlaying(true)
        }}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false)
          setPosition(0)
          if (playingNow === audioRef.current) playingNow = null
        }}
      />

      <button
        type="button"
        onClick={toggle}
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white transition-[background-color,transform] duration-150 hover:bg-brand-700 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none active:scale-90"
        aria-label={playing ? 'Pause voice message' : 'Play voice message'}
      >
        {playing ? <PauseIcon className="h-4 w-4" /> : <PlayIcon className="ml-0.5 h-4 w-4" />}
      </button>

      <div className="min-w-0 flex-1">
        {/* The waveform doubles as the seek bar: click anywhere on it, or
            use the arrow keys (5 s at a time), Home and End. */}
        <div
          role="slider"
          tabIndex={0}
          aria-label="Voice message position"
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          aria-valuenow={Math.round(position)}
          aria-valuetext={`${formatDuration(position * 1000)} of ${formatDuration(duration * 1000)}`}
          onClick={onBarsClick}
          onKeyDown={onBarsKey}
          // Thinner bars and gaps below `sm`: 48 bars at 2px + 2px gaps need
          // 190px, more than a bubble has on a 320px phone.
          className="flex h-7 cursor-pointer items-center gap-px rounded sm:gap-[2px] focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none"
        >
          {bars.map((height, i) => (
            <span
              key={i}
              className={`min-w-px flex-1 rounded-full sm:min-w-[2px] transition-colors duration-150 ${i < playedBars ? played : unplayed}`}
              style={{ height: `${Math.max(12, height)}%` }}
            />
          ))}
        </div>
        <div className="mt-0.5 flex items-center justify-between text-[0.6875rem] text-meta tabular-nums">
          <span>{formatDuration((playing || position > 0 ? position : duration) * 1000)}</span>
          <button
            type="button"
            onClick={cycleSpeed}
            className="rounded-full bg-overlay/10 px-1.5 font-semibold transition-colors duration-150 hover:bg-overlay/20 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none"
            aria-label={`Playback speed ${speed}×, change`}
            title="Playback speed"
          >
            {speed}×
          </button>
        </div>
      </div>
    </div>
  )
}
