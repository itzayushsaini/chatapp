import { AiMessage } from '../models/AiMessage.js'
import { Block } from '../models/Block.js'
import { Friendship } from '../models/Friendship.js'
import { Message } from '../models/Message.js'
import { User } from '../models/User.js'
import { disconnectUser, emitToUser } from '../socket/emitter.js'
import { AppError } from '../utils/AppError.js'
import { escapeRegex } from '../utils/escapeRegex.js'
import { clearHistory as clearAiHistory, countAllAnswersToday } from './aiService.js'
import { isOnline } from './presenceService.js'
import { removeAllFor as removePushSubscriptions } from './pushService.js'

const sameId = (a, b) => String(a) === String(b)

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
// How the admin's user list can be ordered. A fixed list (never a field name
// taken from the request), so the sort can only ever be one of these.
const USER_SORTS = {
  newest: { createdAt: -1, _id: -1 },
  oldest: { createdAt: 1, _id: 1 },
  name: { displayName: 1, _id: 1 },
  lastSeen: { lastSeen: -1, _id: -1 },
}

export async function listUsers({ search, page = 1, limit = 20, sort = 'newest' }) {
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
    // The collation makes "name" ignore upper/lower case (Zoya after aman).
    User.find(filter).collation({ locale: 'en' }).sort(USER_SORTS[sort]).skip(skip).limit(limit),
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
  // Their devices also stop getting push notifications.
  disconnectUser(userId)
  await removePushSubscriptions(userId)
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
  await removePushSubscriptions(userId)
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

const DAY_MS = 24 * 60 * 60 * 1000

// How many new accounts, messages and PingMe AI answers there were on each of
// the last `days` days (today included), oldest first - the numbers behind
// the charts on the admin Overview. Days are UTC days, so the same chart is
// shown whatever time zone the admin is in; a day with nothing is 0, not
// missing, so the chart has no gaps.
export async function getActivity(days = 14) {
  const now = new Date()
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const start = new Date(today - (days - 1) * DAY_MS)

  // One grouped query per collection: documents since `start`, counted per
  // "YYYY-MM-DD". The createdAt indexes are not needed at this size.
  const perDay = async (Model, extra = {}) => {
    const rows = await Model.aggregate([
      { $match: { createdAt: { $gte: start }, ...extra } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'UTC' } }, count: { $sum: 1 } } },
    ])
    return new Map(rows.map((r) => [r._id, r.count]))
  }
  const [users, messages, aiAnswers] = await Promise.all([
    perDay(User),
    perDay(Message),
    perDay(AiMessage, { role: 'model', status: 'done' }),
  ])

  const series = []
  for (let i = 0; i < days; i++) {
    const date = new Date(start.getTime() + i * DAY_MS).toISOString().slice(0, 10)
    series.push({
      date,
      users: users.get(date) ?? 0,
      messages: messages.get(date) ?? 0,
      aiAnswers: aiAnswers.get(date) ?? 0,
    })
  }
  return { days: series }
}

// There is no single "list everyone online" call in presenceService (it only
// answers "is THIS one user online"), so this counts by checking every user -
// fine at this app's scale, and avoids adding a second, parallel tracking
// structure just for a number shown on one admin screen.
async function countOnlineUsers() {
  const ids = await User.find({}, { _id: 1 })
  return ids.reduce((count, u) => count + (isOnline(u._id) ? 1 : 0), 0)
}
