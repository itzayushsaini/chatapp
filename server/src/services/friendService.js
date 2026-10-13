import mongoose from 'mongoose'

import { Block } from '../models/Block.js'
import { Conversation } from '../models/Conversation.js'
import { Friendship } from '../models/Friendship.js'
import { Message } from '../models/Message.js'
import { User } from '../models/User.js'
import { emitToUser } from '../socket/emitter.js'
import { AppError } from '../utils/AppError.js'
import { escapeRegex } from '../utils/escapeRegex.js'
import { pairKey } from '../utils/pairKey.js'
import { publicUser } from '../utils/publicUser.js'
import { isOnline } from './presenceService.js'
import { notifyFriendRequest, notifyRequestAccepted } from './pushService.js'

const DECLINE_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000

const sameId = (a, b) => String(a) === String(b)

const PUBLIC_FIELDS = 'username displayName bio avatarFileId'

function requestItem(friendship, otherUser) {
  return {
    id: String(friendship._id),
    user: publicUser(otherUser),
    createdAt: friendship.updatedAt,
  }
}

function lastMessageView(lastMessage) {
  if (!lastMessage?.createdAt) return null
  return {
    text: lastMessage.text,
    senderId: String(lastMessage.sender),
    createdAt: lastMessage.createdAt,
    attachment: lastMessage.attachment?.kind
      ? { kind: lastMessage.attachment.kind, name: lastMessage.attachment.name }
      : null,
  }
}

function friendItem(friendUser, conversation, meId, hidePreview = false) {
  return {
    friend: publicUser(friendUser),
    conversationId: String(conversation._id),
    lastMessage: hidePreview ? null : lastMessageView(conversation.lastMessage),
    online: isOnline(friendUser._id),
    lastSeen: friendUser.lastSeen ?? null,
    muted: (conversation.mutedBy ?? []).some((id) => sameId(id, meId)),
  }
}

// 404, not 403, so outsiders can't tell the chat exists
export async function assertParticipant(conversationId, userId) {
  const conversation = mongoose.isValidObjectId(conversationId)
    ? await Conversation.findOne({ _id: conversationId, participants: userId })
    : null
  if (!conversation) throw new AppError(404, 'Conversation not found')
  return conversation
}

export async function assertFriends(userA, userB) {
  const friends = await Friendship.exists({ pairKey: pairKey(userA, userB), status: 'accepted' })
  if (!friends) throw new AppError(403, 'You can only message friends')
}

export async function getFriendIds(userId) {
  const friendships = await Friendship.find(
    { status: 'accepted', $or: [{ requester: userId }, { recipient: userId }] },
    { requester: 1, recipient: 1 },
  )
  return friendships.map((f) =>
    sameId(f.requester, userId) ? String(f.recipient) : String(f.requester),
  )
}

export async function getContactIds(userId) {
  const friendships = await Friendship.find(
    {
      status: { $in: ['accepted', 'pending'] },
      $or: [{ requester: userId }, { recipient: userId }],
    },
    { requester: 1, recipient: 1 },
  )
  return friendships.map((f) =>
    sameId(f.requester, userId) ? String(f.recipient) : String(f.requester),
  )
}

export async function searchByUsername(meId, username) {
  const user = await User.findOne({ username })
  // a block looks exactly like "no such user", so it can't be discovered
  if (!user || (await isBlockedEitherWay(meId, user._id))) throw new AppError(404, 'No user found')

  return { user: publicUser(user), relationship: await relationshipWith(meId, user._id) }
}

// Capped results (plus the route's 3-char minimum and rate limit) stop this dumping the user list
export const FIND_LIMIT = 20

export async function findUsers(meId, text) {
  const pattern = new RegExp(escapeRegex(text), 'i')
  const blocks = await Block.find({ $or: [{ blocker: meId }, { blocked: meId }] }, { blocker: 1, blocked: 1 })
  const hidden = blocks.map((b) => (sameId(b.blocker, meId) ? b.blocked : b.blocker))

  const users = await User.find({
    _id: { $nin: [meId, ...hidden] },
    suspended: { $ne: true },
    $or: [{ displayName: pattern }, { username: pattern }],
  })
    .collation({ locale: 'en' })
    .sort({ displayName: 1, _id: 1 })
    .limit(FIND_LIMIT * 3)

  const lower = text.toLowerCase()
  const rank = (u) =>
    u.username === lower ? 0 : u.username.startsWith(lower) || u.displayName.toLowerCase().startsWith(lower) ? 1 : 2
  const top = users.sort((a, b) => rank(a) - rank(b)).slice(0, FIND_LIMIT)

  const friendships = await Friendship.find({ pairKey: { $in: top.map((u) => pairKey(meId, u._id)) } })
  const byKey = new Map(friendships.map((f) => [f.pairKey, f]))
  return {
    users: top.map((u) => ({
      user: publicUser(u),
      relationship: relationshipFrom(meId, byKey.get(pairKey(meId, u._id))),
    })),
  }
}

