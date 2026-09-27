import { useEffect, useState } from 'react'

import { getStats } from '../../api/admin.js'
import { errorMessage } from '../../api/http.js'
import Spinner from '../common/Spinner.jsx'

const CARDS = [
  { key: 'totalUsers', label: 'Total users' },
  { key: 'totalMessages', label: 'Messages sent' },
  { key: 'onlineNow', label: 'Online right now' },
]

export default function OverviewTab() {
  const [stats, setStats] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    getStats().then(setStats).catch((err) => setError(errorMessage(err)))
  }, [])

  if (error) return <p className="text-sm text-red-600">{error}</p>
  if (!stats) {
    return (
      <div className="flex justify-center py-10">
        <Spinner />
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {CARDS.map((c) => (
        <div key={c.key} className="rounded-xl border border-slate-200 bg-surface p-5 text-center">
          <p className="text-3xl font-semibold text-brand-700">{stats[c.key]}</p>
          <p className="mt-1 text-sm text-slate-500">{c.label}</p>
        </div>
      ))}
    </div>
  )
}
