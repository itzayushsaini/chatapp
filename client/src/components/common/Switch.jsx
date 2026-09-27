// An on/off toggle. A real <button role="switch"> with aria-checked, so
// keyboards (Space/Enter) and screen readers ("switch, on") both work.
// `label` is the visible text; `description` an optional line under it.
export default function Switch({ checked, onChange, label, description, disabled = false }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      disabled={disabled}
      className="flex w-full items-center justify-between gap-4 rounded-lg px-1 py-2 text-left focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none disabled:opacity-60"
    >
      <span className="min-w-0">
        <span className="block text-sm font-medium text-slate-900">{label}</span>
        {description && <span className="mt-0.5 block text-xs text-slate-500">{description}</span>}
      </span>
      <span
        aria-hidden="true"
        className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors ${
          checked ? 'bg-brand-600' : 'bg-slate-300'
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-5.5' : 'translate-x-0.5'
          }`}
        />
      </span>
    </button>
  )
}
