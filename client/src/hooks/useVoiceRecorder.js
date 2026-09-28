import { useEffect, useRef, useState } from 'react'

// Recording a voice note, with nothing but what the browser itself provides:
//   - getUserMedia asks for the microphone,
//   - MediaRecorder turns it into a compressed audio file,
//   - an AnalyserNode (Web Audio) measures how loud it is 10 times a second,
//     which is what draws the waveform - live while recording, and as the
//     saved shape of the finished note.

export const MAX_VOICE_MS = 5 * 60 * 1000
const LEVEL_EVERY_MS = 100
const WAVEFORM_BARS = 48
const LIVE_BARS = 40

// Browsers each record in their own format. The first one this browser can
// make wins: WebM (Chrome, Edge), Ogg (Firefox), MP4 (Safari). The server
// checks the file's real bytes either way - this only picks the file name.
const FORMATS = [
  { mime: 'audio/webm;codecs=opus', ext: 'webm' },
  { mime: 'audio/ogg;codecs=opus', ext: 'ogg' },
  { mime: 'audio/mp4', ext: 'm4a' },
  { mime: 'audio/webm', ext: 'webm' },
]

export function voiceNotesSupported() {
  return (
    typeof window !== 'undefined' &&
    Boolean(navigator.mediaDevices?.getUserMedia) &&
    typeof window.MediaRecorder !== 'undefined'
  )
}

// One loudness reading per 100 ms, squeezed (or stretched) into a fixed
// number of bars and scaled so the loudest bar is 100. Every bar is at
// least 4, so silence still shows as a thin line rather than nothing.
export function toWaveform(levels, bars = WAVEFORM_BARS) {
  if (!levels.length) return []
  const out = []
  for (let i = 0; i < bars; i++) {
    const start = Math.floor((i * levels.length) / bars)
    const end = Math.max(start + 1, Math.floor(((i + 1) * levels.length) / bars))
    const slice = levels.slice(start, end)
    out.push(slice.reduce((sum, v) => sum + v, 0) / slice.length)
  }
  const peak = Math.max(...out) || 1
  return out.map((v) => Math.max(4, Math.round((v / peak) * 100)))
}

// Turns a failure to get the microphone into something a person can act on.
function micError(err) {
  if (err?.name === 'NotAllowedError' || err?.name === 'SecurityError') {
    return 'Microphone access is blocked. Allow it in your browser’s site settings to send voice notes.'
  }
  if (err?.name === 'NotFoundError') return 'No microphone was found.'
  return 'Could not start the microphone.'
}

// Stops everything a recording holds on to: the timer, the microphone (so
// the browser's "recording" indicator goes away) and the audio context.
function release(session) {
  clearInterval(session.timer)
  session.stream.getTracks().forEach((track) => track.stop())
  session.audioContext.close().catch(() => {})
}

// `onLimit` is called once when the 5-minute limit is reached, so the
// caller can stop and send.
export function useVoiceRecorder({ onLimit } = {}) {
  const [recording, setRecording] = useState(false)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [liveLevels, setLiveLevels] = useState([])
  const session = useRef(null)
  const onLimitRef = useRef(onLimit)
  useEffect(() => {
    onLimitRef.current = onLimit
  })

  function reset() {
    session.current = null
    setRecording(false)
    setElapsedMs(0)
    setLiveLevels([])
  }

  // Must be called from a click: browsers only show the microphone prompt
  // for something the user actually did. Throws an Error with a readable
  // message if it cannot start.
  async function start() {
    if (session.current) return
    if (!voiceNotesSupported()) throw new Error('Voice notes are not supported in this browser.')
    const format = FORMATS.find((f) => MediaRecorder.isTypeSupported(f.mime))
    if (!format) throw new Error('Voice notes are not supported in this browser.')

    let stream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch (err) {
      throw new Error(micError(err))
    }

    const recorder = new MediaRecorder(stream, { mimeType: format.mime })
    const chunks = []
    recorder.ondataavailable = (event) => {
      if (event.data.size) chunks.push(event.data)
    }

    const audioContext = new AudioContext()
    const analyser = audioContext.createAnalyser()
    analyser.fftSize = 512
    audioContext.createMediaStreamSource(stream).connect(analyser)
    const samples = new Uint8Array(analyser.fftSize)
    const levels = []
    const startedAt = Date.now()
    let limitReached = false

    const timer = setInterval(() => {
      // Loudness = root-mean-square of the current slice of sound. The
      // samples are 0-255 with silence at 128.
      analyser.getByteTimeDomainData(samples)
      let sum = 0
      for (const value of samples) {
        const x = (value - 128) / 128
        sum += x * x
      }
      levels.push(Math.sqrt(sum / samples.length))

      const elapsed = Date.now() - startedAt
      setElapsedMs(elapsed)
      setLiveLevels(levels.slice(-LIVE_BARS))
      if (elapsed >= MAX_VOICE_MS && !limitReached) {
        limitReached = true
        onLimitRef.current?.()
      }
    }, LEVEL_EVERY_MS)

    // Hand over a chunk every 250 ms rather than one blob at the end, so a
    // long note is never held as a single piece until the very last moment.
    recorder.start(250)
    session.current = { stream, recorder, chunks, audioContext, timer, levels, startedAt, format }
    setRecording(true)
  }

  // Finishes the recording. Resolves to { file, durationMs, waveform }, or
  // null if nothing was being recorded.
  function stop() {
    const s = session.current
    if (!s) return Promise.resolve(null)
    session.current = null // a second stop() (e.g. the limit AND a click) does nothing
    return new Promise((resolve) => {
      s.recorder.onstop = () => {
        const durationMs = Math.min(Date.now() - s.startedAt, MAX_VOICE_MS)
        const type = s.format.mime.split(';')[0]
        const file = new File(s.chunks, `voice-note.${s.format.ext}`, { type })
        const waveform = toWaveform(s.levels)
        release(s)
        reset()
        resolve({ file, durationMs, waveform })
      }
      s.recorder.stop()
    })
  }

  // Throws the recording away.
  function cancel() {
    const s = session.current
    if (!s) return
    s.recorder.onstop = null
    if (s.recorder.state !== 'inactive') s.recorder.stop()
    release(s)
    reset()
  }

  // Leaving the chat (this component unmounts) mid-recording must still let
  // go of the microphone.
  useEffect(
    () => () => {
      const s = session.current
      if (!s) return
      s.recorder.onstop = null
      if (s.recorder.state !== 'inactive') s.recorder.stop()
      release(s)
    },
    [],
  )

  return { recording, elapsedMs, liveLevels, start, stop, cancel }
}
