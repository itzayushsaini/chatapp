import { useState } from 'react'

import { useAuth } from '../../context/AuthContext.jsx'
import { useAvatarUpload } from '../../hooks/useAvatarUpload.js'
import Avatar from '../common/Avatar.jsx'
import Button from '../common/Button.jsx'
import Dialog from '../common/Dialog.jsx'
import { ImageIcon } from '../common/Icons.jsx'
import Spinner from '../common/Spinner.jsx'

// For an OLDER account with no profile photo (photos became required after
// it was made): a popup every time PingMe is opened or reloaded, until a
// photo is added. "Later" closes it - only until the next time.
// (LoggedInLayout renders this only while the account has no photo.)
export default function PhotoReminder() {
  const { user } = useAuth()
  const [open, setOpen] = useState(true)
  const upload = useAvatarUpload({ onSaved: () => setOpen(false) })

  return (
    <Dialog open={open} onClose={() => setOpen(false)} title="Add a profile photo">
      <div className="flex flex-col items-center text-center">
        <div className="relative">
          <Avatar user={user} size="xl" />
          {upload.busy && (
            <span className="absolute inset-0 flex items-center justify-center rounded-full bg-surface/70">
              <Spinner />
            </span>
          )}
        </div>
        <p className="mt-4 text-sm text-slate-600">
          Profile photos are now part of every PingMe account - friends recognise you by yours. It only takes a moment.
        </p>
        {upload.error && (
          <p className="mt-3 w-full rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {upload.error}
          </p>
        )}
        <input {...upload.inputProps} />
        <div className="mt-5 flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={() => setOpen(false)} disabled={upload.busy}>
            Later
          </Button>
          <Button onClick={upload.choose} disabled={upload.busy}>
            <ImageIcon className="h-4 w-4" />
            {upload.busy ? 'Saving…' : 'Add photo'}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
