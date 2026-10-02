import * as aiService from '../services/aiService.js'
import { sendStoredFile } from '../utils/sendStoredFile.js'

// PingMe AI. Every handler only ever touches the logged-in user's OWN chat.

export async function summary(req, res) {
  res.json(await aiService.getSummary(req.user._id))
}

export async function history(req, res) {
  res.json(await aiService.getHistory(req.user._id, req.valid.query))
}

// Runs BEFORE an upload is read - see routes/ai.routes.js.
export async function checkCanAsk(req, res, next) {
  await aiService.assertCanAsk(req.user._id)
  next()
}

// 202 Accepted: the question is saved and the answer is on its way - it
// arrives over the socket (ai:delta, then ai:done), not in this response.
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
