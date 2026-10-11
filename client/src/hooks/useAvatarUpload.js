import { useRef, useState } from 'react'

import { errorMessage } from '../api/http.js'
import { uploadAvatar } from '../api/profile.js'
import { useAuth } from '../context/AuthContext.jsx'
import { useChatStore } from '../store/useChatStore.js'
import { cropToSquare } from '../utils/image.js'

// Choosing and saving a profile picture, shared by the profile dialog, the
// "Add your profile photo" screen and the reminder popup. The picture is
// cropped to 256x256 in the browser and saved straight away; the new profile
// replaces mine in AuthContext, so every avatar on screen updates.
//
// Render <input {...inputProps} /> somewhere (it is hidden) and call
// choose() from a button. onSaved runs after a successful upload.
export function useAvatarUpload({ onSaved } = {}) {
  const { updateUser } = useAuth()
  const addToast = useChatStore((s) => s.addToast)
  const inputRef = useRef(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function handleChange(event) {
    const file = event.target.files[0]
    event.target.value = '' // so choosing the same file again still fires
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('Please choose a picture (JPEG, PNG, WebP or GIF).')
      addToast('Please choose a picture', 'error')
      return
    }
    setBusy(true)
    setError('')
    try {
      updateUser(await uploadAvatar(await cropToSquare(file)))
      onSaved?.()
    } catch (err) {
      const message = err.response ? errorMessage(err) : err.message
      setError(message)
      addToast(message, 'error')
    } finally {
      setBusy(false)
    }
  }

  return {
    busy,
    error,
    choose: () => inputRef.current?.click(),
    inputProps: {
      ref: inputRef,
      type: 'file',
      accept: 'image/jpeg,image/png,image/webp,image/gif',
      onChange: handleChange,
      className: 'hidden',
      'aria-label': 'Choose a profile picture',
    },
  }
}
