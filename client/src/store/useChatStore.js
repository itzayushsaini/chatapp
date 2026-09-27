import { create } from 'zustand'

import { getMessages } from '../api/conversations.js'
import { getFriends, getRequests } from '../api/friends.js'
import { errorMessage } from '../api/http.js'

// All chat state lives here, in one zustand store. Any component can read
// just the slice it needs, e.g. useChatStore((s) => s.friends), and only
// re-renders when that slice changes.
//
// Remember: MongoDB is the source of truth. Socket events only patch this
// store, and the fetch* actions can always rebuild it from the server.

const initialState = {
  friends: [], // FriendListItem[], sorted for the Chats tab
  friendsStatus: 'loading', // 'loading' | 'ready' | 'error'
  requests: { incoming: [], outgoing: [] },
  // conversationId -> { messages, hasMore, status: 'loading' | 'ready' | 'error' }
  messagesByConversation: {},
  presence: {}, // userId -> { online, lastSeen }
  // conversationId -> the OTHER participant's read pointer (a message id, or
  // null). Every message in that conversation with an id <= this one has
  // been seen by them - what draws a blue vs. grey double tick.
  readUpTo: {},
  activeConversationId: null,
  // conversationId -> number. Kept in the browser only: the spec has no
  // "read" state on the server, so counts start from zero after a reload.
  unreadCounts: {},
  sidebarTab: 'chats', // 'chats' | 'requests' | 'add'
  connection: 'connecting', // 'connecting' | 'connected' | 'reconnecting'
  toasts: [],
}

// ---------------------------------------------------------------------------
// Pure helpers (no state) - easy to reason about in isolation
// ---------------------------------------------------------------------------

// Every message has a clientId - the browser's own for a message still being
// sent, and the same one echoed back by the server once saved - so it is the
// one stable key for a message from the moment it is typed.
//
// Merging by clientId is what removes duplicates: a message that arrives
// twice (ack + reconnect refetch, or two tabs) replaces itself.
function mergeMessages(existing, incoming) {
  const byClientId = new Map(existing.map((m) => [m.clientId, m]))
  for (const m of incoming) byClientId.set(m.clientId, m)

  const all = [...byClientId.values()]
  // Saved messages (they have a server id) in id order - MongoDB ids grow
  // over time and compare correctly as strings. Unsaved ones stay at the end.
  const saved = all.filter((m) => m.id).sort((a, b) => (a.id < b.id ? -1 : 1))
  const unsaved = all.filter((m) => !m.id)
  return [...saved, ...unsaved]
}

// Chats order: most recent message first; friends without messages after,
// in their existing order. Array sort is stable, so ties keep their order.
function sortFriends(friends) {
  return [...friends].sort((a, b) => {
    const aTime = a.lastMessage?.createdAt
    const bTime = b.lastMessage?.createdAt
    if (aTime && bTime) return new Date(bTime) - new Date(aTime)
    if (aTime) return -1
    if (bTime) return 1
    return 0
  })
}

// Updates the sidebar preview for the friend in this conversation.
function withLastMessage(friends, message) {
  const updated = friends.map((f) => {
    if (f.conversationId !== message.conversationId) return f
    const current = f.lastMessage?.createdAt
    if (current && new Date(current) > new Date(message.createdAt)) return f
    return {
      ...f,
      lastMessage: {
        text: message.text,
        senderId: message.senderId,
        createdAt: message.createdAt,
        attachment: message.attachment
          ? { kind: message.attachment.kind, name: message.attachment.name }
          : null,
      },
    }
  })
  return sortFriends(updated)
}

function patchConversation(state, conversationId, patch) {
  const entry = state.messagesByConversation[conversationId]
  if (!entry) return {}
  return {
    messagesByConversation: {
      ...state.messagesByConversation,
      [conversationId]: { ...entry, ...patch(entry) },
    },
  }
}

let nextToastId = 1

// ---------------------------------------------------------------------------
// The store
// ---------------------------------------------------------------------------

