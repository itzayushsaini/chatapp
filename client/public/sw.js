// Only the offline page is cached on purpose, so the app's code and data can never go stale.

// Bump the version when offline.html changes, so phones fetch the new copy.
const CACHE = 'pingme-offline-v1'
const OFFLINE_FILES = ['/offline.html', '/icons/icon-192.png']

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE)
      await cache.addAll(OFFLINE_FILES)
      await self.skipWaiting()
    })(),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) {
        if (name.startsWith('pingme-') && name !== CACHE) await caches.delete(name)
      }
      await self.clients.claim()
    })(),
  )
})

// Network first; the saved copy is used only when the network fails.
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

// Browsers require every push to show a notification.
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
      badge: '/icons/badge-96.png',
      // one notification per chat; renotify makes the newer one buzz again
      tag: data.tag,
      renotify: Boolean(data.tag),
      data: { open: data.open ?? null },
    }),
  )
})

// The app's own notifications still call `open` conversationId.
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
