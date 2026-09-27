import { ChatIcon } from '../common/Icons.jsx'

// Shown on wide screens when no chat is open.
export default function EmptyChat() {
  return (
    <div className="chat-background flex flex-1 flex-col items-center justify-center px-6 text-center">
      <span className="flex h-20 w-20 items-center justify-center rounded-full bg-surface text-brand-600 shadow-sm">
        <ChatIcon className="h-9 w-9" />
      </span>
      <h2 className="mt-5 text-lg font-medium text-slate-700">Select a conversation</h2>
      <p className="mt-1 text-sm text-slate-500">Choose a friend from the list to start chatting.</p>
    </div>
  )
}
