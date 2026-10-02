import * as updateService from '../services/updateService.js'
import { sendStoredFile } from '../utils/sendStoredFile.js'

// The "PingMe" updates channel. Reading is for every logged-in user; the
// last two handlers are mounted under /api/admin, behind requireAdmin.

export async function summary(req, res) {
  res.json(await updateService.getSummary(req.user._id))
}

export async function list(req, res) {
  res.json(await updateService.listUpdates(req.valid.query))
}

export async function markRead(req, res) {
  await updateService.markRead(req.user._id, req.valid.body.upToId)
  res.status(204).end()
}

export async function image(req, res, next) {
  const file = await updateService.getImage(req.valid.params.id)
  // A post's photo never changes (a new photo means a new post), so the
  // browser may keep it for a year.
  sendStoredFile(req, res, next, { ...file, inline: true, cache: 'private, max-age=31536000, immutable' })
}

export async function create(req, res) {
  const update = await updateService.createUpdate(req.user._id, req.valid.body, req.file)
  res.status(201).json({ update })
}

export async function remove(req, res) {
  await updateService.deleteUpdate(req.valid.params.id)
  res.status(204).end()
}
