import { create } from 'zustand'

import { getAiMessages, getAiSummary } from '../api/ai.js'
import { getMessages } from '../api/conversations.js'
import { getFriends, getRequests } from '../api/friends.js'
import { errorMessage } from '../api/http.js'
import { getUpdates, getUpdatesSummary } from '../api/updates.js'

// never a real conversation id (24 hex characters), so they can't clash
export const UPDATES_CHAT_ID = 'pingme-updates'
export const AI_CHAT_ID = 'pingme-ai'

const initialState = {
  friends: [],
  friendsStatus: 'loading',
  requests: { incoming: [], outgoing: [] },
  messagesByConversation: {},
  presence: {},
  readUpTo: {},
  deliveredUpTo: {},
  typing: {},
  activeConversationId: null,
  unreadCounts: {},
  sidebarTab: 'chats',
  connection: 'connecting',
  toasts: [],
  updates: { items: [], hasMore: false, status: 'idle', latest: null, unreadCount: 0 },
  ai: {
    available: false,
    imageGeneration: false,
    dailyLimit: 0,
    usedToday: 0,
    latest: null,
    items: [],
    hasMore: false,
    status: 'idle',
  },
}

// Merged by clientId (the one key a message has from the moment it is typed),
// so a message that arrives twice replaces itself.
function mergeMessages(existing, incoming) {
  const byClientId = new Map(existing.map((m) => [m.clientId, m]))
  for (const m of incoming) byClientId.set(m.clientId, m)

  const all = [...byClientId.values()]
  // MongoDB ids grow over time and compare correctly as strings
  const saved = all.filter((m) => m.id).sort((a, b) => (a.id < b.id ? -1 : 1))
  const unsaved = all.filter((m) => !m.id)
  return [...saved, ...unsaved]
}

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

function mergeUpdates(existing, incoming) {
  const byId = new Map(existing.map((u) => [u.id, u]))
  for (const u of incoming) byId.set(u.id, u)
  return [...byId.values()].sort((a, b) => (a.id < b.id ? -1 : 1))
}

// The same AI message can arrive several times, in any order: keep the latest
// updatedAt, or for a streaming answer the copy with more text (from ai:delta).
function isNewerAiCopy(current, incoming) {
  if (!current) return true
  const diff = new Date(incoming.updatedAt) - new Date(current.updatedAt)
  if (diff !== 0) return diff > 0
  if (current.status !== 'streaming') return true
  return incoming.text.length + incoming.reasoning.length > current.text.length + current.reasoning.length
}

function mergeAiMessages(existing, incoming) {
  const byKey = new Map(existing.map((m) => [m.id ?? `pending:${m.clientId}`, m]))
  for (const m of incoming) {
    if (!m.id) {
      byKey.set(`pending:${m.clientId}`, m)
      continue
    }
    if (m.clientId) byKey.delete(`pending:${m.clientId}`)
    if (isNewerAiCopy(byKey.get(m.id), m)) byKey.set(m.id, m)
  }
  const all = [...byKey.values()]
  const saved = all.filter((m) => m.id).sort((a, b) => (a.id < b.id ? -1 : 1))
  return [...saved, ...all.filter((m) => !m.id)]
}

