import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'

import App from './App.jsx'
import { ErrorBoundary } from './components/common/ErrorScreen.jsx'
import { AuthProvider } from './context/AuthContext.jsx'
import './index.css'
// loaded early: the "can be installed" event fires only once
import './utils/install.js'
import './utils/viewport.js'
import { registerServiceWorker } from './utils/notifications.js'

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

registerServiceWorker()
