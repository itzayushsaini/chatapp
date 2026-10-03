// PingMe's service worker - a small script the browser keeps running in the
// background for this site, even while PingMe is closed. It has three jobs:
//
//   1. Show notifications: the open app's own (Android Chrome only allows
//      them through a service worker) AND push notifications the server sends
//      while PingMe is closed (see server/src/services/pushService.js).
//   2. Open the right chat when a notification is tapped.
//   3. Show a friendly "You're offline" page when PingMe is opened with no
//      connection, instead of the browser's own error page.
//
// It deliberately caches NOTHING else: messages, the API, sockets, photos and
// the app's own code always come fresh from the server, so nobody can ever be
// stuck on an old version of the app or see stale data.

// Bump the version when offline.html changes, so phones fetch the new copy.
const CACHE = 'pingme-offline-v1'
const OFFLINE_FILES = ['/offline.html', '/icons/icon-192.png']

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE)
      await cache.addAll(OFFLINE_FILES)
      await self.skipWaiting() // the new version takes over at once
    })(),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Throw away the offline copies of older versions.
      for (const name of await caches.keys()) {
        if (name.startsWith('pingme-') && name !== CACHE) await caches.delete(name)
      }
      await self.clients.claim()
    })(),
  )
})

// Only page loads ("navigations") and the offline page's own files are
// looked at - everything else goes to the network exactly as if there were
// no service worker. Those go to the network too; only if that FAILS (no
// connection) does the saved copy answer: the offline page for any page
// load, and the saved icon for the icon it shows.
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)
  const isPageLoad = request.mode === 'navigate'
  const isOfflineFile = url.origin === self.location.origin && OFFLINE_FILES.includes(url.pathname)
  if (!isPageLoad && !isOfflineFile) return

  event.respondWith(
    fetch(request).catch(async () => {
      const saved = await caches.match(isPageLoad ? '/offline.html' : url.pathname)
      return saved ?? Response.error()
    }),
  )
})

// A push from the server: PingMe is closed (or in the background), and
// something arrived. Browsers require every push to show a notification.
self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data?.json() ?? {}
  } catch {
    data = { body: event.data?.text() ?? '' }
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'PingMe', {
      body: data.body || '',
      icon: data.icon || '/icons/icon-192.png',
      // The small monochrome icon in an Android phone's status bar.
      badge: '/icons/badge-96.png',
      // One notification per chat: a newer one replaces the older one, and
      // renotify makes it buzz again instead of updating silently.
      tag: data.tag,
      renotify: Boolean(data.tag),
      data: { open: data.open ?? null },
    }),
  )
})

// Tapping a notification. `open` says what to show: a conversation id,
// 'requests', 'pingme-ai' or 'pingme-updates' (the app's own notifications
// still call it conversationId). If PingMe is open, bring it to the front
// and tell it; if not, open it at /?open=... - the app reads that on load.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = event.notification.data?.open ?? event.notification.data?.conversationId ?? null

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const tab = windows[0]
      if (tab) {
        await tab.focus()
        tab.postMessage({ type: 'open-conversation', conversationId: target })
      } else {
        await self.clients.openWindow(target ? `/?open=${encodeURIComponent(target)}` : '/')
      }
    })(),
  )
})
