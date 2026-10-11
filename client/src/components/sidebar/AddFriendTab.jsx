import { useState } from 'react'

import {
  acceptRequest,
  cancelRequest,
  declineRequest,
  findUsers,
  sendRequest,
} from '../../api/friends.js'
import { errorMessage } from '../../api/http.js'
import { useChatStore } from '../../store/useChatStore.js'
import Avatar from '../common/Avatar.jsx'
import Button from '../common/Button.jsx'
import { SearchIcon } from '../common/Icons.jsx'
import Spinner from '../common/Spinner.jsx'

// Search by name or username: type at least 3 letters of either, and
// everyone whose name or username contains them is listed (up to 20, best
// matches first - an exact username at the top). The server leaves out
// myself, suspended accounts and anyone blocked either way.
const MIN_CHARS = 3

export default function AddFriendTab() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState(null) // [{ user, relationship }] | null before a search
  const [searched, setSearched] = useState('') // the text the results are for
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState('')

  async function search(text) {
    setSearching(true)
    setError('')
    try {
      setResults(await findUsers(text))
      setSearched(text)
    } catch (err) {
      setResults(null)
      setError(errorMessage(err))
    } finally {
      setSearching(false)
    }
  }

  function handleSubmit(event) {
    event.preventDefault()
    const text = query.trim()
    if (text.length >= MIN_CHARS) search(text)
  }

  const tooShort = query.trim().length < MIN_CHARS

  return (
    <div className="px-4 pt-2 pb-4">
      <form onSubmit={handleSubmit} role="search">
        <label htmlFor="friend-search" className="mb-1.5 block text-sm font-medium text-slate-700">
          Search by name or username
        </label>
        <div className="flex gap-2">
          <input
            id="friend-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. Priya or priya_s"
            autoCapitalize="none"
            autoComplete="off"
            spellCheck="false"
            maxLength={40}
            className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-surface px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 focus:outline-none"
          />
          <Button type="submit" disabled={searching || tooShort} aria-label="Search">
            {searching ? <Spinner light className="h-4 w-4" /> : <SearchIcon className="h-4 w-4" />}
          </Button>
        </div>
        <p className="mt-1.5 text-xs text-slate-500">Type at least {MIN_CHARS} letters.</p>
      </form>

      <div className="mt-4" aria-live="polite">
        {error && <p className="text-sm text-red-600">{error}</p>}
        {results?.length === 0 && (
          <div className="animate-fade-in rounded-lg bg-slate-50 px-3 py-4 text-center text-sm text-slate-500">
            <p className="font-medium text-slate-600">No user found</p>
            <p className="mt-1 text-xs">Nobody&apos;s name or username contains “{searched}”.</p>
          </div>
        )}
        {results?.length > 0 && (
          <>
            <p className="mb-2 text-xs font-medium tracking-wide text-slate-500 uppercase">
              {results.length === 1 ? '1 person' : `${results.length} people`}
              {results.length >= 20 && ' (best matches - type more to narrow it down)'}
            </p>
            <ul aria-label="Search results" className="space-y-2">
              {results.map((result) => (
                <ResultCard key={result.user.id} result={result} refresh={() => search(searched)} />
              ))}
            </ul>
          </>
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
    <li className="animate-fade-in flex gap-3 rounded-xl border border-slate-200 bg-surface p-3">
      <Avatar user={user} size="md" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-slate-900">{user.displayName}</p>
        <p className="truncate text-sm text-slate-500">@{user.username}</p>
        {user.bio && <p className="mt-0.5 truncate text-xs text-slate-600">{user.bio}</p>}

        <div className="mt-2 flex flex-wrap items-center gap-2">
          {relationship === 'none' && (
            <Button size="sm" onClick={add} disabled={busy}>
              Add friend
            </Button>
          )}
          {relationship === 'pending_outgoing' && (
            <>
              <span className="self-center text-sm text-slate-500">Requested ·</span>
              <Button size="sm" variant="secondary" onClick={cancel} disabled={busy}>
                Cancel
              </Button>
            </>
          )}
          {relationship === 'pending_incoming' && (
            <>
              <Button size="sm" onClick={accept} disabled={busy}>
                Accept
              </Button>
              <Button size="sm" variant="secondary" onClick={decline} disabled={busy}>
                Decline
              </Button>
            </>
          )}
          {relationship === 'friends' && (
            <Button size="sm" onClick={message}>
              Message
            </Button>
          )}
          {relationship === 'self' && <p className="text-sm text-slate-500">This is you</p>}
        </div>
      </div>
    </li>
  )
}
