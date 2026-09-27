import { useEffect } from 'react'

import ChatWindow from '../components/chat/ChatWindow.jsx'
import EmptyChat from '../components/chat/EmptyChat.jsx'
import Toasts from '../components/common/Toasts.jsx'
import Sidebar from '../components/sidebar/Sidebar.jsx'
import { useSocketEvents } from '../hooks/useSocketEvents.js'
import { useChatStore } from '../store/useChatStore.js'

export default function ChatPage() {
  const activeConversationId = useChatStore((s) => s.activeConversationId)
  const connection = useChatStore((s) => s.connection)

  // All real-time listeners, registered once for the whole page.
  useSocketEvents()

  // Initial data comes over REST; sockets then keep it up to date.
  useEffect(() => {
    const { fetchFriends, fetchRequests } = useChatStore.getState()
    fetchFriends()
    fetchRequests()
  }, [])

  // Below 768px (Tailwind's `md`) only one of the two panels is visible:
  // the list, or - once a chat is open - the chat, with a back button.
  const chatOpen = Boolean(activeConversationId)

  return (
    <div className="flex h-dvh flex-col">
      {connection === 'reconnecting' && (
        <div className="bg-amber-100 px-4 py-1.5 text-center text-sm text-amber-900" role="status">
          Reconnecting…
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <Sidebar className={`w-full md:flex md:w-80 lg:w-96 ${chatOpen ? 'hidden' : 'flex'}`} />
        <main className={`min-w-0 flex-1 md:flex ${chatOpen ? 'flex' : 'hidden'}`}>
          {chatOpen ? <ChatWindow conversationId={activeConversationId} /> : <EmptyChat />}
        </main>
      </div>

      <Toasts />
    </div>
  )
}
