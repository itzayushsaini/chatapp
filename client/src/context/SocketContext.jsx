import { createContext, useContext, useEffect, useState } from 'react'
import { io } from 'socket.io-client'

const SocketContext = createContext(null)

// Exactly ONE socket per logged-in session. This provider is only rendered
// on the protected chat route, so it exists only while someone is logged in,
// and unmounting it (logout) disconnects the socket.
export function SocketProvider({ children }) {
  const [socket, setSocket] = useState(null)

  useEffect(() => {
    // No URL: connect to the page's own origin, path /socket.io. The
    // httpOnly session cookie is sent with the handshake automatically.
    const s = io({ withCredentials: true })
    setSocket(s)
    // In development StrictMode runs this effect twice; the cleanup makes
    // sure the first socket is closed, so there is still only one.
    return () => {
      s.disconnect()
    }
  }, [])

  return <SocketContext.Provider value={socket}>{children}</SocketContext.Provider>
}

export function useSocket() {
  return useContext(SocketContext)
}
