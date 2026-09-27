import { useEffect } from 'react'

import { useAuth } from '../context/AuthContext.jsx'
import { useSocket } from '../context/SocketContext.jsx'
import { useChatStore } from '../store/useChatStore.js'

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

  useEffect(() => {
    if (!socket || !myId) return
    const store = useChatStore.getState

    let hasConnectedBefore = false

    function onConnect() {
      store().setConnection('connected')
      // After a RE-connect we may have missed events while offline. MongoDB
      // is the source of truth, so simply fetch everything again.
      if (hasConnectedBefore) {
        store().fetchFriends()
        store().fetchRequests()
        const open = store().activeConversationId
        if (open) store().fetchLatest(open)
      }
      hasConnectedBefore = true
    }

    function onDisconnect() {
      store().setConnection('reconnecting')
    }

    function onMessage(message) {
      store().receiveMessage(message, myId)
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

    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    socket.on('message:new', onMessage)
    socket.on('presence:snapshot', onPresenceSnapshot)
    socket.on('presence:update', onPresenceUpdate)
    socket.on('friend:request:new', onRequestNew)
    socket.on('friend:request:accepted', onRequestAccepted)
    socket.on('friend:request:cancelled', onRequestCancelled)
    socket.on('friend:removed', onFriendRemoved)
    socket.on('user:updated', onUserUpdated)

    // The socket may have connected before this effect ran.
    if (socket.connected) onConnect()

    return () => {
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      socket.off('message:new', onMessage)
      socket.off('presence:snapshot', onPresenceSnapshot)
      socket.off('presence:update', onPresenceUpdate)
      socket.off('friend:request:new', onRequestNew)
      socket.off('friend:request:accepted', onRequestAccepted)
      socket.off('friend:request:cancelled', onRequestCancelled)
      socket.off('friend:removed', onFriendRemoved)
      socket.off('user:updated', onUserUpdated)
    }
  }, [socket, myId, updateUser])
}
