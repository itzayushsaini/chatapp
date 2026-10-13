import { useRef, useState } from 'react'

import { formatDuration } from '../../utils/time.js'
import { PauseIcon, PlayIcon } from '../common/Icons.jsx'

const SPEEDS = [1, 1.5, 2]
// For a voice note sent without a waveform (e.g. an .m4a file)
const FLAT_WAVEFORM = Array(48).fill(30)
const SEEK_STEP_S = 5

// Only one voice note plays at a time, app-wide
let playingNow = null

export default function VoicePlayer({ attachment, mine = false, compact = false }) {
  const audioRef = useRef(null)
  const [playing, setPlaying] = useState(false)
  const [position, setPosition] = useState(0) // seconds
  const [speed, setSpeed] = useState(1)
  const [mediaDuration, setMediaDuration] = useState(null)

  // Chrome's WebM recordings often don't state their length, so fall back to the recorded one
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
          // Thinner bars below sm: 48 bars at 2px plus 2px gaps don't fit a 320px phone
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