function relationshipFrom(meId, friendship) {
  // declined shows as 'none' so the requester is never told they were declined
  if (!friendship || friendship.status === 'declined') return 'none'
  if (friendship.status === 'accepted') return 'friends'
  return sameId(friendship.requester, meId) ? 'pending_outgoing' : 'pending_incoming'
}

async function relationshipWith(meId, otherId) {
  if (sameId(meId, otherId)) return 'self'
  return relationshipFrom(meId, await Friendship.findOne({ pairKey: pairKey(meId, otherId) }))
}

export async function sendRequest(meId, username) {
  const target = await User.findOne({ username })
  if (!target || (await isBlockedEitherWay(meId, target._id))) throw new AppError(404, 'No user found')
  if (sameId(target._id, meId)) throw new AppError(400, "You can't add yourself")

  const key = pairKey(meId, target._id)
  const existing = await Friendship.findOne({ pairKey: key })

  let friendship

  if (!existing) {
    try {
      friendship = await Friendship.create({
        pairKey: key,
        requester: meId,
        recipient: target._id,
        status: 'pending',
      })
    } catch (err) {
      // the unique pairKey index lets only one of two racing requests through
      if (err.code === 11000) throw new AppError(409, 'Request already sent')
      throw err
    }
  } else if (existing.status === 'pending') {
    if (sameId(existing.requester, meId)) throw new AppError(409, 'Request already sent')
    return { friend: await acceptRequest(meId, existing._id) }
  } else if (existing.status === 'accepted') {
    throw new AppError(409, 'Already friends')
  } else {
    const recentlyDeclined =
      sameId(existing.requester, meId) &&
      existing.respondedAt > new Date(Date.now() - DECLINE_COOLDOWN_MS)
    if (recentlyDeclined) throw new AppError(429, 'You can send another request later')

    // the status: 'declined' filter makes a double click harmless
    friendship = await Friendship.findOneAndUpdate(
      { _id: existing._id, status: 'declined' },
      {
        $set: { requester: meId, recipient: target._id, status: 'pending' },
        $unset: { respondedAt: 1 },
      },
      { new: true },
    )
    if (!friendship) throw new AppError(409, 'Request already sent')
  }

  const me = await User.findById(meId)
  emitToUser(target._id, 'friend:request:new', { request: requestItem(friendship, me) })
  notifyFriendRequest(target._id, me)

  return { request: requestItem(friendship, target) }
}

export async function acceptRequest(meId, requestId) {
  // One atomic update: only the recipient can accept, and a double click can't accept twice
  const friendship = await Friendship.findOneAndUpdate(
    { _id: requestId, recipient: meId, status: 'pending' },
    { status: 'accepted', respondedAt: new Date() },
    { new: true },
  )
  if (!friendship) throw new AppError(404, 'Request not found')

  const participants = [friendship.requester, friendship.recipient].sort((a, b) =>
    String(a).localeCompare(String(b)),
  )
  const conversation = await Conversation.findOneAndUpdate(
    { pairKey: friendship.pairKey },
    { $setOnInsert: { pairKey: friendship.pairKey, participants } },
    { upsert: true, new: true },
  )

  const [me, requester] = await Promise.all([
    User.findById(meId),
    User.findById(friendship.requester),
  ])
  const itemForMe = friendItem(requester, conversation, me._id)
  const itemForRequester = friendItem(me, conversation, requester._id)

  emitToUser(requester._id, 'friend:request:accepted', { friend: itemForRequester })
  emitToUser(me._id, 'friend:request:accepted', { friend: itemForMe })
  notifyRequestAccepted(requester._id, me, conversation._id)

  if (isOnline(requester._id)) {
    emitToUser(me._id, 'presence:update', { userId: String(requester._id), online: true })
  }
  if (isOnline(me._id)) {
    emitToUser(requester._id, 'presence:update', { userId: String(me._id), online: true })
  }

  return itemForMe
}

export async function declineRequest(meId, requestId) {
  const friendship = await Friendship.findOneAndUpdate(
    { _id: requestId, recipient: meId, status: 'pending' },
    { status: 'declined', respondedAt: new Date() },
  )
  if (!friendship) throw new AppError(404, 'Request not found')
  // deliberately no event: the requester is not told
}

export async function cancelRequest(meId, requestId) {
  const friendship = await Friendship.findOneAndDelete({
    _id: requestId,
    requester: meId,
    status: 'pending',
  })
  if (!friendship) throw new AppError(404, 'Request not found')

  emitToUser(friendship.recipient, 'friend:request:cancelled', { requestId: String(requestId) })
}

