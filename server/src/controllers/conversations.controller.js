import * as attachmentService from '../services/attachmentService.js'
import * as messageService from '../services/messageService.js'

export async function messages(req, res) {
  res.json(await messageService.getHistory(req.user._id, req.valid.params.id, req.valid.query))
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
