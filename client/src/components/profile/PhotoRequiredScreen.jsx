import { useState } from 'react'

import { useAuth } from '../../context/AuthContext.jsx'
import { useAvatarUpload } from '../../hooks/useAvatarUpload.js'
import Avatar from '../common/Avatar.jsx'
import Button from '../common/Button.jsx'
import { ImageIcon } from '../common/Icons.jsx'
import Logo from '../common/Logo.jsx'
import LogoutDialog from '../common/LogoutDialog.jsx'
import Spinner from '../common/Spinner.jsx'

// Shown INSTEAD of the app to a new account (photoRequired) that has no
// profile photo yet - right after signing up. Once the photo is saved,
// AuthContext has an avatarUrl and LoggedInLayout shows the app.
// The only other way out is logging out.
export default function PhotoRequiredScreen() {
  const { user } = useAuth()
  const upload = useAvatarUpload()
  const [logoutOpen, setLogoutOpen] = useState(false)

  return (
    <main className="auth-background flex flex-1 flex-col items-center justify-center gap-6 overflow-y-auto bg-slate-50 px-4 py-10 text-center">
      <Logo />
      <div className="animate-scale-in w-full max-w-sm rounded-2xl border border-slate-200 bg-surface p-6 shadow-md shadow-slate-900/5 sm:p-8">
        <p className="text-sm font-medium text-brand-700">One last step</p>
        <h1 className="mt-1 text-xl font-semibold text-slate-900">Add your profile photo</h1>
        <p className="mt-2 text-sm text-slate-600">
          Friends find and recognise you by your photo, so every PingMe account has one. You can change it any time.
        </p>

        <div className="relative mx-auto mt-6 w-fit">
          <Avatar user={user} size="xl" />
          {upload.busy && (
            <span className="absolute inset-0 flex items-center justify-center rounded-full bg-surface/70">
              <Spinner />
            </span>
          )}
        </div>
        <p className="mt-3 font-medium text-slate-900">{user.displayName}</p>
        <p className="text-sm text-slate-500">@{user.username}</p>

        <input {...upload.inputProps} />
        <Button className="mt-6 w-full" size="lg" onClick={upload.choose} disabled={upload.busy}>
          <ImageIcon className="h-5 w-5" />
          {upload.busy ? 'Saving…' : 'Choose a photo'}
        </Button>
        {upload.error && (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {upload.error}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={() => setLogoutOpen(true)}
        className="rounded text-sm text-slate-500 hover:text-slate-800 hover:underline focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none"
      >
        Log out
      </button>
      <LogoutDialog open={logoutOpen} onClose={() => setLogoutOpen(false)} />
    </main>
  )
}