export async function unfriend(meId, otherUserId) {
  const friendship = await Friendship.findOneAndDelete({
    pairKey: pairKey(meId, otherUserId),
    status: 'accepted',
  })
  if (!friendship) throw new AppError(404, 'Friend not found')

  // the conversation is kept; it becomes read-only because sending checks friendship
  emitToUser(meId, 'friend:removed', { userId: String(otherUserId) })
  emitToUser(otherUserId, 'friend:removed', { userId: String(meId) })
}

export async function listFriends(meId) {
  const friendships = await Friendship.find({
    status: 'accepted',
    $or: [{ requester: meId }, { recipient: meId }],
  })
  if (friendships.length === 0) return []

  const friendIds = friendships.map((f) =>
    sameId(f.requester, meId) ? f.recipient : f.requester,
  )
  const [users, conversations] = await Promise.all([
    User.find({ _id: { $in: friendIds } }),
    Conversation.find({ pairKey: { $in: friendships.map((f) => f.pairKey) } }),
  ])
  const userById = new Map(users.map((u) => [String(u._id), u]))
  const conversationByKey = new Map(conversations.map((c) => [c.pairKey, c]))

  // the preview is shared, so hide it from me if I deleted that message for me
  const previewIds = conversations.map((c) => c.lastMessage?.messageId).filter(Boolean)
  const hiddenFromMe = new Set(
    (await Message.find({ _id: { $in: previewIds }, deletedFor: meId }, { _id: 1 })).map((m) =>
      String(m._id),
    ),
  )

  const rows = friendships
    .map((f) => {
      const user = userById.get(String(sameId(f.requester, meId) ? f.recipient : f.requester))
      const conversation = conversationByKey.get(f.pairKey)
      if (!user || !conversation) return null
      const hide = hiddenFromMe.has(String(conversation.lastMessage?.messageId))
      return { item: friendItem(user, conversation, meId, hide), friendsSince: f.respondedAt }
    })
    .filter(Boolean)

  rows.sort((a, b) => {
    const aTime = a.item.lastMessage?.createdAt
    const bTime = b.item.lastMessage?.createdAt
    if (aTime && bTime) return bTime - aTime
    if (aTime) return -1
    if (bTime) return 1
    return (b.friendsSince ?? 0) - (a.friendsSince ?? 0)
  })

  return rows.map((r) => r.item)
}

export async function listRequests(meId) {
  const [incoming, outgoing] = await Promise.all([
    Friendship.find({ recipient: meId, status: 'pending' })
      .sort({ updatedAt: -1 })
      .populate('requester', PUBLIC_FIELDS),
    Friendship.find({ requester: meId, status: 'pending' })
      .sort({ updatedAt: -1 })
      .populate('recipient', PUBLIC_FIELDS),
  ])

  return {
    incoming: incoming.filter((f) => f.requester).map((f) => requestItem(f, f.requester)),
    outgoing: outgoing.filter((f) => f.recipient).map((f) => requestItem(f, f.recipient)),
  }
}

export async function isBlockedEitherWay(userA, userB) {
  return Boolean(
    await Block.exists({
      $or: [
        { blocker: userA, blocked: userB },
        { blocker: userB, blocked: userA },
      ],
    }),
  )
}

export async function blockUser(meId, otherId) {
  if (sameId(meId, otherId)) throw new AppError(400, "You can't block yourself")
  if (!(await User.exists({ _id: otherId }))) throw new AppError(404, 'User not found')

  await Block.updateOne(
    { blocker: meId, blocked: otherId },
    { $setOnInsert: { blocker: meId, blocked: otherId } },
    { upsert: true },
  )

  const friendship = await Friendship.findOneAndDelete({ pairKey: pairKey(meId, otherId) })
  if (friendship?.status === 'accepted') {
    emitToUser(meId, 'friend:removed', { userId: String(otherId) })
    emitToUser(otherId, 'friend:removed', { userId: String(meId) })
  } else if (friendship?.status === 'pending') {
    const requestId = String(friendship._id)
    emitToUser(meId, 'friend:request:cancelled', { requestId })
    emitToUser(otherId, 'friend:request:cancelled', { requestId })
  }
}

export async function unblockUser(meId, otherId) {
  await Block.deleteOne({ blocker: meId, blocked: otherId })
}

export async function listBlocked(meId) {
  const blocks = await Block.find({ blocker: meId })
    .sort({ createdAt: -1 })
    .populate('blocked', PUBLIC_FIELDS)
  return blocks.filter((b) => b.blocked).map((b) => publicUser(b.blocked))
}
