import { useState } from 'react'

import { acceptRequest, cancelRequest, declineRequest } from '../../api/friends.js'
import { errorMessage } from '../../api/http.js'
import { useChatStore } from '../../store/useChatStore.js'
import Avatar from '../common/Avatar.jsx'
import Button from '../common/Button.jsx'

export default function RequestsTab() {
  const { incoming, outgoing } = useChatStore((s) => s.requests)

  return (
    <div className="space-y-6 px-4 pt-2 pb-4">
      <Section title="Incoming" empty="No incoming requests">
        {incoming.map((r) => (
          <RequestRow key={r.id} request={r} kind="incoming" />
        ))}
      </Section>
      <Section title="Sent" empty="No pending sent requests">
        {outgoing.map((r) => (
          <RequestRow key={r.id} request={r} kind="outgoing" />
        ))}
      </Section>
    </div>
  )
}

function Section({ title, empty, children }) {
  return (
    <section>
      <h2 className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">{title}</h2>
      {children.length ? (
        <ul className="space-y-1">{children}</ul>
      ) : (
        <p className="rounded-lg bg-slate-50 px-3 py-4 text-center text-sm text-slate-500">{empty}</p>
      )}
    </section>
  )
}

function RequestRow({ request, kind }) {
  const [busy, setBusy] = useState(false)
  const removeRequest = useChatStore((s) => s.removeRequest)
  const addFriend = useChatStore((s) => s.addFriend)
  const addToast = useChatStore((s) => s.addToast)

  async function run(action) {
    setBusy(true)
    try {
      await action()
      removeRequest(request.id)
    } catch (err) {
      addToast(errorMessage(err), 'error')
      // A 404 means the request no longer exists (e.g. they cancelled it a
      // moment ago), so drop it. Any other error: keep it and allow a retry.
      if (err.response?.status === 404) removeRequest(request.id)
      else setBusy(false)
    }
  }

  const accept = () => run(async () => addFriend(await acceptRequest(request.id)))
  const decline = () => run(() => declineRequest(request.id))
  const cancel = () => run(() => cancelRequest(request.id))

  return (
    <li className="flex items-center gap-3 rounded-xl px-1 py-2">
      <Avatar user={request.user} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-900">{request.user.displayName}</p>
        <p className="truncate text-xs text-slate-500">@{request.user.username}</p>
      </div>
      {kind === 'incoming' ? (
        <div className="flex gap-1.5">
          <Button size="sm" onClick={accept} disabled={busy}>
            Accept
          </Button>
          <Button size="sm" variant="secondary" onClick={decline} disabled={busy}>
            Decline
          </Button>
        </div>
      ) : (
        <Button size="sm" variant="secondary" onClick={cancel} disabled={busy}>
          Cancel
        </Button>
      )}
    </li>
  )
}
