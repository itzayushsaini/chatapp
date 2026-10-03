import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'

import App from './App.jsx'
import { ErrorBoundary } from './components/common/ErrorScreen.jsx'
import { AuthProvider } from './context/AuthContext.jsx'
import './index.css'
// Loaded with the app (not when a component first needs it): the browser's
// "can be installed" event fires only once, early on, and must not be missed.
import './utils/install.js'
import { registerServiceWorker } from './utils/notifications.js'

// StrictMode deliberately runs effects twice in development to expose effects
// that do not clean up after themselves. That is why every socket listener in
// hooks/useSocketEvents.js is removed again in its cleanup.
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
)

// The service worker shows notifications (also push ones while PingMe is
// closed) and the offline page - see public/sw.js.
registerServiceWorker()
