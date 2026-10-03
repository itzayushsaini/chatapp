import webpush from 'web-push'

import { env } from '../config/env.js'
import { Conversation } from '../models/Conversation.js'
import { PushSubscription } from '../models/PushSubscription.js'
import { User } from '../models/User.js'
import { publicUser } from '../utils/publicUser.js'
import { isOnline } from './presenceService.js'

// Web Push: notifications that reach a phone or computer even while PingMe
// is CLOSED.
//
// How it works:
//   1. When someone allows notifications, their browser creates a push
//      "subscription" - an address at its maker's push service (Google,
//      Mozilla, Apple, Microsoft) for that one device - and the app saves it
//      here (subscribe()).
//   2. When something happens and that person has PingMe open NOWHERE, we
//      post an encrypted message to that address (web-push does the
//      encryption and signs the request with our VAPID keys).
//   3. The push service wakes the device's PingMe service worker
//      (client/public/sw.js), which shows the notification.
//
// While PingMe IS open somewhere, nothing is pushed: the open app already
// shows its own notification from the socket event, and two would be one
// too many.
//
// Every notify* function is fire-and-forget: it is never awaited by the
// request that triggered it and never throws, so a slow or failing push
// service can never delay or break sending a message.

// How long a push service keeps trying to deliver to a phone that is off.
const TTL_SECONDS = 24 * 60 * 60

// The push services of the browsers people actually use. A subscription
// must point at one of these: otherwise anyone could make our server send
// requests to an address of their choosing (SSRF).
const PUSH_SERVICE_HOSTS = [
  'fcm.googleapis.com', // Chrome, Edge on Android, Samsung Internet, Opera, Brave
  'updates.push.services.mozilla.com', // Firefox
  'push.apple.com', // Safari, iPhone and iPad (web.push.apple.com)
  'notify.windows.com', // Edge on Windows (*.notify.windows.com)
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

// The push services ask who is sending (an https: or mailto: address).
function vapidSubject() {
  if (env.VAPID_SUBJECT) return env.VAPID_SUBJECT
  if (env.APP_URL.startsWith('https://')) return env.APP_URL
  return env.EMAIL_FROM_ADDRESS ? `mailto:${env.EMAIL_FROM_ADDRESS}` : 'mailto:pingme@example.com'
}

// ---------------------------------------------------------------------------
// Subscriptions
// ---------------------------------------------------------------------------

// Saves this device for me. Keyed by endpoint: if someone else used this
// browser before (and did not log out), the device now belongs to ME - it
// can never keep receiving their messages.
export async function subscribe(meId, { endpoint, keys }) {
  await PushSubscription.findOneAndUpdate(
    { endpoint },
    { user: meId, keys: { p256dh: keys.p256dh, auth: keys.auth } },
    { upsert: true },
  )
}

// Only my own - nobody can switch off someone else's notifications.
export async function unsubscribe(meId, endpoint) {
  await PushSubscription.deleteOne({ endpoint, user: meId })
}

// Every device of a user - after a password change or reset (the old
// sessions are signed out, so their devices must stop getting messages
// too), a suspension, or an account delete. The device still logged in
// simply subscribes again on its next page load.
export async function removeAllFor(userId) {
  await PushSubscription.deleteMany({ user: userId })
}

// ---------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------

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
    // 404 / 410: the browser threw this subscription away (notifications
    // turned off, app uninstalled, data cleared) - forget it for good.
    if (err.statusCode === 404 || err.statusCode === 410) {
      await PushSubscription.deleteOne({ _id: subscription._id })
    } else {
      console.warn(
        `Push to ${new URL(subscription.endpoint).hostname} failed (${err.statusCode ?? 'no HTTP status'})`,
      )
    }
  }
}

async function pushToUser(userId, payload) {
  if (!isPushConfigured() || isOnline(userId)) return
  const subscriptions = await PushSubscription.find({ user: userId })
  await Promise.all(subscriptions.map((s) => deliver(s, payload)))
}

// Runs a notify job without making anyone wait for it, and logs (never
// throws) if it fails. Returns the promise only so tests can wait for it.
function inBackground(job) {
  return job().catch((err) => console.error('Push notification failed:', err.message))
}

// A short, plain preview - like the sidebar's.
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

// The payload the service worker turns into a notification:
//   title, body, icon - what it shows
//   tag               - one notification per chat: a newer one replaces it
//   open              - what a tap opens: a conversation id, 'requests',
//                       'pingme-ai' or 'pingme-updates'

// A new message (or a forwarded one) for `recipientId`. Never for a chat
// they muted.
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

// A PingMe AI answer that finished while its owner had closed PingMe.
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

// A new post in the "PingMe" updates channel: everyone with notifications
// on who is not using PingMe right now.
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
