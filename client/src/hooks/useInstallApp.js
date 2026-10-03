import { useSyncExternalStore } from 'react'

import { installState, promptInstall, subscribeToInstall } from '../utils/install.js'

// The install state ('installed' | 'prompt' | 'ios' | 'manual' - see
// utils/install.js), kept up to date when the browser offers installing or
// the app gets installed, and the function behind an Install button.
export function useInstallApp() {
  const state = useSyncExternalStore(subscribeToInstall, installState)
  return { state, install: promptInstall }
}
