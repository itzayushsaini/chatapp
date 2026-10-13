import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router'

import { useAuth } from '../context/AuthContext.jsx'
import { useSocket } from '../context/SocketContext.jsx'
import { AI_CHAT_ID, UPDATES_CHAT_ID, useChatStore } from '../store/useChatStore.js'
import { attachmentLabel } from '../utils/files.js'
import { onNotificationClick, showMessageNotification } from '../utils/notifications.js'

// clears "typing..." if their stop event never arrives (they re-send every 3 s)
const TYPING_TIMEOUT_MS = 6000

// Every listener is removed in the cleanup: StrictMode runs effects twice, so
// without socket.off() every message would appear twice.
export function useSocketEvents() {
  const socket = useSocket()
  const { user, updateUser } = useAuth()
  // only the id, so editing my profile doesn't re-register every listener
  const myId = user?.id
  const navigate = useNavigate()
  const navigateRef = useRef(navigate)
  useEffect(() => {
    navigateRef.current = navigate
  })

  useEffect(() => {
    if (!socket || !myId) return
    const store = useChatStore.getState

    let hasConnectedBefore = false

    function latestMessageId(conversationId) {
      const messages = store().messagesByConversation[conversationId]?.messages ?? []
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].id) return messages[i].id
      }
      return null
    }

    function markRead(conversationId) {
      const upToMessageId = latestMessageId(conversationId)
      if (upToMessageId) socket.emit('conversation:read', { conversationId, upToMessageId })
    }

    async function onConnect() {
      store().setConnection('connected')
      // after a reconnect we may have missed events, so refetch everything
      if (hasConnectedBefore) {
        store().fetchFriends()
        store().fetchRequests()
        store().fetchUpdatesSummary()
        if (store().updates.status === 'ready') store().fetchUpdates()
        store().fetchAiSummary()
        if (store().ai.status === 'ready') store().fetchAiMessages()
        const open = store().activeConversationId
        if (open && open !== UPDATES_CHAT_ID && open !== AI_CHAT_ID) {
          await store().fetchLatest(open)
          markRead(open)
        }
      }
      hasConnectedBefore = true
    }

    function onDisconnect() {
      store().setConnection('reconnecting')
    }

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

      clearTyping(message.conversationId)

      const isOpen = message.conversationId === store().activeConversationId
      // a chat open in a hidden tab is not "read" yet
      if (isOpen && !document.hidden) {
        socket.emit('conversation:read', {
          conversationId: message.conversationId,
          upToMessageId: message.id,
        })
      }

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

    onNotificationClick((target) => {
      if (!target) return
      store().openTarget(target)
      navigateRef.current('/')
    })

    function onConversationCleared({ conversationId }) {
      store().clearConversation(conversationId)
    }

    function onConversationMuted({ conversationId, muted }) {
      store().setMuted(conversationId, muted)
    }

    // no lastMessage means "nothing to update", not "cleared to null"
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
      // no toast when it's just my other tab saying I accepted someone
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

    function onUserUpdated({ user: changed }) {
      if (changed.id === myId) updateUser(changed)
      else store().updateUser(changed)
    }

    function onUpdateNew({ update }) {
      store().receiveUpdate(update)
      const isOpen = store().activeConversationId === UPDATES_CHAT_ID
      if (!isOpen || document.hidden) {
        showMessageNotification({
          title: 'PingMe',
          body: update.text || '📷 Photo',
          icon: '/icons/icon-192.png',
          conversationId: UPDATES_CHAT_ID,
        })
      }
    }

    function onUpdateDeleted({ id }) {
      store().removeUpdate(id)
    }

    function onUpdatesRead({ upToId }) {
      store().applyUpdatesRead(upToId)
    }

    function onAiNew({ messages }) {
      store().addAiMessages(messages)
    }

    function onAiDelta(delta) {
      store().applyAiDelta(delta)
    }

    function onAiDone({ message }) {
      store().addAiMessages([message])
      if (message.status === 'error') return
      store().countAiAnswer()
      const isOpen = store().activeConversationId === AI_CHAT_ID
      if (message.status === 'done' && (!isOpen || document.hidden)) {
        showMessageNotification({
          title: 'PingMe AI',
          body: message.text.replace(/[*_`#>|~]/g, '').slice(0, 120) || '📷 Picture',
          icon: '/icons/icon-192.png',
          conversationId: AI_CHAT_ID,
        })
      }
    }

    function onAiCleared() {
      store().clearAiChat()
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
    socket.on('ai:new', onAiNew)
    socket.on('ai:delta', onAiDelta)
    socket.on('ai:done', onAiDone)
    socket.on('ai:cleared', onAiCleared)

    // the socket may have connected before this effect ran
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
      socket.off('ai:new', onAiNew)
      socket.off('ai:delta', onAiDelta)
      socket.off('ai:done', onAiDone)
      socket.off('ai:cleared', onAiCleared)
    }
  }, [socket, myId, updateUser])
}
