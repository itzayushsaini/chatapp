import { http } from './http.js'

export const getMessages = (conversationId, before) =>
  http
    .get(`/conversations/${conversationId}/messages`, { params: before ? { before } : {} })
    .then((r) => r.data)

export const getSharedAttachments = (conversationId) =>
  http.get(`/conversations/${conversationId}/attachments`).then((r) => r.data.items)

export const clearChat = (conversationId) => http.post(`/conversations/${conversationId}/clear`)
export const setMuted = (conversationId, muted) =>
  http.patch(`/conversations/${conversationId}/mute`, { muted }).then((r) => r.data.muted)

// Step 1 of sending a file; step 2 is message:send with the attachment's id.
export const uploadAttachment = (conversationId, file, onProgress, voice) => {
  const form = new FormData()
  if (voice) {
    form.append('durationMs', String(Math.round(voice.durationMs)))
    form.append('waveform', JSON.stringify(voice.waveform))
  }
  form.append('file', file)
  return http
    .post(`/conversations/${conversationId}/attachments`, form, {
      onUploadProgress: (event) => {
        if (event.total) onProgress?.(event.loaded / event.total)
      },
    })
    .then((r) => r.data.attachment)
}