export const useChatStore = create((set, get) => ({
  ...initialState,

  reset: () => set(initialState),

  // ----- UI ---------------------------------------------------------------

  setSidebarTab: (sidebarTab) => set({ sidebarTab }),
  setConnection: (connection) => set({ connection }),

  // Opening a chat clears its unread badge. null closes it (mobile "back").
  setActiveConversation: (conversationId) =>
    set((s) => ({
      activeConversationId: conversationId,
      unreadCounts: conversationId ? { ...s.unreadCounts, [conversationId]: 0 } : s.unreadCounts,
    })),

  addToast: (text, kind = 'info') => {
    const id = nextToastId++
    set((s) => ({ toasts: [...s.toasts, { id, text, kind }] }))
    setTimeout(() => get().dismissToast(id), 4000)
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  // ----- Friends ----------------------------------------------------------

  fetchFriends: async () => {
    try {
      get().setFriends(await getFriends())
    } catch (err) {
      // Keep showing an already-loaded list if a background refetch fails.
      if (get().friendsStatus !== 'ready') set({ friendsStatus: 'error' })
      get().addToast(errorMessage(err), 'error')
    }
  },

  setFriends: (friends) =>
    set((s) => {
      const presence = { ...s.presence }
      for (const f of friends) presence[f.friend.id] = { online: f.online, lastSeen: f.lastSeen }
      return { friends: sortFriends(friends), friendsStatus: 'ready', presence }
    }),

  // A new friend (I accepted, they accepted, or an auto-accept). Also removes
  // any request between us, which is now settled.
  addFriend: (item) =>
    set((s) => {
      const userId = item.friend.id
      const notThem = (r) => r.user.id !== userId
      const alreadyThere = s.friends.some((f) => f.friend.id === userId)
      return {
        friends: alreadyThere ? s.friends : sortFriends([item, ...s.friends]),
        presence: { ...s.presence, [userId]: { online: item.online, lastSeen: item.lastSeen } },
        requests: {
          incoming: s.requests.incoming.filter(notThem),
          outgoing: s.requests.outgoing.filter(notThem),
        },
      }
    }),

  removeFriend: (userId) =>
    set((s) => {
      const removed = s.friends.find((f) => f.friend.id === userId)
      const wasOpen = removed && removed.conversationId === s.activeConversationId
      return {
        friends: s.friends.filter((f) => f.friend.id !== userId),
        activeConversationId: wasOpen ? null : s.activeConversationId,
      }
    }),

  // A friend (or someone with a pending request) changed their name, bio or
  // picture - update every place their public profile appears.
  updateUser: (user) =>
    set((s) => {
      const patch = (u) => (u.id === user.id ? { ...u, ...user } : u)
      return {
        friends: s.friends.map((f) => (f.friend.id === user.id ? { ...f, friend: patch(f.friend) } : f)),
        requests: {
          incoming: s.requests.incoming.map((r) => ({ ...r, user: patch(r.user) })),
          outgoing: s.requests.outgoing.map((r) => ({ ...r, user: patch(r.user) })),
        },
      }
    }),

  // ----- Requests ---------------------------------------------------------

  fetchRequests: async () => {
    try {
      set({ requests: await getRequests() })
    } catch (err) {
      get().addToast(errorMessage(err), 'error')
    }
  },

  addIncomingRequest: (request) =>
    set((s) =>
      s.requests.incoming.some((r) => r.id === request.id)
        ? {}
        : { requests: { ...s.requests, incoming: [request, ...s.requests.incoming] } },
    ),

  addOutgoingRequest: (request) =>
    set((s) =>
      s.requests.outgoing.some((r) => r.id === request.id)
        ? {}
        : { requests: { ...s.requests, outgoing: [request, ...s.requests.outgoing] } },
    ),

  removeRequest: (requestId) =>
    set((s) => ({
      requests: {
        incoming: s.requests.incoming.filter((r) => r.id !== requestId),
        outgoing: s.requests.outgoing.filter((r) => r.id !== requestId),
      },
    })),

  // ----- Presence ---------------------------------------------------------

  // Sent on every (re)connect: exactly these friends are online right now.
  setPresenceSnapshot: (onlineIds) =>
    set((s) => {
      const online = new Set(onlineIds)
      const presence = { ...s.presence }
      // The friends list may not have loaded yet, so mark the online ones
      // directly, then everyone else we know about as offline.
      for (const id of online) presence[id] = { ...presence[id], online: true }
      for (const f of s.friends) {
        const id = f.friend.id
        presence[id] = { ...presence[id], online: online.has(id) }
      }
      return { presence }
    }),

  updatePresence: ({ userId, online, lastSeen }) =>
    set((s) => ({
      presence: {
        ...s.presence,
        [userId]: { online, lastSeen: lastSeen ?? s.presence[userId]?.lastSeen ?? null },
      },
    })),

  // ----- Read receipts ------------------------------------------------------

  // A message:read event: the other person has now read up to this message.
  // Same-length hex ids compare correctly as strings, and the pointer only
  // ever moves forward - a stale, out-of-order event can never move it back.
  setReadUpTo: (conversationId, upToMessageId) =>
    set((s) => {
      const current = s.readUpTo[conversationId]
      if (current && current >= upToMessageId) return {}
      return { readUpTo: { ...s.readUpTo, [conversationId]: upToMessageId } }
    }),

  // ----- Messages ---------------------------------------------------------

  // The latest page. Used when a chat is first opened and after a reconnect,
  // when it is MERGED into what we have, so older pages already loaded and
  // messages still being sent are kept.
  fetchLatest: async (conversationId) => {
    if (!get().messagesByConversation[conversationId]) {
      set((s) => ({
        messagesByConversation: {
          ...s.messagesByConversation,
          [conversationId]: { messages: [], hasMore: false, status: 'loading' },
        },
      }))
    }
    try {
      const page = await getMessages(conversationId)
      set((s) => {
        const entry = s.messagesByConversation[conversationId]
        const firstLoad = !entry || entry.status !== 'ready'
        return {
          messagesByConversation: {
            ...s.messagesByConversation,
            [conversationId]: {
              messages: mergeMessages(entry?.messages ?? [], page.messages),
              hasMore: firstLoad ? page.hasMore : entry.hasMore,
              status: 'ready',
            },
          },
          readUpTo: { ...s.readUpTo, [conversationId]: page.theirReadUpTo },
        }
      })
    } catch (err) {
      set((s) => patchConversation(s, conversationId, (e) => (e.status === 'ready' ? {} : { status: 'error' })))
      get().addToast(errorMessage(err), 'error')
    }
  },

  // The page before the oldest message we have (scrolling up). Resolves to
  // true if messages were added, so the list knows to restore its scroll.
  fetchOlder: async (conversationId) => {
    const entry = get().messagesByConversation[conversationId]
    const oldest = entry?.messages.find((m) => m.id)
    if (!entry?.hasMore || !oldest) return false

    try {
      const page = await getMessages(conversationId, oldest.id)
      set((s) =>
        patchConversation(s, conversationId, (e) => ({
          messages: mergeMessages(e.messages, page.messages),
          hasMore: page.hasMore,
        })),
      )
      return page.messages.length > 0
    } catch (err) {
      get().addToast(errorMessage(err), 'error')
      return false
    }
  },

  // Optimistic sending, step 1: show the bubble at once, marked 'sending'.
  addPendingMessage: (message) =>
    set((s) =>
      patchConversation(s, message.conversationId, (e) => ({
        messages: mergeMessages(e.messages, [message]),
      })),
    ),

  // Step 2a: the server saved it. The saved copy (same clientId, now with an
  // id and no status) replaces the pending bubble.
  confirmMessage: (message) =>
    set((s) => {
      // The pending bubble showed the chosen file from a temporary blob: URL.
      // The saved copy points at the server, so free that memory.
      const pending = s.messagesByConversation[message.conversationId]?.messages.find(
        (m) => m.clientId === message.clientId && !m.id,
      )
      if (pending?.attachment?.local) URL.revokeObjectURL(pending.attachment.url)
      return {
        ...patchConversation(s, message.conversationId, (e) => ({
          messages: mergeMessages(e.messages, [message]),
        })),
        friends: withLastMessage(s.friends, message),
      }
    }),

  // Changes a message that is still on its way: its status ('uploading',
  // 'sending', 'failed'), upload progress, or the attachmentId once the file
  // has been uploaded.
  updatePendingMessage: (conversationId, clientId, changes) =>
    set((s) =>
      patchConversation(s, conversationId, (e) => ({
        messages: e.messages.map((m) => (m.clientId === clientId && !m.id ? { ...m, ...changes } : m)),
      })),
    ),

  // Step 2b: it failed or timed out. The bubble stays, with a Retry button.
  setMessageStatus: (conversationId, clientId, status) =>
    get().updatePendingMessage(conversationId, clientId, { status }),

  // A message:new event - from the friend, or from one of MY other tabs.
  receiveMessage: (message, myId) =>
    set((s) => {
      const entry = s.messagesByConversation[message.conversationId]
      if (entry?.messages.some((m) => m.id === message.id)) return {} // duplicate

      const fromThem = message.senderId !== myId
      const isOpen = message.conversationId === s.activeConversationId
      return {
        // Only add it to a conversation we have loaded. One never opened
        // loads its full latest page (including this message) when opened.
        ...(entry?.status === 'ready' &&
          patchConversation(s, message.conversationId, (e) => ({
            messages: mergeMessages(e.messages, [message]),
          }))),
        friends: withLastMessage(s.friends, message),
        unreadCounts:
          fromThem && !isOpen
            ? {
                ...s.unreadCounts,
                [message.conversationId]: (s.unreadCounts[message.conversationId] ?? 0) + 1,
              }
            : s.unreadCounts,
      }
    }),

  // A message:deleted event (or its own ack, on the tab that asked - see
  // ChatWindow). "me" removes it outright (hidden on my devices only); the
  // conversation timeline must not shift for "everyone", so that one is
  // marked in place instead, the same shape messageView() sends for it.
  applyMessageDeleted: (conversationId, messageId, mode) =>
    set((s) =>
      patchConversation(s, conversationId, (e) => ({
        messages:
          mode === 'me'
            ? e.messages.filter((m) => m.id !== messageId)
            : e.messages.map((m) =>
                m.id === messageId ? { ...m, deletedForEveryone: true, text: '', attachment: null } : m,
              ),
      })),
    ),

  // Overwrites a friend's sidebar preview with a value the SERVER has
  // already decided (recomputed after a "delete for everyone"), so - unlike
  // withLastMessage - there is no "only if newer" guard here.
  setLastMessage: (conversationId, lastMessage) =>
    set((s) => ({
      friends: sortFriends(
        s.friends.map((f) => (f.conversationId === conversationId ? { ...f, lastMessage } : f)),
      ),
    })),
}))
