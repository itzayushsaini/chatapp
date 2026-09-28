import { useState } from 'react'

import {
  acceptRequest,
  cancelRequest,
  declineRequest,
  searchUser,
  sendRequest,
} from '../../api/friends.js'
import { errorMessage } from '../../api/http.js'
import { useChatStore } from '../../store/useChatStore.js'
import Avatar from '../common/Avatar.jsx'
import Button from '../common/Button.jsx'
import { SearchIcon } from '../common/Icons.jsx'
import Spinner from '../common/Spinner.jsx'

// Exact username search. There is deliberately no "search as you type" and
// no list of suggestions: the server only ever answers for an exact match.
export default function AddFriendTab() {
  const [query, setQuery] = useState('')
  const [result, setResult] = useState(null) // { user, relationship } | 'not-found' | null
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState('')

  async function search(username) {
    setSearching(true)
    setError('')
    try {
      setResult(await searchUser(username))
    } catch (err) {
      if (err.response?.status === 404) setResult('not-found')
      else {
        setResult(null)
        setError(errorMessage(err))
      }
    } finally {
      setSearching(false)
    }
  }

  function handleSubmit(event) {
    event.preventDefault()
    const username = query.trim().toLowerCase()
    if (username) search(username)
  }

  return (
    <div className="px-4 pt-2 pb-4">
      <form onSubmit={handleSubmit} role="search">
        <label htmlFor="friend-search" className="mb-1.5 block text-sm font-medium text-slate-700">
          Find a friend by their exact username
        </label>
        <div className="flex gap-2">
          <input
            id="friend-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. priya_s"
            autoCapitalize="none"
            autoComplete="off"
            spellCheck="false"
            maxLength={20}
            className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 focus:outline-none"
          />
          <Button type="submit" disabled={searching || !query.trim()} aria-label="Search">
            {searching ? <Spinner light className="h-4 w-4" /> : <SearchIcon className="h-4 w-4" />}
          </Button>
        </div>
      </form>

      <div className="mt-4" aria-live="polite">
        {error && <p className="text-sm text-red-600">{error}</p>}
        {result === 'not-found' && (
          <p className="animate-fade-in rounded-lg bg-slate-50 px-3 py-4 text-center text-sm text-slate-500">
            No user found
          </p>
        )}
        {result && result !== 'not-found' && (
          <ResultCard
            key={result.user.id}
            result={result}
            refresh={() => search(result.user.username)}
          />
        )}
      </div>
    </div>
  )
}

function ResultCard({ result, refresh }) {
  const { user } = result
  const [localRelationship, setLocalRelationship] = useState(result.relationship)
  const [busy, setBusy] = useState(false)

  const friends = useChatStore((s) => s.friends)
  const requests = useChatStore((s) => s.requests)
  const store = useChatStore.getState

  const friendItem = friends.find((f) => f.friend.id === user.id)
  const outgoing = requests.outgoing.find((r) => r.user.id === user.id)
  const incoming = requests.incoming.find((r) => r.user.id === user.id)

  // The store is kept live by socket events, so if it knows something newer
  // (e.g. they accepted while this card was open) it wins.
  const relationship =
    localRelationship === 'self'
      ? 'self'
      : friendItem
        ? 'friends'
        : outgoing
          ? 'pending_outgoing'
          : incoming
            ? 'pending_incoming'
            : localRelationship

  // Finds the request id for this person, refetching the list once if we do
  // not have it (the search response itself has no request id).
  async function requestIdFor(list) {
    const find = () => store().requests[list].find((r) => r.user.id === user.id)?.id
    if (!find()) await store().fetchRequests()
    return find()
  }

  async function run(action) {
    setBusy(true)
    try {
      await action()
    } catch (err) {
      store().addToast(errorMessage(err), 'error')
      refresh() // the relationship changed under us - ask the server again
    } finally {
      setBusy(false)
    }
  }

  const add = () =>
    run(async () => {
      const res = await sendRequest(user.username)
      if (res.friend) {
        // They had already asked me, so this became an accept.
        store().addFriend(res.friend)
        setLocalRelationship('friends')
      } else {
        store().addOutgoingRequest(res.request)
        setLocalRelationship('pending_outgoing')
      }
    })

  const cancel = () =>
    run(async () => {
      const id = await requestIdFor('outgoing')
      await cancelRequest(id)
      store().removeRequest(id)
      setLocalRelationship('none')
    })

  const accept = () =>
    run(async () => {
      const id = await requestIdFor('incoming')
      store().addFriend(await acceptRequest(id))
      store().removeRequest(id)
      setLocalRelationship('friends')
    })

  const decline = () =>
    run(async () => {
      const id = await requestIdFor('incoming')
      await declineRequest(id)
      store().removeRequest(id)
      setLocalRelationship('none')
    })

  async function message() {
    const find = () => store().friends.find((f) => f.friend.id === user.id)
    if (!find()) await store().fetchFriends()
    const item = find()
    if (!item) return
    store().setActiveConversation(item.conversationId)
    store().setSidebarTab('chats')
  }

  return (
    <div className="animate-scale-in flex flex-col items-center rounded-2xl border border-slate-200 p-5 text-center">
      <Avatar user={user} size="lg" />
      <p className="mt-3 font-semibold text-slate-900">{user.displayName}</p>
      <p className="text-sm text-slate-500">@{user.username}</p>
      {user.bio && (
        <p className="mt-2 text-sm break-words whitespace-pre-wrap text-slate-600">{user.bio}</p>
      )}

      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {relationship === 'none' && (
          <Button onClick={add} disabled={busy}>
            Add friend
          </Button>
        )}
        {relationship === 'pending_outgoing' && (
          <>
            <span className="self-center text-sm text-slate-500">Requested ·</span>
            <Button variant="secondary" onClick={cancel} disabled={busy}>
              Cancel
            </Button>
          </>
        )}
        {relationship === 'pending_incoming' && (
          <>
            <Button onClick={accept} disabled={busy}>
              Accept
            </Button>
            <Button variant="secondary" onClick={decline} disabled={busy}>
              Decline
            </Button>
          </>
        )}
        {relationship === 'friends' && <Button onClick={message}>Message</Button>}
        {relationship === 'self' && <p className="text-sm text-slate-500">This is you</p>}
      </div>
    </div>
  )
}
