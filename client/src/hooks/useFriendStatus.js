import { useChatStore } from '../store/useChatStore.js'
import { lastSeenLabel } from '../utils/time.js'

// The line under a friend's name: "typing…", "Online", "Last seen …" or
// "Offline". Shared by the chat header and the contact info panel.
// `active` is true for the two green states.
export function useFriendStatus(friendId, conversationId) {
  const presence = useChatStore((s) => s.presence[friendId])
  const typing = useChatStore((s) => Boolean(s.typing[conversationId]))

  const text = typing
    ? 'typing…'
    : presence?.online
      ? 'Online'
      : presence?.lastSeen
        ? lastSeenLabel(presence.lastSeen)
        : 'Offline'

  return { text, active: typing || Boolean(presence?.online), online: Boolean(presence?.online) }
}
