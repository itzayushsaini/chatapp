import * as attachmentService from '../services/attachmentService.js'
import * as messageService from '../services/messageService.js'
import { emitToUser } from '../socket/emitter.js'

export async function messages(req, res) {
  res.json(await messageService.getHistory(req.user._id, req.valid.params.id, req.valid.query))
}

export async function sharedAttachments(req, res) {
  res.json({ items: await messageService.listSharedAttachments(req.user._id, req.valid.params.id) })
}

// Both of these only affect ME, so only my own other tabs are told.
export async function clear(req, res) {
  await messageService.clearConversation(req.user._id, req.valid.params.id)
  emitToUser(req.user._id, 'conversation:cleared', { conversationId: req.valid.params.id })
  res.status(204).end()
}

export async function mute(req, res) {
  const muted = await messageService.setMuted(req.user._id, req.valid.params.id, req.valid.body.muted)
  emitToUser(req.user._id, 'conversation:muted', { conversationId: req.valid.params.id, muted })
  res.json({ muted })
}

// Runs BEFORE the upload is read: a stranger to this conversation is turned
// away without the server ever receiving their file.
export async function checkCanUpload(req, res, next) {
  await attachmentService.assertCanUpload(req.user._id, req.valid.params.id)
  next()
}

export async function upload(req, res) {
  const attachment = await attachmentService.createAttachment(
    req.user._id,
    req.valid.params.id,
    req.file,
  )
  res.status(201).json({ attachment: attachmentService.attachmentView(attachment) })
}
