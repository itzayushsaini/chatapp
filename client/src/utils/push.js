import { deletePushSubscription, getPushKey, savePushSubscription } from '../api/push.js'
import { notificationsEnabled } from './notifications.js'

// Web Push: notifications that arrive even while PingMe is CLOSED.
//
// The browser creates a "push subscription" - an address at its maker's push
// service for this one device - and we hand it to our server, which posts
// to it when something happens and the user has PingMe open nowhere. The
// service worker (public/sw.js) shows what arrives.
//
// On an iPhone this only exists once PingMe is installed to the Home Screen
// (Apple's rule) - in a Safari tab, pushSupported() is false.

export function pushSupported() {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

// The server's key is base64url text; the browser wants the raw bytes.
function keyToBytes(base64url) {
  const base64 = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))
}

function sameKey(buffer, base64url) {
  if (!buffer) return false
  const a = new Uint8Array(buffer)
  const b = keyToBytes(base64url)
  return a.length === b.length && a.every((byte, i) => byte === b[i])
}

async function currentSubscription() {
  if (!pushSupported()) return null
  const registration = await navigator.serviceWorker.getRegistration()
  return (await registration?.pushManager.getSubscription()) ?? null
}

// Makes sure THIS device is subscribed and the server knows it - if the
// user allowed notifications and has them switched on here. Safe to call as
// often as we like (on every app start, after logging in, after enabling
// notifications, after a password change): the server stores each device
// once. Resolves to true if this device will get push notifications.
export async function ensurePushSubscription() {
  if (!pushSupported() || Notification.permission !== 'granted' || !notificationsEnabled()) return false
  const publicKey = await getPushKey()
  if (!publicKey) return false // push is not set up on this server

  const registration = await navigator.serviceWorker.ready
  let subscription = await registration.pushManager.getSubscription()
  // Made with an older server key: it can't be reused, so start again.
  if (subscription && !sameKey(subscription.options.applicationServerKey, publicKey)) {
    await subscription.unsubscribe()
    subscription = null
  }
  subscription ??= await registration.pushManager.subscribe({
    userVisibleOnly: true, // every push shows a notification - browsers require it
    applicationServerKey: keyToBytes(publicKey),
  })
  await savePushSubscription(subscription.toJSON())
  return true
}

// This device stops getting push notifications: when notifications are
// switched off here, and on logout - so on a shared computer the next person
// never sees the previous one's messages. Never throws.
export async function removePushSubscription() {
  try {
    const subscription = await currentSubscription()
    if (!subscription) return
    await deletePushSubscription(subscription.endpoint).catch(() => {})
    await subscription.unsubscribe()
  } catch {
    // Nothing more to do - the server forgets a dead subscription by itself.
  }
}

// Whether this device is subscribed right now (for the Settings page).
export async function hasPushSubscription() {
  try {
    return Boolean(await currentSubscription())
  } catch {
    return false
  }
}
