// Small per-device preferences, kept in this browser only (like the
// notifications switch in notifications.js). Unlike the theme, they are
// about how THIS keyboard/device is used, so they are not saved on the
// account.

const ENTER_KEY = 'pingme:enter-to-send'

// true (the default): Enter sends and Shift+Enter adds a new line.
// false: Enter adds a new line, and only the Send button sends - handy on
// a phone, or for writing long multi-line messages.
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
    // Not saved - lasts until the page is reloaded.
  }
}
