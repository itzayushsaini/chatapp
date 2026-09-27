import { ChatIcon } from '../common/Icons.jsx'

// Shown on wide screens when no chat is open.
export default function EmptyChat() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-slate-50 px-6 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-100 text-blue-600">
        <ChatIcon className="h-8 w-8" />
      </span>
      <h2 className="mt-4 text-lg font-semibold text-slate-900">Select a conversation</h2>
      <p className="mt-1 text-sm text-slate-500">Choose a friend from the list to start chatting.</p>
    </div>
  )
}
