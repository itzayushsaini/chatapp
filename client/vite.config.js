import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // In development the browser only ever talks to localhost:5173. Vite
    // forwards these paths to the Express server on port 5000, so the browser
    // sees a single origin: no CORS setup, and the session cookie stays
    // first-party - the same situation as production.
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:5000',
        ws: true, // Socket.IO upgrades to a WebSocket, which needs this
      },
    },
  },
})
