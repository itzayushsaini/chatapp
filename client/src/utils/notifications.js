const supported = typeof window !== 'undefined' && 'Notification' in window

// our own switch, because the browser's "Allow" can only be revoked in its settings
const PREF_KEY = 'pingme:notifications'
const PROMPT_DISMISSED_KEY = 'pingme:notification-prompt-dismissed'

// localStorage can throw in private browsing
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
    // not saved - lasts until the page is reloaded
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

// must be called from a click: Firefox and Safari ignore other permission requests
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
    icon: icon || '/icons/icon-192.png',
    badge: '/icons/badge-96.png',
    // one notification per chat; renotify makes the newer one alert again
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
    // no service worker: desktop browsers still accept a plain notification
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
