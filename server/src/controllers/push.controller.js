import * as pushService from '../services/pushService.js'

// Web Push subscriptions - see services/pushService.js.

// The public half of our VAPID key pair. The browser needs it to create a
// subscription that only OUR server can send to. null = push is not set up
// on this server, so the browser should not try.
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
