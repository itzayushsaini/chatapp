import { useEffect, useState } from 'react'

import { getActivity, getStats } from '../../api/admin.js'
import { errorMessage } from '../../api/http.js'
import { ChatIcon, SparklesIcon, UsersIcon, ZapIcon } from '../common/Icons.jsx'
import Skeleton from '../common/Skeleton.jsx'
import ActivityChart from './ActivityChart.jsx'

const CARDS = [
  { key: 'totalUsers', label: 'Total users', icon: UsersIcon, recent: 'users', recentLabel: 'new this week' },
  { key: 'totalMessages', label: 'Messages sent', icon: ChatIcon, recent: 'messages', recentLabel: 'this week' },
  { key: 'onlineNow', label: 'Online right now', icon: ZapIcon },
  { key: 'aiAnswersToday', label: 'PingMe AI answers (24 h)', icon: SparklesIcon, recent: 'aiAnswers', recentLabel: 'this week' },
]

const RANGES = [7, 14, 30]

export default function OverviewTab() {
  const [stats, setStats] = useState(null)
  const [days, setDays] = useState(null)
  const [range, setRange] = useState(14)
  const [error, setError] = useState('')

  useEffect(() => {
    getStats().then(setStats).catch((err) => setError(errorMessage(err)))
  }, [])

  useEffect(() => {
    getActivity(range).then(setDays).catch((err) => setError(errorMessage(err)))
  }, [range])

  if (error) return <p className="text-sm text-red-600">{error}</p>

  const sumLast7 = (field) => (days ? days.slice(-7).reduce((sum, d) => sum + d[field], 0) : null)

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {CARDS.map((c) => (
          <div key={c.key} className="rounded-xl border border-slate-200 bg-surface p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-slate-500">{c.label}</p>
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
                <c.icon className="h-5 w-5" />
              </span>
            </div>
            {stats ? (
              <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">{stats[c.key]}</p>
            ) : (
              <Skeleton className="mt-2 h-9 w-20" />
            )}
            <p className="mt-1 h-4 text-xs text-slate-500">
              {c.recent && days && (
                <>
                  <span className="font-medium text-brand-700">+{sumLast7(c.recent)}</span> {c.recentLabel}
                </>
              )}
            </p>
          </div>
        ))}
      </div>

      <section className="rounded-xl border border-slate-200 bg-surface p-5 shadow-sm" aria-labelledby="activity-heading">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="activity-heading" className="font-semibold text-slate-900">
              Activity
            </h2>
            <p className="text-xs text-slate-500">One bar per day (UTC), most recent on the right.</p>
          </div>
          <div role="group" aria-label="Time range" className="inline-flex rounded-lg bg-slate-100 p-0.5">
            {RANGES.map((r) => (
              <button
                key={r}
                type="button"
                aria-pressed={r === range}
                onClick={() => setRange(r)}
                className={`rounded-md px-3 py-1 text-sm font-medium transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none ${
                  r === range ? 'bg-surface text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {r} days
              </button>
            ))}
          </div>
        </div>

        {days ? (
          <div className="mt-5 grid gap-6 lg:grid-cols-2">
            <div className="lg:col-span-2">
              <h3 className="mb-1 text-sm font-medium text-slate-700">Messages sent</h3>
              <ActivityChart days={days} field="messages" label="Messages sent" unit="messages" />
            </div>
            <div>
              <h3 className="mb-1 text-sm font-medium text-slate-700">New accounts</h3>
              <ActivityChart days={days} field="users" label="New accounts" unit="new accounts" />
            </div>
            <div>
              <h3 className="mb-1 text-sm font-medium text-slate-700">PingMe AI answers</h3>
              <ActivityChart days={days} field="aiAnswers" label="PingMe AI answers" unit="answers" />
            </div>
          </div>
        ) : (
          <div className="mt-5 space-y-4" role="status">
            <span className="sr-only">Loading activity</span>
            <Skeleton className="h-36 w-full" />
            <Skeleton className="h-36 w-full" />
          </div>
        )}
      </section>
    </div>
  )
}
