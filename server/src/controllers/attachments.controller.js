import * as attachmentService from '../services/attachmentService.js'
import { sendStoredFile } from '../utils/sendStoredFile.js'

export async function download(req, res, next) {
  const attachment = await attachmentService.getForDownload(req.user._id, req.valid.params.id)

  sendStoredFile(req, res, next, {
    fileId: attachment.fileId,
    size: attachment.size,
    mimeType: attachment.mimeType,
    name: attachment.name,
    // Photos and videos are shown inside the chat. Documents are ALWAYS
    // downloaded, never opened by the browser on our domain.
    inline: attachment.kind !== 'file',
    // A file never changes after upload, but it is private: only the
    // browser may cache it (not shared proxies), and only for a day.
    cache: 'private, max-age=86400',
  })
}
