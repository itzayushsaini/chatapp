import { useSyncExternalStore } from 'react'

import { installState, promptInstall, subscribeToInstall } from '../utils/install.js'

export function useInstallApp() {
  const state = useSyncExternalStore(subscribeToInstall, installState)
  return { state, install: promptInstall }
}
