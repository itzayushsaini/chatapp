// Keeps the chat on screen when a phone's keyboard opens.
//
// The chat is exactly one screen tall (100dvh) with its own scrolling
// inside. By default, opening the keyboard does NOT make the page shorter -
// the browser slides the whole page up instead, to keep the text box in
// view, and the chat header (the friend's photo and name) disappears off the
// top. index.html's `interactive-widget=resizes-content` fixes that on
// Android. iPhone Safari ignores it, so for it (and any other browser that
// does) this file does the same job by hand:
//
//   while the VISIBLE area (window.visualViewport) is shorter than the page,
//   which is what an open keyboard does, set --app-height to the visible
//   height - LoggedInLayout uses it as the chat's height - and put the page
//   back at the top. The whole chat then fits above the keyboard, header
//   included. When the keyboard closes, --app-height is removed and 100dvh
//   applies again.

const viewport = typeof window !== 'undefined' ? window.visualViewport : null

function update() {
  const root = document.documentElement
  // Zooming in with two fingers also makes the visible area smaller - that
  // is not a keyboard, so leave the layout alone then.
  const zoomed = viewport.scale > 1.01
  const keyboardOpen = !zoomed && viewport.height < root.clientHeight - 1

  if (keyboardOpen) {
    root.style.setProperty('--app-height', `${viewport.height}px`)
    if (window.scrollY !== 0) window.scrollTo(0, 0)
  } else {
    root.style.removeProperty('--app-height')
  }
}

if (viewport) {
  viewport.addEventListener('resize', update)
  viewport.addEventListener('scroll', update)
}
