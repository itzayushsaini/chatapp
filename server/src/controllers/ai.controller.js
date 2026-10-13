import * as aiService from '../services/aiService.js'
import { sendStoredFile } from '../utils/sendStoredFile.js'

export async function summary(req, res) {
  res.json(await aiService.getSummary(req.user._id))
}

export async function history(req, res) {
  res.json(await aiService.getHistory(req.user._id, req.valid.query))
}

// Runs before multer reads any upload
export async function checkCanAsk(req, res, next) {
  await aiService.assertCanAsk(req.user._id)
  next()
}

// 202: the answer arrives over the socket (ai:delta, ai:done), not here
export async function ask(req, res) {
  res.status(202).json(await aiService.ask(req.user._id, req.valid.body, req.file))
}

export async function forward(req, res) {
  res.status(202).json(await aiService.forward(req.user._id, req.valid.body))
}

export async function retry(req, res) {
  res.status(202).json({ answer: await aiService.retry(req.user._id) })
}

export function stop(req, res) {
  aiService.stop(req.user._id)
  res.status(204).end()
}

export async function clear(req, res) {
  await aiService.clearHistory(req.user._id)
  res.status(204).end()
}

export async function file(req, res, next) {
  const stored = await aiService.getFile(req.user._id, req.valid.params.id)
  sendStoredFile(req, res, next, { ...stored, cache: 'private, max-age=86400' })
}
