import AiChat from '../components/ai/AiChat.jsx'
import ChatWindow from '../components/chat/ChatWindow.jsx'
import EmptyChat from '../components/chat/EmptyChat.jsx'
import Sidebar from '../components/sidebar/Sidebar.jsx'
import UpdatesChannel from '../components/updates/UpdatesChannel.jsx'
import { AI_CHAT_ID, UPDATES_CHAT_ID, useChatStore } from '../store/useChatStore.js'

// The sidebar and the open chat. The socket, its listeners, the banners and
// the toasts live one level up, in LoggedInLayout.
export default function ChatPage() {
  const activeConversationId = useChatStore((s) => s.activeConversationId)

  // Below 768px (Tailwind's `md`) only one of the two panels is visible:
  // the list, or - once a chat is open - the chat, with a back button.
  const chatOpen = Boolean(activeConversationId)

  return (
    <>
      <Sidebar className={`w-full md:flex md:w-80 lg:w-96 ${chatOpen ? 'hidden' : 'flex'}`} />
      <main className={`min-w-0 flex-1 md:flex ${chatOpen ? 'flex' : 'hidden'}`}>
        {activeConversationId === UPDATES_CHAT_ID ? (
          <UpdatesChannel />
        ) : activeConversationId === AI_CHAT_ID ? (
          <AiChat />
        ) : chatOpen ? (
          <ChatWindow conversationId={activeConversationId} />
        ) : (
          <EmptyChat />
        )}
      </main>
    </>
  )
}
