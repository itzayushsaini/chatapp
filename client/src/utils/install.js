// beforeinstallprompt fires only once, so main.jsx imports this file early.
// iPhone Safari has no such event; those users get Add to Home Screen steps.

let deferredPrompt = null
let installedHere = false
const listeners = new Set()

function changed() {
  for (const listener of listeners) listener()
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
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

export function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true
}

// an iPad's Safari says "Macintosh", but has a touch screen
export function isIos() {
  const ua = window.navigator.userAgent
  return /iPhone|iPad|iPod/.test(ua) || (ua.includes('Macintosh') && window.navigator.maxTouchPoints > 1)
}

export function installState() {
  if (installedHere || isStandalone()) return 'installed'
  if (deferredPrompt) return 'prompt'
  if (isIos()) return 'ios'
  return 'manual'
}

export async function promptInstall() {
  const event = deferredPrompt
  if (!event) return false
  deferredPrompt = null // a prompt event can only be used once
  changed()
  await event.prompt()
  const { outcome } = await event.userChoice
  return outcome === 'accepted'
}

export function subscribeToInstall(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

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
    // storage blocked - it may show again next time
  }
}
