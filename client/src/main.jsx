import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'

import App from './App.jsx'
import { AuthProvider } from './context/AuthContext.jsx'
import './index.css'

// StrictMode deliberately runs effects twice in development to expose effects
// that do not clean up after themselves. That is why every socket listener in
// hooks/useSocketEvents.js is removed again in its cleanup.
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
