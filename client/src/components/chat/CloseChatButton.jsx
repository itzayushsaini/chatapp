import { useChatStore } from '../../store/useChatStore.js'
import { XIcon } from '../common/Icons.jsx'

// Hidden on phones, where the back arrow already does this
export default function CloseChatButton() {
  return (
    <button
      type="button"
      onClick={() => useChatStore.getState().setActiveConversation(null)}
      className="hidden rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none md:inline-flex"
      aria-label="Close chat"
      title="Close chat (Esc)"
    >
      <XIcon className="h-5 w-5" />
    </button>
  )
}
