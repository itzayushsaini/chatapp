import * as pushService from '../services/pushService.js'

// null means push is not set up on this server
export function key(req, res) {
  res.json({ publicKey: pushService.publicKey() })
}

export async function subscribe(req, res) {
  await pushService.subscribe(req.user._id, req.valid.body)
  res.status(204).end()
}

export async function unsubscribe(req, res) {
  await pushService.unsubscribe(req.user._id, req.valid.body.endpoint)
  res.status(204).end()
}
