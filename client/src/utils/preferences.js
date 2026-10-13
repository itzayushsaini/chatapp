// Per device, not per account: it's about how this keyboard is used.

const ENTER_KEY = 'pingme:enter-to-send'

export function enterToSend() {
  try {
    return localStorage.getItem(ENTER_KEY) !== 'off'
  } catch {
    return true
  }
}

export function setEnterToSend(on) {
  try {
    localStorage.setItem(ENTER_KEY, on ? 'on' : 'off')
  } catch {
    // not saved - lasts until the page is reloaded
  }
}
