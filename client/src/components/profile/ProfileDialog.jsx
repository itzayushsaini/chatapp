import { useId, useRef, useState } from 'react'

import * as authApi from '../../api/auth.js'
import { errorMessage } from '../../api/http.js'
import { removeAvatar, updateProfile, uploadAvatar } from '../../api/profile.js'
import { useAuth } from '../../context/AuthContext.jsx'
import { useChatStore } from '../../store/useChatStore.js'
import { cropToSquare } from '../../utils/image.js'
import Avatar from '../common/Avatar.jsx'
import Button from '../common/Button.jsx'
import Dialog from '../common/Dialog.jsx'
import Spinner from '../common/Spinner.jsx'
import TextField from '../common/TextField.jsx'

const BIO_MAX = 160

// Editing MY profile: picture, display name, username and bio.
export default function ProfileDialog({ open, onClose }) {
  return (
    <Dialog open={open} onClose={onClose} title="Your profile">
      <ProfileForm onDone={onClose} />
    </Dialog>
  )
}

function ProfileForm({ onDone }) {
  const { user, updateUser } = useAuth()
  const addToast = useChatStore((s) => s.addToast)

  const [displayName, setDisplayName] = useState(user.displayName)
  const [username, setUsername] = useState(user.username)
  const [bio, setBio] = useState(user.bio ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Is a username change allowed right now? (null = any time)
  const lockedUntil =
    user.usernameChangeAllowedAt && new Date(user.usernameChangeAllowedAt) > new Date()
      ? new Date(user.usernameChangeAllowedAt)
      : null

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')

    // Send only what actually changed.
    const changes = {}
    if (displayName.trim() !== user.displayName) changes.displayName = displayName
    if (bio.trim() !== (user.bio ?? '')) changes.bio = bio
    const newUsername = username.trim().toLowerCase()
    if (newUsername !== user.username) {
      const sure = window.confirm(
        `Change your username to @${newUsername}?\n\n` +
          `You won't be able to change it again for 30 days, and @${user.username} ` +
          'will become available for someone else to take.',
      )
      if (!sure) return
      changes.username = newUsername
    }

    if (Object.keys(changes).length === 0) return onDone()

    setSaving(true)
    try {
      updateUser(await updateProfile(changes))
      addToast('Profile saved')
      onDone()
    } catch (err) {
      setError(errorMessage(err))
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <PictureEditor />

      <form onSubmit={handleSubmit} className="space-y-4">
        <TextField
          label="Display name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          maxLength={40}
          required
        />
        <TextField
          label="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value.toLowerCase())}
          disabled={Boolean(lockedUntil)}
          autoCapitalize="none"
          pattern="[a-z0-9_.]{3,20}"
          minLength={3}
          maxLength={20}
          required
          hint={
            lockedUntil
              ? `You can change your username again on ${lockedUntil.toLocaleDateString([], {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}.`
              : 'Friends find you by this. You can change it once every 30 days.'
          }
        />
        <BioField value={bio} onChange={setBio} />
        <div>
          <p className="mb-1.5 text-sm font-medium text-slate-700">Email</p>
          <p className="text-sm text-slate-600">{user.email}</p>
          <p className="mt-1 text-xs text-slate-500">Only you can see this.</p>
        </div>

        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onDone} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving && <Spinner light className="h-4 w-4" />}
            Save
          </Button>
        </div>
      </form>

      <hr className="border-slate-200" />
      <ChangePasswordSection />
    </div>
  )
}

// Its own form with its own Save button: unrelated fields and validation to
// the profile form above, so a mistake in one never blocks the other.
function ChangePasswordSection() {
  const { user } = useAuth()
  const addToast = useChatStore((s) => s.addToast)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  function clear() {
    setCurrentPassword('')
    setNewPassword('')
    setConfirm('')
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    if (newPassword !== confirm) {
      setError('New passwords do not match')
      return
    }

    setSaving(true)
    try {
      const message = await authApi.changePassword(currentPassword, newPassword)
      addToast(message)
      clear()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <h3 className="text-sm font-semibold text-slate-900">Change password</h3>
      {user.authProvider === 'google' && (
        // Their account was made by "Continue with Google", so unless they
        // have since set one, there is no current password to type here.
        <p className="rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-600">
          You signed up with Google, so you may not have a password yet. To set one, log out and use
          &quot;Forgot password?&quot; on the login page with {user.email}.
        </p>
      )}
      <TextField
        label="Current password"
        type="password"
        value={currentPassword}
        onChange={(e) => setCurrentPassword(e.target.value)}
        autoComplete="current-password"
        required
      />
      <TextField
        label="New password"
        type="password"
        hint="8-72 characters"
        value={newPassword}
        onChange={(e) => setNewPassword(e.target.value)}
        autoComplete="new-password"
        minLength={8}
        maxLength={72}
        required
      />
      <TextField
        label="Confirm new password"
        type="password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        autoComplete="new-password"
        required
      />

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}

      <div className="flex justify-end pt-1">
        <Button type="submit" disabled={saving || !currentPassword || !newPassword}>
          {saving && <Spinner light className="h-4 w-4" />}
          Update password
        </Button>
      </div>
    </form>
  )
}

function BioField({ value, onChange }) {
  const id = useId()
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-slate-700">
        Bio
      </label>
      <textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={BIO_MAX}
        rows={3}
        placeholder="A few words about you"
        className="block w-full resize-none rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 focus:outline-none"
      />
      <p className="mt-1 text-right text-xs text-slate-500">
        {value.length} / {BIO_MAX}
      </p>
    </div>
  )
}

// The picture is saved as soon as it is chosen (no need to press Save).
function PictureEditor() {
  const { user, updateUser } = useAuth()
  const addToast = useChatStore((s) => s.addToast)
  const inputRef = useRef(null)
  const [busy, setBusy] = useState(false)

  async function run(action) {
    setBusy(true)
    try {
      updateUser(await action())
    } catch (err) {
      addToast(err.response ? errorMessage(err) : err.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  function handleFile(event) {
    const file = event.target.files[0]
    event.target.value = '' // so choosing the same file again still fires
    if (!file) return
    if (!file.type.startsWith('image/')) {
      addToast('Please choose a picture', 'error')
      return
    }
    run(async () => uploadAvatar(await cropToSquare(file)))
  }

  return (
    <div className="flex items-center gap-4">
      <span className="relative">
        <Avatar user={user} size="xl" />
        {busy && (
          <span className="absolute inset-0 flex items-center justify-center rounded-full bg-surface/70">
            <Spinner />
          </span>
        )}
      </span>
      <div className="flex flex-col items-start gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          onChange={handleFile}
          className="hidden"
          aria-label="Choose a profile picture"
        />
        <Button size="sm" onClick={() => inputRef.current.click()} disabled={busy}>
          {user.avatarUrl ? 'Change photo' : 'Add photo'}
        </Button>
        {user.avatarUrl && (
          <Button size="sm" variant="ghost" onClick={() => run(removeAvatar)} disabled={busy}>
            Remove photo
          </Button>
        )}
      </div>
    </div>
  )
}
