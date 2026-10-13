import webpush from 'web-push'

import { env } from '../config/env.js'
import { Conversation } from '../models/Conversation.js'
import { PushSubscription } from '../models/PushSubscription.js'
import { User } from '../models/User.js'
import { publicUser } from '../utils/publicUser.js'
import { isOnline } from './presenceService.js'

const TTL_SECONDS = 24 * 60 * 60

// Allowlist, so nobody can make our server post to an address of their choosing (SSRF)
const PUSH_SERVICE_HOSTS = [
  'fcm.googleapis.com',
  'updates.push.services.mozilla.com',
  'push.apple.com',
  'notify.windows.com',
]

export function isPushServiceUrl(url) {
  try {
    const { protocol, hostname } = new URL(url)
    return (
      protocol === 'https:' &&
      PUSH_SERVICE_HOSTS.some((host) => hostname === host || hostname.endsWith(`.${host}`))
    )
  } catch {
    return false
  }
}

export const isPushConfigured = () => Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY)

export const publicKey = () => (isPushConfigured() ? env.VAPID_PUBLIC_KEY : null)

function vapidSubject() {
  if (env.VAPID_SUBJECT) return env.VAPID_SUBJECT
  if (env.APP_URL.startsWith('https://')) return env.APP_URL
  return env.EMAIL_FROM_ADDRESS ? `mailto:${env.EMAIL_FROM_ADDRESS}` : 'mailto:pingme@example.com'
}

// Keyed by endpoint, so a shared browser moves to the new account and stops getting the old one's pushes
export async function subscribe(meId, { endpoint, keys }) {
  await PushSubscription.findOneAndUpdate(
    { endpoint },
    { user: meId, keys: { p256dh: keys.p256dh, auth: keys.auth } },
    { upsert: true },
  )
}

export async function unsubscribe(meId, endpoint) {
  await PushSubscription.deleteOne({ endpoint, user: meId })
}

export async function removeAllFor(userId) {
  await PushSubscription.deleteMany({ user: userId })
}

async function deliver(subscription, payload) {
  try {
    await webpush.sendNotification(
      { endpoint: subscription.endpoint, keys: subscription.keys },
      JSON.stringify(payload),
      {
        TTL: TTL_SECONDS,
        urgency: 'high',
        vapidDetails: {
          subject: vapidSubject(),
          publicKey: env.VAPID_PUBLIC_KEY,
          privateKey: env.VAPID_PRIVATE_KEY,
        },
      },
    )
  } catch (err) {
    // 404/410 means the browser dropped this subscription for good
    if (err.statusCode === 404 || err.statusCode === 410) {
      await PushSubscription.deleteOne({ _id: subscription._id })
    } else {
      console.warn(
        `Push to ${new URL(subscription.endpoint).hostname} failed (${err.statusCode ?? 'no HTTP status'})`,
      )
    }
  }
}

// Only when PingMe is open nowhere; an open tab already shows its own notification
async function pushToUser(userId, payload) {
  if (!isPushConfigured() || isOnline(userId)) return
  const subscriptions = await PushSubscription.find({ user: userId })
  await Promise.all(subscriptions.map((s) => deliver(s, payload)))
}

// Never awaited and never throws, so a slow push service can't delay or break a message
function inBackground(job) {
  return job().catch((err) => console.error('Push notification failed:', err.message))
}

function preview(text, max = 120) {
  const plain = text.replace(/\s+/g, ' ').trim()
  return plain.length > max ? `${plain.slice(0, max - 1)}…` : plain
}

function attachmentLabel(attachment, caption) {
  if (attachment.kind === 'audio') return '🎤 Voice message'
  if (attachment.kind === 'image') return `📷 ${caption || 'Photo'}`
  if (attachment.kind === 'video') return `🎥 ${caption || 'Video'}`
  return `📄 ${attachment.name}`
}

export function notifyNewMessage(recipientId, message) {
  return inBackground(async () => {
    if (!isPushConfigured() || isOnline(recipientId)) return
    const [conversation, sender] = await Promise.all([
      Conversation.findById(message.conversationId, { mutedBy: 1 }),
      User.findById(message.senderId),
    ])
    if (!sender || conversation?.mutedBy?.some((id) => String(id) === String(recipientId))) return
    await pushToUser(recipientId, {
      title: sender.displayName,
      body: message.attachment ? attachmentLabel(message.attachment, preview(message.text)) : preview(message.text),
      icon: publicUser(sender).avatarUrl ?? undefined,
      tag: `chat-${message.conversationId}`,
      open: message.conversationId,
    })
  })
}

export function notifyFriendRequest(recipientId, requester) {
  return inBackground(() =>
    pushToUser(recipientId, {
      title: 'New friend request',
      body: `${requester.displayName} (@${requester.username}) wants to chat with you`,
      icon: publicUser(requester).avatarUrl ?? undefined,
      tag: 'friend-requests',
      open: 'requests',
    }),
  )
}

export function notifyRequestAccepted(requesterId, accepter, conversationId) {
  return inBackground(() =>
    pushToUser(requesterId, {
      title: `${accepter.displayName} accepted your friend request`,
      body: 'You can chat now - say hi 👋',
      icon: publicUser(accepter).avatarUrl ?? undefined,
      tag: `chat-${conversationId}`,
      open: String(conversationId),
    }),
  )
}

export function notifyAiAnswer(userId, answer) {
  return inBackground(() =>
    pushToUser(userId, {
      title: 'PingMe AI',
      body: preview(answer.text.replace(/[*_`#>|~]/g, '')) || '📷 Picture',
      tag: 'pingme-ai',
      open: 'pingme-ai',
    }),
  )
}

export function notifyUpdatePosted(update) {
  return inBackground(async () => {
    if (!isPushConfigured()) return
    const payload = {
      title: 'PingMe',
      body: update.text ? preview(update.text) : '📷 Photo',
      tag: 'pingme-updates',
      open: 'pingme-updates',
    }
    const subscriptions = await PushSubscription.find()
    await Promise.all(subscriptions.filter((s) => !isOnline(s.user)).map((s) => deliver(s, payload)))
  })
}
