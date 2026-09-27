// PingMe's service worker. It is used for ONE thing only: showing message
// notifications, and handling a click on one. No caching, no offline mode.
//
// Why a service worker at all: Android Chrome refuses `new Notification()`
// from a normal page - notifications there can only be shown through a
// service worker's registration.showNotification(). Desktop browsers accept
// either, so the same code path works everywhere.

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

// Clicking a notification: bring an open PingMe tab to the front and tell it
// which chat to open. If no tab is open any more, open a new one.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const conversationId = event.notification.data?.conversationId

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const tab = windows[0]
      if (tab) {
        await tab.focus()
        tab.postMessage({ type: 'open-conversation', conversationId })
      } else {
        await self.clients.openWindow('/')
      }
    })(),
  )
})
