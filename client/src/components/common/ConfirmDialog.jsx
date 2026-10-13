import { useState } from 'react'

import Button from './Button.jsx'
import Dialog from './Dialog.jsx'
import Spinner from './Spinner.jsx'

export default function ConfirmDialog({
  open,
  onClose,
  title,
  children,
  confirmLabel,
  danger = false,
  onConfirm,
}) {
  const [busy, setBusy] = useState(false)

  async function confirm() {
    setBusy(true)
    try {
      await onConfirm()
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onClose={() => !busy && onClose()} title={title}>
      <div className="text-sm text-slate-600">{children}</div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button variant={danger ? 'danger' : 'primary'} onClick={confirm} disabled={busy}>
          {busy && <Spinner light className="h-4 w-4" />}
          {confirmLabel}
        </Button>
      </div>
    </Dialog>
  )
}
