import { http } from './http.js'

export const getAiSummary = () => http.get('/ai/summary').then((r) => r.data)

export const getAiMessages = (before) =>
  http.get('/ai/messages', { params: before ? { before } : {} }).then((r) => r.data)

// The answer comes back empty here; its text streams in over the socket.
export function askAi({ text, clientId, mode, file, voice }, onProgress) {
  const form = new FormData()
  form.append('text', text)
  form.append('clientId', clientId)
  form.append('mode', mode)
  if (voice) {
    form.append('durationMs', String(Math.round(voice.durationMs)))
    form.append('waveform', JSON.stringify(voice.waveform))
  }
  if (file) form.append('file', file)
  return http
    .post('/ai/messages', form, {
      onUploadProgress: (event) => {
        if (event.total) onProgress?.(event.loaded / event.total)
      },
    })
    .then((r) => r.data)
}

export const forwardToAi = (messageId, clientId) =>
  http.post('/ai/forward', { messageId, clientId }).then((r) => r.data)

export const retryAi = () => http.post('/ai/retry').then((r) => r.data.answer)
export const stopAi = () => http.post('/ai/stop')
export const clearAi = () => http.delete('/ai/messages')
