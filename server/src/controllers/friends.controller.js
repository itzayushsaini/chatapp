import * as friendService from '../services/friendService.js'

export async function list(req, res) {
  res.json({ friends: await friendService.listFriends(req.user._id) })
}

export async function unfriend(req, res) {
  await friendService.unfriend(req.user._id, req.valid.params.userId)
  res.status(204).end()
}

export async function listRequests(req, res) {
  res.json(await friendService.listRequests(req.user._id))
}

// 201 { request } for a new request, or 200 { friend } when it turned into an
// accept because they had already asked me.
export async function sendRequest(req, res) {
  const result = await friendService.sendRequest(req.user._id, req.valid.body.username)
  res.status(result.request ? 201 : 200).json(result)
}

export async function accept(req, res) {
  res.json({ friend: await friendService.acceptRequest(req.user._id, req.valid.params.id) })
}

export async function decline(req, res) {
  await friendService.declineRequest(req.user._id, req.valid.params.id)
  res.status(204).end()
}

export async function cancel(req, res) {
  await friendService.cancelRequest(req.user._id, req.valid.params.id)
  res.status(204).end()
}
