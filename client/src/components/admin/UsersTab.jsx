import { useEffect, useState } from 'react'

import { deleteUser, listUsers, suspendUser, unsuspendUser } from '../../api/admin.js'
import { errorMessage } from '../../api/http.js'
import { useAuth } from '../../context/AuthContext.jsx'
import Button from '../common/Button.jsx'
import Spinner from '../common/Spinner.jsx'

const PAGE_SIZE = 20

export default function UsersTab() {
  const { user: me } = useAuth()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)

  function fetchUsers(pageToLoad) {
    listUsers({ search: search.trim() || undefined, page: pageToLoad, limit: PAGE_SIZE })
      .then(setResult)
      .catch((err) => setError(errorMessage(err)))
  }

  useEffect(() => {
    fetchUsers(page)
    // Reloads when the page changes; a search reloads itself via its own
    // form submit instead, so typing does not refetch on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page])

  function handleSearchSubmit(event) {
    event.preventDefault()
    if (page === 1) fetchUsers(1)
    else setPage(1)
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
    if (!window.confirm(`Permanently delete ${u.displayName} (@${u.username})? This cannot be undone.`)) {
      return
    }
    setBusyId(u.id)
    try {
      await deleteUser(u.id)
      setResult((r) => ({ ...r, users: r.users.filter((x) => x.id !== u.id), total: r.total - 1 }))
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusyId(null)
    }
  }

  const totalPages = result ? Math.max(1, Math.ceil(result.total / PAGE_SIZE)) : 1

  return (
    <div className="space-y-4">
      <form onSubmit={handleSearchSubmit} className="flex gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by username or email"
          aria-label="Search users"
          className="block w-full max-w-sm rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 focus:outline-none"
        />
        <Button type="submit" size="sm">
          Search
        </Button>
      </form>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {!result ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : (
        <>
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs tracking-wide text-slate-500 uppercase">
                <tr>
                  <th className="px-4 py-2.5">User</th>
                  <th className="px-4 py-2.5">Email</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {result.users.map((u) => {
                  const isMe = u.id === me.id
                  return (
                    <tr key={u.id}>
                      <td className="px-4 py-2.5">
                        <p className="font-medium text-slate-900">{u.displayName}</p>
                        <p className="text-xs text-slate-500">@{u.username}</p>
                      </td>
                      <td className="px-4 py-2.5 text-slate-700">{u.email}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {u.isAdmin && (
                            <span className="rounded-full bg-brand-100 px-2 py-0.5 text-xs font-medium text-brand-700">
                              Admin
                            </span>
                          )}
                          {u.suspended && (
                            <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                              Suspended
                            </span>
                          )}
                          {u.online && !u.suspended && (
                            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                              Online
                            </span>
                          )}
                        </div>
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
                            <Button
                              variant="danger"
                              size="sm"
                              disabled={busyId === u.id}
                              onClick={() => handleDelete(u)}
                            >
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
                    <td colSpan={4} className="px-4 py-6 text-center text-slate-500">
                      No users found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 text-sm">
              <Button
                variant="secondary"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </Button>
              <span className="text-slate-600">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="secondary"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
