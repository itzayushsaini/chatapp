import mongoose from 'mongoose'

import { Block } from '../models/Block.js'
import { Conversation } from '../models/Conversation.js'
import { Friendship } from '../models/Friendship.js'
import { Message } from '../models/Message.js'
import { User } from '../models/User.js'
import { emitToUser } from '../socket/emitter.js'
import { AppError } from '../utils/AppError.js'
import { pairKey } from '../utils/pairKey.js'
import { publicUser } from '../utils/publicUser.js'
import { isOnline } from './presenceService.js'
import { notifyFriendRequest, notifyRequestAccepted } from './pushService.js'

const DECLINE_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000

const sameId = (a, b) => String(a) === String(b)

// The User fields publicUser() needs, for populate() calls.
const PUBLIC_FIELDS = 'username displayName bio avatarFileId'

// ---------------------------------------------------------------------------
// Response shapes
// ---------------------------------------------------------------------------

// A pending request as shown in a list. `user` is the OTHER person.
//
// We report updatedAt, not createdAt: a declined request that is sent again
// reuses the same document, and its last update is when it became pending.
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
    // Enough for a "📷 Photo" / "📄 report.pdf" preview in the sidebar.
    attachment: lastMessage.attachment?.kind
      ? { kind: lastMessage.attachment.kind, name: lastMessage.attachment.name }
      : null,
  }
}

// One row of the Chats list. online/lastSeen are only ever built here, and
// this is only ever sent to a friend - never to strangers. `meId` is whose
// list this row is for (mute is per person). `hidePreview` is set when the
// preview message is one I deleted "for me" or cleared from this chat.
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

// ---------------------------------------------------------------------------
// Enforcement - every message read or write MUST go through these
// ---------------------------------------------------------------------------

// Returns the conversation if `userId` is in it. Otherwise 404, not 403, so
// that an outsider cannot even learn that the conversation exists.
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

// Looked up fresh every time it is needed (presence), rather than cached, so
// it can never be out of date after an accept or an unfriend.
export async function getFriendIds(userId) {
  const friendships = await Friendship.find(
    { status: 'accepted', $or: [{ requester: userId }, { recipient: userId }] },
    { requester: 1, recipient: 1 },
  )
  return friendships.map((f) =>
    sameId(f.requester, userId) ? String(f.recipient) : String(f.requester),
  )
}

// Friends AND people with a pending request either way - everyone who has
// this user in one of their lists and so needs to hear about a profile change.
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

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

// EXACT match only. A partial or prefix search would let anyone list every
// account by searching "a", "b", "c"... which is what this app must prevent.
export async function searchByUsername(meId, username) {
  const user = await User.findOne({ username })
  // Blocked either way looks exactly like "no such user" - neither side can
  // tell a block from a typo, so a block can never be discovered this way.
  if (!user || (await isBlockedEitherWay(meId, user._id))) throw new AppError(404, 'No user found')

  return { user: publicUser(user), relationship: await relationshipWith(meId, user._id) }
}

async function relationshipWith(meId, otherId) {
  if (sameId(meId, otherId)) return 'self'

  const friendship = await Friendship.findOne({ pairKey: pairKey(meId, otherId) })
  // A declined request is shown as 'none' to BOTH sides, so the requester is
  // never told that they were declined.
  if (!friendship || friendship.status === 'declined') return 'none'
  if (friendship.status === 'accepted') return 'friends'
  return sameId(friendship.requester, meId) ? 'pending_outgoing' : 'pending_incoming'
}

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

// Returns { request } for a new request, or { friend } if it turned into an
// accept (they had already asked me). The checks run in the order the spec
// lists them.
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
      // Two requests for the same pair at the same instant: the unique index
      // lets exactly one through, and the loser lands here.
      if (err.code === 11000) throw new AppError(409, 'Request already sent')
      throw err
    }
  } else if (existing.status === 'pending') {
    if (sameId(existing.requester, meId)) throw new AppError(409, 'Request already sent')
    // They already asked me - my request means "yes".
    return { friend: await acceptRequest(meId, existing._id) }
  } else if (existing.status === 'accepted') {
    throw new AppError(409, 'Already friends')
  } else {
    // Declined. If they declined MY request recently, make me wait, so a
    // declined request cannot be used to pester someone.
    const recentlyDeclined =
      sameId(existing.requester, meId) &&
      existing.respondedAt > new Date(Date.now() - DECLINE_COOLDOWN_MS)
    if (recentlyDeclined) throw new AppError(429, 'You can send another request later')

    // Otherwise reuse the same document as a fresh request from me. The
    // status: 'declined' condition makes this safe against a double click.
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
  notifyFriendRequest(target._id, me) // a push, if they have PingMe closed

  return { request: requestItem(friendship, target) }
}

