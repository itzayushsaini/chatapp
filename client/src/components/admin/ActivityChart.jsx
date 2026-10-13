import { utcDayShort } from '../../utils/time.js'

export default function ActivityChart({ days, field, label, unit }) {
  const values = days.map((d) => d[field])
  const max = Math.max(...values, 1)
  const total = values.reduce((sum, v) => sum + v, 0)
  const summary = `${label}: ${total} in the last ${days.length} days, most ${Math.max(...values)} in a day.`

  return (
    <div>
      <div role="img" aria-label={summary} className="flex h-36 items-end gap-1 border-b border-slate-200 pt-2">
        {days.map((d) => {
          const v = d[field]
          return (
            <div key={d.date} className="group flex h-full min-w-0 flex-1 items-end" title={`${utcDayShort(d.date)}: ${v} ${unit}`}>
              <div
                className={`w-full rounded-t transition-colors duration-150 ${
                  v === 0 ? 'bg-slate-200' : 'bg-brand-500 group-hover:bg-brand-700'
                }`}
                style={{ height: v === 0 ? '2px' : `${Math.max(6, (v / max) * 100)}%` }}
              />
            </div>
          )
        })}
      </div>
      <div className="mt-1.5 flex justify-between text-xs text-slate-500" aria-hidden="true">
        <span>{utcDayShort(days[0].date)}</span>
        <span>busiest day: {Math.max(...values)}</span>
        <span>{utcDayShort(days[days.length - 1].date)}</span>
      </div>
    </div>
  )
}
