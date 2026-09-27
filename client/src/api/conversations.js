import { http } from './http.js'

// Without `before`: the latest page. With `before`: the page older than that
// message id. Resolves to { messages, hasMore }, oldest -> newest.
export const getMessages = (conversationId, before) =>
  http
    .get(`/conversations/${conversationId}/messages`, { params: before ? { before } : {} })
    .then((r) => r.data)

// Step 1 of sending a file. `onProgress` is called with 0..1 as it uploads.
// Resolves to the attachment; step 2 is message:send with its id.
export const uploadAttachment = (conversationId, file, onProgress) => {
  const form = new FormData()
  form.append('file', file)
  return http
    .post(`/conversations/${conversationId}/attachments`, form, {
      onUploadProgress: (event) => {
        if (event.total) onProgress?.(event.loaded / event.total)
      },
    })
    .then((r) => r.data.attachment)
}
