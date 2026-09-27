import * as friendService from '../services/friendService.js'
import * as profileService from '../services/profileService.js'
import { selfUser } from '../utils/publicUser.js'
import { sendStoredFile } from '../utils/sendStoredFile.js'

export async function search(req, res) {
  res.json(await friendService.searchByUsername(req.user._id, req.valid.query.username))
}

export async function updateMe(req, res) {
  const user = await profileService.updateProfile(req.user._id, req.valid.body)
  res.json({ user: selfUser(user) })
}

export async function setAvatar(req, res) {
  const user = await profileService.setAvatar(req.user._id, req.file)
  res.json({ user: selfUser(user) })
}

export async function removeAvatar(req, res) {
  const user = await profileService.removeAvatar(req.user._id)
  res.json({ user: selfUser(user) })
}

export async function avatar(req, res, next) {
  const file = await profileService.getAvatar(req.valid.params.id)
  // The URL carries ?v=<file id>. When it matches, this exact picture can
  // never change, so the browser may cache it for a year.
  const current = req.valid.query.v === String(file.fileId)
  sendStoredFile(req, res, next, {
    ...file,
    inline: true,
    cache: current ? 'private, max-age=31536000, immutable' : 'private, no-cache',
  })
}
