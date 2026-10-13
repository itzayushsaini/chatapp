// iPhone Safari ignores interactive-widget=resizes-content, so while the keyboard
// is open we size the chat to the visible area by hand, keeping the header on screen.

const viewport = typeof window !== 'undefined' ? window.visualViewport : null

function update() {
  const root = document.documentElement
  // pinch-zoom also shrinks the visible area, but isn't a keyboard
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