export async function acceptRequest(meId, requestId) {
  // ONE atomic operation. The filter does the security work:
  //   recipient: me      -> only the person who was asked can accept
  //   status: 'pending'  -> a double click cannot accept twice
  const friendship = await Friendship.findOneAndUpdate(
    { _id: requestId, recipient: meId, status: 'pending' },
    { status: 'accepted', respondedAt: new Date() },
    { new: true },
  )
  if (!friendship) throw new AppError(404, 'Request not found')

  // Upsert: create the conversation the first time, reuse the old one (and
  // its history) if this pair were friends before.
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

  // The requester learns they have a new friend. My own other tabs get the
  // same news (the tab that clicked Accept also gets the HTTP response, and
  // the client ignores a friend it already has).
  emitToUser(requester._id, 'friend:request:accepted', { friend: itemForRequester })
  emitToUser(me._id, 'friend:request:accepted', { friend: itemForMe })
  notifyRequestAccepted(requester._id, me, conversation._id) // a push, if PingMe is closed

  // Now that they are friends, each may see the other's presence.
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
  // Deliberately no notification: the requester is not told.
}

export async function cancelRequest(meId, requestId) {
  // Only the requester can cancel, and only while it is still pending.
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

  // The Conversation and its messages are kept. Sending checks friendship,
  // so the chat simply becomes read-only.
  emitToUser(meId, 'friend:removed', { userId: String(otherUserId) })
  emitToUser(otherUserId, 'friend:removed', { userId: String(meId) })
}

// ---------------------------------------------------------------------------
// Lists
// ---------------------------------------------------------------------------

export async function listFriends(meId) {
  const friendships = await Friendship.find({
    status: 'accepted',
    $or: [{ requester: meId }, { recipient: meId }],
  })
  if (friendships.length === 0) return []

  // Two queries for the whole list, not two per friend.
  const friendIds = friendships.map((f) =>
    sameId(f.requester, meId) ? f.recipient : f.requester,
  )
  const [users, conversations] = await Promise.all([
    User.find({ _id: { $in: friendIds } }),
    Conversation.find({ pairKey: { $in: friendships.map((f) => f.pairKey) } }),
  ])
  const userById = new Map(users.map((u) => [String(u._id), u]))
  const conversationByKey = new Map(conversations.map((c) => [c.pairKey, c]))

  // The preview is shared by both people, but a message I deleted "for me"
  // (or cleared along with the whole chat) must not show in MY list. One
  // query for the whole list finds which previews those are.
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

  // Most recent message first. Friends with no messages yet go last, newest
  // friendship first.
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

  // populate() gives null if that account has since been deleted - skip it.
  return {
    incoming: incoming.filter((f) => f.requester).map((f) => requestItem(f, f.requester)),
    outgoing: outgoing.filter((f) => f.recipient).map((f) => requestItem(f, f.recipient)),
  }
}

// ---------------------------------------------------------------------------
// Blocking
// ---------------------------------------------------------------------------

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

// Blocking ends any friendship or pending request between us (they vanish
// live from both lists, through the same events as an unfriend or a
// cancelled request), and from then on neither of us can find the other by
// username or send a request. The conversation and its history are kept,
// exactly as after an unfriend - it simply becomes read-only.
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
    // Gone from whichever side's Requests list it was in.
    const requestId = String(friendship._id)
    emitToUser(meId, 'friend:request:cancelled', { requestId })
    emitToUser(otherId, 'friend:request:cancelled', { requestId })
  }
}

export async function unblockUser(meId, otherId) {
  await Block.deleteOne({ blocker: meId, blocked: otherId })
}

// The people I have blocked, for the Settings page - newest first.
export async function listBlocked(meId) {
  const blocks = await Block.find({ blocker: meId })
    .sort({ createdAt: -1 })
    .populate('blocked', PUBLIC_FIELDS)
  // populate() gives null if that account has since been deleted.
  return blocks.filter((b) => b.blocked).map((b) => publicUser(b.blocked))
}
