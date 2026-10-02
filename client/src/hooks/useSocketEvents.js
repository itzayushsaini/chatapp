import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router'

import { useAuth } from '../context/AuthContext.jsx'
import { useSocket } from '../context/SocketContext.jsx'
import { UPDATES_CHAT_ID, useChatStore } from '../store/useChatStore.js'
import { attachmentLabel } from '../utils/files.js'
import { onNotificationClick, showMessageNotification } from '../utils/notifications.js'

// If a "stopped typing" event never arrives (their connection dropped), the
// indicator clears itself after this long. Their client re-sends "typing"
// every few seconds while they keep typing, so this never cuts off early.
const TYPING_TIMEOUT_MS = 6000

// EVERY socket listener in the app is registered here, in one place, and
// removed again in the cleanup. React StrictMode runs effects twice in
// development: without socket.off() every event would be handled twice and
// every message would appear twice.
//
// Handlers read the store with useChatStore.getState() so they always see
// the latest state without having to re-register on every change.
export function useSocketEvents() {
  const socket = useSocket()
  const { user, updateUser } = useAuth()
  // Only my id, not the whole user object: editing my profile changes the
  // object, and that must not tear down and re-add every listener.
  const myId = user?.id
  // Kept in a ref so the listeners below do not have to be torn down and
  // re-added whenever the router hands us a new navigate function.
  const navigate = useNavigate()
  const navigateRef = useRef(navigate)
  useEffect(() => {
    navigateRef.current = navigate
  })

  useEffect(() => {
    if (!socket || !myId) return
    const store = useChatStore.getState

    let hasConnectedBefore = false

    // The latest saved (has an .id) message in a conversation, or null.
    function latestMessageId(conversationId) {
      const messages = store().messagesByConversation[conversationId]?.messages ?? []
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].id) return messages[i].id
      }
      return null
    }

    // Tells the server (and so the other person) that I have now read up to
    // the latest message in this conversation - only meaningful while it is
    // the one actually on screen.
    function markRead(conversationId) {
      const upToMessageId = latestMessageId(conversationId)
      if (upToMessageId) socket.emit('conversation:read', { conversationId, upToMessageId })
    }

    async function onConnect() {
      store().setConnection('connected')
      // After a RE-connect we may have missed events while offline. MongoDB
      // is the source of truth, so simply fetch everything again.
      if (hasConnectedBefore) {
        store().fetchFriends()
        store().fetchRequests()
        store().fetchUpdatesSummary()
        if (store().updates.status === 'ready') store().fetchUpdates()
        const open = store().activeConversationId
        // The updates channel is not a conversation - it refreshed above.
        if (open && open !== UPDATES_CHAT_ID) {
          await store().fetchLatest(open)
          markRead(open) // catches up on anything that arrived while offline
        }
      }
      hasConnectedBefore = true
    }

    function onDisconnect() {
      store().setConnection('reconnecting')
    }

    // conversationId -> timer that clears a stale "typing..." indicator.
    const typingTimers = new Map()

    function clearTyping(conversationId) {
      clearTimeout(typingTimers.get(conversationId))
      typingTimers.delete(conversationId)
      store().setTyping(conversationId, false)
    }

    function onMessage(message) {
      store().receiveMessage(message, myId)
      const fromThem = message.senderId !== myId
      if (!fromThem) return

      // Their message has arrived, so they have stopped typing it.
      clearTyping(message.conversationId)

      const isOpen = message.conversationId === store().activeConversationId
      // Actually looking at this chat when it arrived: mark it read at once.
      // Open in a hidden or minimised tab does NOT count - it stays
      // "delivered" (grey) until the tab is shown again (see ChatWindow).
      if (isOpen && !document.hidden) {
        socket.emit('conversation:read', {
          conversationId: message.conversationId,
          upToMessageId: message.id,
        })
      }

      // Notify unless they are looking at this exact chat right now. A chat
      // "open" in a tab that is hidden or minimised still counts as unseen.
      // A chat I muted never pops up a notification.
      const item = store().friends.find((f) => f.conversationId === message.conversationId)
      if ((!isOpen || document.hidden) && !item?.muted) {
        showMessageNotification({
          title: item?.friend.displayName ?? 'New message',
          body: message.attachment ? attachmentLabel(message.attachment, message.text) : message.text,
          icon: item?.friend.avatarUrl,
          conversationId: message.conversationId,
        })
      }
    }

    function onMessageRead({ conversationId, upToMessageId }) {
      store().setReadUpTo(conversationId, upToMessageId)
    }

    function onMessageDelivered({ conversationId, upToMessageId }) {
      store().setDeliveredUpTo(conversationId, upToMessageId)
    }

    function onTyping({ conversationId, isTyping }) {
      if (!isTyping) return clearTyping(conversationId)
      store().setTyping(conversationId, true)
      clearTimeout(typingTimers.get(conversationId))
      typingTimers.set(
        conversationId,
        setTimeout(() => clearTyping(conversationId), TYPING_TIMEOUT_MS),
      )
    }

    // Clicking a notification opens that chat - leaving the Settings page
    // first, if that is where I was.
    onNotificationClick((conversationId) => {
      if (!conversationId) return
      store().setActiveConversation(conversationId)
      navigateRef.current('/')
    })

    // Clear chat / mute only ever change MY view, so these come only from
    // my own other tabs.
    function onConversationCleared({ conversationId }) {
      store().clearConversation(conversationId)
    }

    function onConversationMuted({ conversationId, muted }) {
      store().setMuted(conversationId, muted)
    }

    // `lastMessage` is only present when the deleted message WAS the
    // sidebar preview - its absence means "nothing to update" there.
    function onMessageDeleted(payload) {
      const { conversationId, messageId, mode } = payload
      store().applyMessageDeleted(conversationId, messageId, mode)
      if ('lastMessage' in payload) store().setLastMessage(conversationId, payload.lastMessage)
    }

    function onPresenceSnapshot({ online }) {
      store().setPresenceSnapshot(online)
    }

    function onPresenceUpdate(update) {
      store().updatePresence(update)
    }

    function onRequestNew({ request }) {
      store().addIncomingRequest(request)
      store().addToast(`${request.user.displayName} sent you a friend request`)
    }

    function onRequestAccepted({ friend }) {
      // Toast only when it was MY request that got accepted - not when this
      // event is just my other tab reporting that I accepted someone.
      const wasMyRequest = store().requests.outgoing.some((r) => r.user.id === friend.friend.id)
      store().addFriend(friend)
      if (wasMyRequest) store().addToast(`${friend.friend.displayName} accepted your friend request`)
    }

    function onRequestCancelled({ requestId }) {
      store().removeRequest(requestId)
    }

    function onFriendRemoved({ userId }) {
      store().removeFriend(userId)
    }

    // Someone changed their name, bio or picture. If it is me (from another
    // tab), update my own profile; otherwise update them in every list.
    function onUserUpdated({ user: changed }) {
      if (changed.id === myId) updateUser(changed)
      else store().updateUser(changed)
    }

    // A new post in the "PingMe" updates channel. Notify unless the channel
    // is open in a visible tab - the same rule as a chat message.
    function onUpdateNew({ update }) {
      store().receiveUpdate(update)
      const isOpen = store().activeConversationId === UPDATES_CHAT_ID
      if (!isOpen || document.hidden) {
        showMessageNotification({
          title: 'PingMe',
          body: update.text || '📷 Photo',
          icon: '/favicon.svg',
          conversationId: UPDATES_CHAT_ID,
        })
      }
    }

    function onUpdateDeleted({ id }) {
      store().removeUpdate(id)
    }

    // I read the channel on another tab - clear the badge here too.
    function onUpdatesRead({ upToId }) {
      store().applyUpdatesRead(upToId)
    }

    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    socket.on('message:new', onMessage)
    socket.on('message:read', onMessageRead)
    socket.on('message:delivered', onMessageDelivered)
    socket.on('typing', onTyping)
    socket.on('message:deleted', onMessageDeleted)
    socket.on('conversation:cleared', onConversationCleared)
    socket.on('conversation:muted', onConversationMuted)
    socket.on('presence:snapshot', onPresenceSnapshot)
    socket.on('presence:update', onPresenceUpdate)
    socket.on('friend:request:new', onRequestNew)
    socket.on('friend:request:accepted', onRequestAccepted)
    socket.on('friend:request:cancelled', onRequestCancelled)
    socket.on('friend:removed', onFriendRemoved)
    socket.on('user:updated', onUserUpdated)
    socket.on('update:new', onUpdateNew)
    socket.on('update:deleted', onUpdateDeleted)
    socket.on('updates:read', onUpdatesRead)

    // The socket may have connected before this effect ran.
    if (socket.connected) onConnect()

    return () => {
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      socket.off('message:new', onMessage)
      socket.off('message:read', onMessageRead)
      socket.off('message:delivered', onMessageDelivered)
      socket.off('typing', onTyping)
      socket.off('message:deleted', onMessageDeleted)
      socket.off('conversation:cleared', onConversationCleared)
      socket.off('conversation:muted', onConversationMuted)
      for (const timer of typingTimers.values()) clearTimeout(timer)
      onNotificationClick(() => {})
      socket.off('presence:snapshot', onPresenceSnapshot)
      socket.off('presence:update', onPresenceUpdate)
      socket.off('friend:request:new', onRequestNew)
      socket.off('friend:request:accepted', onRequestAccepted)
      socket.off('friend:request:cancelled', onRequestCancelled)
      socket.off('friend:removed', onFriendRemoved)
      socket.off('user:updated', onUserUpdated)
      socket.off('update:new', onUpdateNew)
      socket.off('update:deleted', onUpdateDeleted)
      socket.off('updates:read', onUpdatesRead)
    }
  }, [socket, myId, updateUser])
}
