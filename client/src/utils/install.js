// Installing PingMe as an app (a "Progressive Web App").
//
// Chrome, Edge and Samsung Internet (Android and computers) decide by
// themselves that a site can be installed - it has a manifest, icons and
// HTTPS - and then fire ONE `beforeinstallprompt` event. We keep that event
// and show our own "Install" button; calling event.prompt() then opens the
// browser's real install dialog.
//
// Safari on iPhone/iPad has no such event: people install from the Share
// menu ("Add to Home Screen"), so for them we show those steps instead.
//
// This file is imported by main.jsx before anything else, because the event
// fires only once, early, and must not be missed.

let deferredPrompt = null
let installedHere = false
const listeners = new Set()

function changed() {
  for (const listener of listeners) listener()
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    // Stop the browser's own small install bar - we offer it in our UI.
    event.preventDefault()
    deferredPrompt = event
    changed()
  })
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null
    installedHere = true
    changed()
  })
}

// Running as the installed app (its own window, no browser bar).
export function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true
}

// iPhone or iPad. (An iPad's Safari says "Macintosh", but has a touch screen.)
export function isIos() {
  const ua = window.navigator.userAgent
  return /iPhone|iPad|iPod/.test(ua) || (ua.includes('Macintosh') && window.navigator.maxTouchPoints > 1)
}

// 'installed' - running as the app, or just installed from this page
// 'prompt'    - the browser offered it: our Install button will work
// 'ios'       - iPhone/iPad: show the Add to Home Screen steps
// 'manual'    - anything else: the browser's own menu may still offer it
export function installState() {
  if (installedHere || isStandalone()) return 'installed'
  if (deferredPrompt) return 'prompt'
  if (isIos()) return 'ios'
  return 'manual'
}

// Opens the browser's install dialog. Resolves to true if it was installed.
export async function promptInstall() {
  const event = deferredPrompt
  if (!event) return false
  deferredPrompt = null // each prompt event can only be used once
  changed()
  await event.prompt()
  const { outcome } = await event.userChoice
  return outcome === 'accepted'
}

// For useSyncExternalStore (see hooks/useInstallApp.js).
export function subscribeToInstall(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

// The one-line offer in the chat list, once dismissed, stays away on this
// device. (localStorage can throw in private browsing - then it just shows.)
const DISMISSED_KEY = 'pingme:install-prompt-dismissed'
export function installOfferDismissed() {
  try {
    return localStorage.getItem(DISMISSED_KEY) === 'yes'
  } catch {
    return false
  }
}
export function dismissInstallOffer() {
  try {
    localStorage.setItem(DISMISSED_KEY, 'yes')
  } catch {
    // Not remembered - it may show again next time.
  }
}
