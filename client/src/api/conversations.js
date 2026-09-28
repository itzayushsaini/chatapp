import { http } from './http.js'

// Without `before`: the latest page. With `before`: the page older than that
// message id. Resolves to { messages, hasMore }, oldest -> newest.
export const getMessages = (conversationId, before) =>
  http
    .get(`/conversations/${conversationId}/messages`, { params: before ? { before } : {} })
    .then((r) => r.data)

// The files sent in this chat, newest first: [{ messageId, senderId,
// createdAt, attachment }] - for the contact info panel.
export const getSharedAttachments = (conversationId) =>
  http.get(`/conversations/${conversationId}/attachments`).then((r) => r.data.items)

// Both of these only change things for ME, never for the other person.
export const clearChat = (conversationId) => http.post(`/conversations/${conversationId}/clear`)
export const setMuted = (conversationId, muted) =>
  http.patch(`/conversations/${conversationId}/mute`, { muted }).then((r) => r.data.muted)

// Step 1 of sending a file. `onProgress` is called with 0..1 as it uploads.
// `voice` ({ durationMs, waveform }) goes with a voice note, for display.
// Resolves to the attachment; step 2 is message:send with its id.
export const uploadAttachment = (conversationId, file, onProgress, voice) => {
  const form = new FormData()
  // Text fields before the file, the conventional order for multipart.
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
