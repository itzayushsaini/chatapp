import { Block } from '../models/Block.js'
import { Friendship } from '../models/Friendship.js'
import { Message } from '../models/Message.js'
import { User } from '../models/User.js'
import { disconnectUser, emitToUser } from '../socket/emitter.js'
import { AppError } from '../utils/AppError.js'
import { clearHistory as clearAiHistory, countAllAnswersToday } from './aiService.js'
import { isOnline } from './presenceService.js'

const sameId = (a, b) => String(a) === String(b)

// Escapes a search string so it is safe to drop into a RegExp - without
// this, a search containing regex syntax (e.g. ".*") could behave oddly or,
// with a pathological pattern, run slowly (ReDoS).
function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// More detail than PublicUser/SelfUser - this is for the admin's own list,
// never sent to anyone else.
function adminUserView(user) {
  return {
    id: String(user._id),
    username: user.username,
    displayName: user.displayName,
    email: user.email,
    isAdmin: user.isAdmin,
    suspended: user.suspended,
    online: isOnline(user._id),
    lastSeen: user.lastSeen ?? null,
    createdAt: user.createdAt,
  }
}

// Unlike the exact-only username search everyone else uses (see
// friendService.searchByUsername), an admin's own search is deliberately a
// partial, case-insensitive match on username OR email - that is the whole
// point of an admin user list, and it is only ever reachable by an account
// with isAdmin already true.
export async function listUsers({ search, page = 1, limit = 20 }) {
  const filter = search
    ? {
        $or: [
          { username: new RegExp(escapeRegex(search), 'i') },
          { email: new RegExp(escapeRegex(search), 'i') },
        ],
      }
    : {}

  const skip = (Math.max(page, 1) - 1) * limit
  const [users, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    User.countDocuments(filter),
  ])

  return { users: users.map(adminUserView), total, page, limit }
}

export async function suspendUser(meId, userId) {
  if (sameId(meId, userId)) throw new AppError(400, "You can't suspend your own account")

  const user = await User.findByIdAndUpdate(userId, { suspended: true }, { new: true })
  if (!user) throw new AppError(404, 'User not found')

  // Ends their session on every open tab right now - otherwise they could
  // keep chatting until whatever token they are holding expires on its own.
  disconnectUser(userId)
  return adminUserView(user)
}

export async function unsuspendUser(userId) {
  const user = await User.findByIdAndUpdate(userId, { suspended: false }, { new: true })
  if (!user) throw new AppError(404, 'User not found')
  return adminUserView(user)
}

// A genuinely destructive, hard delete of the account. Their Friendships are
// removed too, so they vanish live from every friend's Chats/Requests list -
// exactly the same client-side path already used for an ordinary unfriend
// (friend:removed) or a cancelled request (friend:request:cancelled), reused
// here rather than inventing a new event. Their past MESSAGES and
// CONVERSATIONS are deliberately left alone: the other participant's history
// is not destroyed, the same principle as an ordinary unfriend keeping the
// conversation (see friendService.unfriend). Their PingMe AI chat, on the
// other hand, is private to them alone, so it goes with the account.
export async function deleteUser(meId, userId) {
  if (sameId(meId, userId)) throw new AppError(400, "You can't delete your own account")

  const user = await User.findById(userId)
  if (!user) throw new AppError(404, 'User not found')

  const friendships = await Friendship.find({ $or: [{ requester: userId }, { recipient: userId }] })
  await Friendship.deleteMany({ _id: { $in: friendships.map((f) => f._id) } })
  await Block.deleteMany({ $or: [{ blocker: userId }, { blocked: userId }] })
  await clearAiHistory(userId)
  await User.deleteOne({ _id: userId })

  for (const f of friendships) {
    const otherId = sameId(f.requester, userId) ? f.recipient : f.requester
    if (f.status === 'accepted') {
      emitToUser(otherId, 'friend:removed', { userId: String(userId) })
    } else if (f.status === 'pending' && sameId(f.requester, userId)) {
      // The deleted account had sent this request - tell the recipient it's
      // gone. (A pending request where the deleted account was the
      // RECIPIENT has no live event to send - the requester's own outgoing
      // list simply reflects it on next refetch, same as an expired one.)
      emitToUser(otherId, 'friend:request:cancelled', { requestId: String(f._id) })
    }
  }

  disconnectUser(userId)
}

export async function getStats() {
  const [totalUsers, totalMessages, onlineNow, aiAnswersToday] = await Promise.all([
    User.countDocuments(),
    Message.countDocuments(),
    countOnlineUsers(),
    countAllAnswersToday(),
  ])
  return { totalUsers, totalMessages, onlineNow, aiAnswersToday }
}

// There is no single "list everyone online" call in presenceService (it only
// answers "is THIS one user online"), so this counts by checking every user -
// fine at this app's scale, and avoids adding a second, parallel tracking
// structure just for a number shown on one admin screen.
async function countOnlineUsers() {
  const ids = await User.find({}, { _id: 1 })
  return ids.reduce((count, u) => count + (isOnline(u._id) ? 1 : 0), 0)
}
