// Browser notifications for new messages.
//
// These work while PingMe is open in ANY tab - even minimised or in the
// background. They do not arrive once the browser is fully closed; that
// would need Web Push (server keys, stored push subscriptions), which this
// project does not use.

const supported = typeof window !== 'undefined' && 'Notification' in window

// A per-device on/off switch, separate from the browser's own permission:
// the browser's "Allow" can only be revoked from its settings, so this is
// how the app itself lets someone turn notifications off again.
const PREF_KEY = 'pingme:notifications'
const PROMPT_DISMISSED_KEY = 'pingme:notification-prompt-dismissed'

// localStorage can throw (private browsing, blocked storage) - fall back to
// the default instead of breaking the page.
function readStorage(key) {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
function writeStorage(key, value) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Not saved - the preference simply lasts until the page is reloaded.
  }
}

export function notificationPermission() {
  return supported ? Notification.permission : 'unsupported'
}

export function notificationsEnabled() {
  return readStorage(PREF_KEY) !== 'off'
}

export function setNotificationsEnabled(enabled) {
  writeStorage(PREF_KEY, enabled ? 'on' : 'off')
}

export function promptDismissed() {
  return readStorage(PROMPT_DISMISSED_KEY) === 'yes'
}

export function dismissPrompt() {
  writeStorage(PROMPT_DISMISSED_KEY, 'yes')
}

// Must be called from a click: Firefox and Safari ignore a permission
// request that the user did not directly ask for.
export async function requestNotificationPermission() {
  if (!supported) return 'unsupported'
  const result = await Notification.requestPermission()
  if (result === 'granted') setNotificationsEnabled(true)
  return result
}

export function registerServiceWorker() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
  navigator.serviceWorker.register('/sw.js').catch((err) => {
    console.warn('Service worker not registered - notifications may not work:', err.message)
  })
}

// Called when a notification is clicked, with the conversation to open.
let clickHandler = () => {}
export function onNotificationClick(handler) {
  clickHandler = handler
}

if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type === 'open-conversation') clickHandler(event.data.conversationId)
  })
}

export async function showMessageNotification({ title, body, icon, conversationId }) {
  if (!supported || Notification.permission !== 'granted' || !notificationsEnabled()) return

  const options = {
    body,
    icon: icon || '/favicon.svg',
    // One notification per chat: a second message from the same person
    // replaces the first instead of stacking up, and `renotify` makes it
    // alert again rather than updating silently.
    tag: `chat-${conversationId}`,
    renotify: true,
    data: { conversationId },
  }

  try {
    const registration = await navigator.serviceWorker?.getRegistration()
    if (registration) {
      await registration.showNotification(title, options)
      return
    }
    // No service worker (e.g. it failed to register): desktop browsers still
    // accept a plain notification.
    const notification = new Notification(title, options)
    notification.onclick = () => {
      window.focus()
      clickHandler(conversationId)
      notification.close()
    }
  } catch (err) {
    console.warn('Could not show a notification:', err.message)
  }
}
