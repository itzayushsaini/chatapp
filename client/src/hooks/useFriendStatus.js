import { useChatStore } from '../store/useChatStore.js'
import { lastSeenLabel } from '../utils/time.js'

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

  return { text, typing, active: typing || Boolean(presence?.online), online: Boolean(presence?.online) }
}
