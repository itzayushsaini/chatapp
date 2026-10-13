import { deletePushSubscription, getPushKey, savePushSubscription } from '../api/push.js'
import { notificationsEnabled } from './notifications.js'

// On iPhone push only exists once PingMe is installed to the Home Screen.
export function pushSupported() {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

// base64url text -> the raw bytes the browser wants
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

// Safe to call often: the server stores each device only once.
export async function ensurePushSubscription() {
  if (!pushSupported() || Notification.permission !== 'granted' || !notificationsEnabled()) return false
  const publicKey = await getPushKey()
  if (!publicKey) return false

  const registration = await navigator.serviceWorker.ready
  let subscription = await registration.pushManager.getSubscription()
  // a subscription made with an older server key can't be reused
  if (subscription && !sameKey(subscription.options.applicationServerKey, publicKey)) {
    await subscription.unsubscribe()
    subscription = null
  }
  subscription ??= await registration.pushManager.subscribe({
    userVisibleOnly: true, // browsers require every push to show a notification
    applicationServerKey: keyToBytes(publicKey),
  })
  await savePushSubscription(subscription.toJSON())
  return true
}

export async function removePushSubscription() {
  try {
    const subscription = await currentSubscription()
    if (!subscription) return
    await deletePushSubscription(subscription.endpoint).catch(() => {})
    await subscription.unsubscribe()
  } catch {
    // the server forgets a dead subscription by itself
  }
}

export async function hasPushSubscription() {
  try {
    return Boolean(await currentSubscription())
  } catch {
    return false
  }
}