function latestAiMessage(current, incoming) {
  let latest = current
  for (const m of incoming) {
    if (!m.id) continue
    if (!latest || m.id > latest.id || (m.id === latest.id && isNewerAiCopy(latest, m))) latest = m
  }
  return latest
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

export const useChatStore = create((set, get) => ({
  ...initialState,

  reset: () => set(initialState),

  setSidebarTab: (sidebarTab) => set({ sidebarTab }),
  setConnection: (connection) => set({ connection }),

  setActiveConversation: (conversationId) =>
    set((s) => ({
      activeConversationId: conversationId,
      unreadCounts: conversationId ? { ...s.unreadCounts, [conversationId]: 0 } : s.unreadCounts,
    })),

  // `target` comes from the URL, so only the shapes we send are accepted
  openTarget: (target) => {
    if (target === 'requests') set({ sidebarTab: 'requests', activeConversationId: null })
    else if (/^[a-f0-9]{24}$/.test(target ?? '') || target === AI_CHAT_ID || target === UPDATES_CHAT_ID) {
      get().setActiveConversation(target)
    }
  },

  addToast: (text, kind = 'info') => {
    const id = nextToastId++
    set((s) => ({ toasts: [...s.toasts, { id, text, kind }] }))
    setTimeout(() => get().dismissToast(id), 4000)
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  fetchFriends: async () => {
    try {
      get().setFriends(await getFriends())
    } catch (err) {
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

  setPresenceSnapshot: (onlineIds) =>
    set((s) => {
      const online = new Set(onlineIds)
      const presence = { ...s.presence }
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

  // only moves forward, so a late, out-of-order event can't move it back
  setReadUpTo: (conversationId, upToMessageId) =>
    set((s) => {
      const current = s.readUpTo[conversationId]
      if (current && current >= upToMessageId) return {}
      return { readUpTo: { ...s.readUpTo, [conversationId]: upToMessageId } }
    }),

  setDeliveredUpTo: (conversationId, upToMessageId) =>
    set((s) => {
      const current = s.deliveredUpTo[conversationId]
      if (current && current >= upToMessageId) return {}
      return { deliveredUpTo: { ...s.deliveredUpTo, [conversationId]: upToMessageId } }
    }),

  setTyping: (conversationId, isTyping) =>
    set((s) => {
      if (Boolean(s.typing[conversationId]) === isTyping) return {}
      const typing = { ...s.typing }
      if (isTyping) typing[conversationId] = true
      else delete typing[conversationId]
      return { typing }
    }),

  // merged (not replaced) after a reconnect, so older pages and pending messages stay
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
          deliveredUpTo: { ...s.deliveredUpTo, [conversationId]: page.theirDeliveredUpTo },
        }
      })
    } catch (err) {
      set((s) => patchConversation(s, conversationId, (e) => (e.status === 'ready' ? {} : { status: 'error' })))
      get().addToast(errorMessage(err), 'error')
    }
  },

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

  addPendingMessage: (message) =>
    set((s) =>
      patchConversation(s, message.conversationId, (e) => ({
        messages: mergeMessages(e.messages, [message]),
      })),
    ),

  confirmMessage: (message) =>
    set((s) => {
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

  updatePendingMessage: (conversationId, clientId, changes) =>
    set((s) =>
      patchConversation(s, conversationId, (e) => ({
        messages: e.messages.map((m) => (m.clientId === clientId && !m.id ? { ...m, ...changes } : m)),
      })),
    ),

  setMessageStatus: (conversationId, clientId, status) =>
    get().updatePendingMessage(conversationId, clientId, { status }),

  receiveMessage: (message, myId) =>
    set((s) => {
      const entry = s.messagesByConversation[message.conversationId]
      if (entry?.messages.some((m) => m.id === message.id)) return {}

      const fromThem = message.senderId !== myId
      const isOpen = message.conversationId === s.activeConversationId
      return {
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

  // "everyone" is marked in place, so the timeline doesn't shift
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

  clearConversation: (conversationId) =>
    set((s) => ({
      ...patchConversation(s, conversationId, () => ({ messages: [], hasMore: false })),
      friends: s.friends.map((f) => (f.conversationId === conversationId ? { ...f, lastMessage: null } : f)),
      unreadCounts: { ...s.unreadCounts, [conversationId]: 0 },
    })),

  setMuted: (conversationId, muted) =>
    set((s) => ({
      friends: s.friends.map((f) => (f.conversationId === conversationId ? { ...f, muted } : f)),
    })),

  setLastMessage: (conversationId, lastMessage) =>
    set((s) => ({
      friends: sortFriends(
        s.friends.map((f) => (f.conversationId === conversationId ? { ...f, lastMessage } : f)),
      ),
    })),

  fetchUpdatesSummary: async () => {
    try {
      const { latest, unreadCount } = await getUpdatesSummary()
      set((s) => ({ updates: { ...s.updates, latest, unreadCount } }))
    } catch {
      // quiet: the row keeps its default text until the next try
    }
  },

  fetchUpdates: async () => {
    set((s) => (s.updates.status === 'ready' ? {} : { updates: { ...s.updates, status: 'loading' } }))
    try {
      const page = await getUpdates()
      set((s) => {
        const firstLoad = s.updates.status !== 'ready'
        return {
          updates: {
            ...s.updates,
            items: mergeUpdates(s.updates.items, page.updates),
            hasMore: firstLoad ? page.hasMore : s.updates.hasMore,
            status: 'ready',
          },
        }
      })
    } catch (err) {
      set((s) => (s.updates.status === 'ready' ? {} : { updates: { ...s.updates, status: 'error' } }))
      get().addToast(errorMessage(err), 'error')
    }
  },

  fetchOlderUpdates: async () => {
    const { items, hasMore } = get().updates
    if (!hasMore || items.length === 0) return false
    try {
      const page = await getUpdates(items[0].id)
      set((s) => ({
        updates: { ...s.updates, items: mergeUpdates(s.updates.items, page.updates), hasMore: page.hasMore },
      }))
      return page.updates.length > 0
    } catch (err) {
      get().addToast(errorMessage(err), 'error')
      return false
    }
  },

  receiveUpdate: (update) =>
    set((s) => {
      const known = s.updates.latest?.id === update.id || s.updates.items.some((u) => u.id === update.id)
      if (known) return {}
      const isNewest = !s.updates.latest || update.id > s.updates.latest.id
      return {
        updates: {
          ...s.updates,
          items: s.updates.status === 'ready' ? mergeUpdates(s.updates.items, [update]) : s.updates.items,
          latest: isNewest ? update : s.updates.latest,
          unreadCount: s.updates.unreadCount + 1,
        },
      }
    }),

  removeUpdate: (id) => {
    set((s) => ({ updates: { ...s.updates, items: s.updates.items.filter((u) => u.id !== id) } }))
    get().fetchUpdatesSummary()
  },

  clearUpdatesUnread: () => set((s) => ({ updates: { ...s.updates, unreadCount: 0 } })),

  applyUpdatesRead: (upToId) => {
    const { latest } = get().updates
    if (latest && upToId >= latest.id) get().clearUpdatesUnread()
    else get().fetchUpdatesSummary()
  },

  fetchAiSummary: async () => {
    try {
      const { available, imageGeneration, dailyLimit, usedToday, latest } = await getAiSummary()
      set((s) => ({
        ai: {
          ...s.ai,
          available,
          imageGeneration,
          dailyLimit,
          usedToday,
          latest: latestAiMessage(s.ai.latest, latest ? [latest] : []) ?? null,
        },
      }))
    } catch {
      // quiet: the row stays hidden until the next try
    }
  },

  fetchAiMessages: async () => {
    set((s) => (s.ai.status === 'ready' ? {} : { ai: { ...s.ai, status: 'loading' } }))
    try {
      const page = await getAiMessages()
      set((s) => {
        const firstLoad = s.ai.status !== 'ready'
        return {
          ai: {
            ...s.ai,
            items: mergeAiMessages(s.ai.items, page.messages),
            latest: latestAiMessage(s.ai.latest, page.messages),
            hasMore: firstLoad ? page.hasMore : s.ai.hasMore,
            status: 'ready',
          },
        }
      })
    } catch (err) {
      set((s) => (s.ai.status === 'ready' ? {} : { ai: { ...s.ai, status: 'error' } }))
      get().addToast(errorMessage(err), 'error')
    }
  },

  fetchOlderAiMessages: async () => {
    const { items, hasMore } = get().ai
    const oldest = items.find((m) => m.id)
    if (!hasMore || !oldest) return false
    try {
      const page = await getAiMessages(oldest.id)
      set((s) => ({ ai: { ...s.ai, items: mergeAiMessages(s.ai.items, page.messages), hasMore: page.hasMore } }))
      return page.messages.length > 0
    } catch (err) {
      get().addToast(errorMessage(err), 'error')
      return false
    }
  },

  addAiMessages: (messages) =>
    set((s) => ({
      ai: {
        ...s.ai,
        items: s.ai.status === 'ready' ? mergeAiMessages(s.ai.items, messages) : s.ai.items,
        latest: latestAiMessage(s.ai.latest, messages),
      },
    })),

  applyAiDelta: ({ id, text, reasoning }) =>
    set((s) => {
      const patch = (m) => (m.id === id && m.status === 'streaming' ? { ...m, text, reasoning } : m)
      return { ai: { ...s.ai, items: s.ai.items.map(patch), latest: s.ai.latest && patch(s.ai.latest) } }
    }),

  addPendingAiMessage: (message) =>
    set((s) => ({ ai: { ...s.ai, items: mergeAiMessages(s.ai.items, [message]) } })),
  updatePendingAiMessage: (clientId, changes) =>
    set((s) => ({
      ai: {
        ...s.ai,
        items: s.ai.items.map((m) => (!m.id && m.clientId === clientId ? { ...m, ...changes } : m)),
      },
    })),
  removePendingAiMessage: (clientId) =>
    set((s) => ({ ai: { ...s.ai, items: s.ai.items.filter((m) => m.id || m.clientId !== clientId) } })),

  countAiAnswer: () => set((s) => ({ ai: { ...s.ai, usedToday: s.ai.usedToday + 1 } })),

  clearAiChat: () => set((s) => ({ ai: { ...s.ai, items: [], hasMore: false, latest: null } })),
}))
