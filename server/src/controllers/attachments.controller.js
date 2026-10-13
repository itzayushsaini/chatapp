import * as attachmentService from '../services/attachmentService.js'
import { sendStoredFile } from '../utils/sendStoredFile.js'

export async function download(req, res, next) {
  const attachment = await attachmentService.getForDownload(req.user._id, req.valid.params.id)

  sendStoredFile(req, res, next, {
    fileId: attachment.fileId,
    size: attachment.size,
    mimeType: attachment.mimeType,
    name: attachment.name,
    // Documents are always downloaded, never opened on our domain
    inline: attachment.kind !== 'file',
    cache: 'private, max-age=86400',
  })
}
