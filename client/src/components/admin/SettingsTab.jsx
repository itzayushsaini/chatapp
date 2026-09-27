import { useEffect, useState } from 'react'

import { getSettings, updateSettings } from '../../api/admin.js'
import { errorMessage } from '../../api/http.js'
import Button from '../common/Button.jsx'
import Spinner from '../common/Spinner.jsx'

// A checkbox with its label wired together, since every toggle here needs
// exactly the same "click the label, flips the box" pairing.
function Toggle({ label, checked, onChange }) {
  return (
    <label className="flex items-center gap-2.5 text-sm text-slate-800">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-slate-300 text-brand-600 focus-visible:ring-2 focus-visible:ring-brand-500"
      />
      {label}
    </label>
  )
}

export default function SettingsTab() {
  const [form, setForm] = useState(null)
  const [domainsText, setDomainsText] = useState('')
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    getSettings()
      .then((settings) => {
        setForm(settings)
        setDomainsText(settings.allowedEmailDomains.join(', '))
      })
      .catch((err) => setError(errorMessage(err)))
  }, [])

  function set(patch) {
    setForm((f) => ({ ...f, ...patch }))
    setSaved(false)
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setSaving(true)

    const allowedEmailDomains = domainsText
      .split(',')
      .map((d) => d.trim().toLowerCase())
      .filter(Boolean)

    try {
      const updated = await updateSettings({ ...form, allowedEmailDomains })
      setForm(updated)
      setDomainsText(updated.allowedEmailDomains.join(', '))
      setSaved(true)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  if (!form) {
    return (
      <div className="flex justify-center py-10">
        <Spinner />
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-xl space-y-6">
      <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="font-semibold text-slate-900">Sign-up</h2>
        <Toggle
          label="New accounts can register"
          checked={form.registrationOpen}
          onChange={(v) => set({ registrationOpen: v })}
        />
        <div>
          <label htmlFor="domains" className="mb-1.5 block text-sm font-medium text-slate-700">
            Allowed email domains
          </label>
          <input
            id="domains"
            value={domainsText}
            onChange={(e) => {
              setDomainsText(e.target.value)
              setSaved(false)
            }}
            placeholder="gmail.com, college.edu"
            className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 focus:outline-none"
          />
          <p className="mt-1 text-xs text-slate-500">
            Comma-separated. Signing up with any other email is refused - this is what keeps out
            temp-mail addresses.
          </p>
        </div>
      </section>

      <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="font-semibold text-slate-900">Features</h2>
        <Toggle
          label="Attachments (photos, videos, documents)"
          checked={form.attachmentsEnabled}
          onChange={(v) => set({ attachmentsEnabled: v })}
        />
        <Toggle
          label="Forwarding messages"
          checked={form.forwardingEnabled}
          onChange={(v) => set({ forwardingEnabled: v })}
        />
        <div>
          <label htmlFor="deleteWindow" className="mb-1.5 block text-sm font-medium text-slate-700">
            "Delete for everyone" time limit (minutes)
          </label>
          <input
            id="deleteWindow"
            type="number"
            min={1}
            max={10080}
            value={form.deleteForEveryoneWindowMinutes}
            onChange={(e) => set({ deleteForEveryoneWindowMinutes: Number(e.target.value) })}
            className="block w-32 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 focus:outline-none"
          />
        </div>
      </section>

      <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="font-semibold text-slate-900">Announcement banner</h2>
        <Toggle
          label="Show a banner to everyone"
          checked={form.announcement.enabled}
          onChange={(v) => set({ announcement: { ...form.announcement, enabled: v } })}
        />
        <textarea
          value={form.announcement.text}
          onChange={(e) => set({ announcement: { ...form.announcement, text: e.target.value } })}
          maxLength={200}
          rows={2}
          placeholder="e.g. Under maintenance until 6pm"
          className="block w-full resize-none rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 focus:outline-none"
        />
      </section>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}
      {saved && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700" role="status">
          Saved.
        </p>
      )}

      <Button type="submit" disabled={saving}>
        {saving ? 'Saving...' : 'Save settings'}
      </Button>
    </form>
  )
}
