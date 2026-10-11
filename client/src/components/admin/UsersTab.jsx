import { useEffect, useState } from 'react'

import { deleteUser, listUsers, suspendUser, unsuspendUser } from '../../api/admin.js'
import { errorMessage } from '../../api/http.js'
import { useAuth } from '../../context/AuthContext.jsx'
import { lastSeenLabel } from '../../utils/time.js'
import Avatar from '../common/Avatar.jsx'
import Button from '../common/Button.jsx'
import ConfirmDialog from '../common/ConfirmDialog.jsx'
import { SearchIcon } from '../common/Icons.jsx'
import Skeleton from '../common/Skeleton.jsx'

const PAGE_SIZE = 20

const SORTS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'name', label: 'Name (A–Z)' },
  { value: 'lastSeen', label: 'Last seen' },
]

// "12 Sep 2026" - when the account was created.
const joined = (date) => new Date(date).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })

function Badge({ tone, children }) {
  const tones = {
    brand: 'bg-brand-100 text-brand-700',
    red: 'bg-red-100 text-red-700',
    green: 'bg-emerald-100 text-emerald-700',
  }
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>
}

export default function UsersTab() {
  const { user: me } = useAuth()
  const [search, setSearch] = useState('')
  const [searched, setSearched] = useState('') // the search the list on screen is for
  const [sort, setSort] = useState('newest')
  const [page, setPage] = useState(1)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [toDelete, setToDelete] = useState(null)

  // Reloads whenever the page, the sort or the submitted search changes.
  // Typing alone does not refetch on every keystroke: `searched` only
  // changes when the form is submitted.
  useEffect(() => {
    let current = true
    listUsers({ search: searched || undefined, sort, page, limit: PAGE_SIZE })
      .then((r) => current && (setResult(r), setError('')))
      .catch((err) => current && setError(errorMessage(err)))
    return () => {
      current = false
    }
  }, [page, sort, searched])

  function handleSearchSubmit(event) {
    event.preventDefault()
    setPage(1)
    setSearched(search.trim())
  }

  function handleSort(event) {
    setPage(1)
    setSort(event.target.value)
  }

  async function handleSuspendToggle(u) {
    setBusyId(u.id)
    try {
      const updated = u.suspended ? await unsuspendUser(u.id) : await suspendUser(u.id)
      setResult((r) => ({ ...r, users: r.users.map((x) => (x.id === u.id ? updated : x)) }))
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusyId(null)
    }
  }

  async function handleDelete(u) {
    try {
      await deleteUser(u.id)
      setResult((r) => ({ ...r, users: r.users.filter((x) => x.id !== u.id), total: r.total - 1 }))
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  const totalPages = result ? Math.max(1, Math.ceil(result.total / PAGE_SIZE)) : 1

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <form onSubmit={handleSearchSubmit} className="flex w-full max-w-md gap-2">
          <div className="relative flex-1">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by username or email"
              aria-label="Search users"
              className="block w-full rounded-lg border border-slate-300 bg-surface py-2 pr-3 pl-9 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 focus:outline-none"
            />
          </div>
          <Button type="submit" size="sm">
            Search
          </Button>
        </form>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          Sort
          <select
            value={sort}
            onChange={handleSort}
            className="rounded-lg border border-slate-300 bg-surface px-2.5 py-1.5 text-sm text-slate-900 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 focus:outline-none"
          >
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {!result ? (
        <div className="space-y-2" role="status">
          <span className="sr-only">Loading users</span>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : (
        <>
          <p className="text-sm text-slate-500">
            {result.total} {result.total === 1 ? 'user' : 'users'}
            {searched && <> matching “{searched}”</>}
          </p>
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-surface shadow-sm">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs tracking-wide text-slate-500 uppercase">
                <tr>
                  <th className="px-4 py-2.5 font-medium">User</th>
                  <th className="hidden px-4 py-2.5 font-medium md:table-cell">Joined</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {result.users.map((u) => {
                  const isMe = u.id === me.id
                  return (
                    <tr key={u.id} className="transition-colors duration-150 hover:bg-slate-50">
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-3">
                          <Avatar user={u} size="sm" />
                          <div className="min-w-0">
                            <p className="truncate font-medium text-slate-900">{u.displayName}</p>
                            <p className="truncate text-xs text-slate-500">@{u.username}</p>
                            <p className="truncate text-xs text-slate-500">{u.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="hidden px-4 py-2.5 whitespace-nowrap text-slate-600 md:table-cell">{joined(u.createdAt)}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {u.isAdmin && <Badge tone="brand">Admin</Badge>}
                          {u.suspended && <Badge tone="red">Suspended</Badge>}
                          {u.online && !u.suspended && <Badge tone="green">Online</Badge>}
                        </div>
                        {!u.online && (
                          <p className="mt-1 text-xs text-slate-500">{u.lastSeen ? lastSeenLabel(u.lastSeen) : 'Never seen'}</p>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {isMe ? (
                          <span className="text-xs text-slate-400">This is you</span>
                        ) : (
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="secondary"
                              size="sm"
                              disabled={busyId === u.id}
                              onClick={() => handleSuspendToggle(u)}
                            >
                              {u.suspended ? 'Unsuspend' : 'Suspend'}
                            </Button>
                            <Button variant="danger" size="sm" disabled={busyId === u.id} onClick={() => setToDelete(u)}>
                              Delete
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
                {result.users.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                      No users found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 text-sm">
              <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Previous
              </Button>
              <span className="text-slate-600">
                Page {page} of {totalPages}
              </span>
              <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                Next
              </Button>
            </div>
          )}
        </>
      )}

      <ConfirmDialog
        open={Boolean(toDelete)}
        onClose={() => setToDelete(null)}
        title="Delete this account?"
        confirmLabel="Delete account"
        danger
        onConfirm={() => handleDelete(toDelete)}
      >
        {toDelete && (
          <p>
            <strong>{toDelete.displayName}</strong> (@{toDelete.username}) will be permanently deleted, along with their
            friendships and PingMe AI chat. Their friends keep the messages they already have. This cannot be undone.
          </p>
        )}
      </ConfirmDialog>
    </div>
  )
}
