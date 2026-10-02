import { useEffect, useRef, useState } from 'react'

import { deleteUpdate, postUpdate } from '../../api/admin.js'
import { errorMessage } from '../../api/http.js'
import { getUpdates } from '../../api/updates.js'
import { kindOf } from '../../utils/files.js'
import { dayLabel, formatTime } from '../../utils/time.js'
import Button from '../common/Button.jsx'
import { ImageIcon, TrashIcon } from '../common/Icons.jsx'
import Spinner from '../common/Spinner.jsx'

const TEXT_MAX = 1000
const PHOTO_MAX_BYTES = 10 * 1024 * 1024

// Posting to the "PingMe" updates channel, and the list of past posts.
// Everyone connected sees a new post at once (the server sends it live).
// This page has no socket of its own, so its list refreshes after each change.
export default function UpdatesTab() {
  const [text, setText] = useState('')
  const [photo, setPhoto] = useState(null) // { file, url } - url is a blob: preview
  const [posting, setPosting] = useState(false)
  const [message, setMessage] = useState(null) // { kind: 'error' | 'ok', text }
  const [posts, setPosts] = useState(null) // newest first
  const [hasMore, setHasMore] = useState(false)
  const fileInput = useRef(null)

  async function load() {
    try {
      const page = await getUpdates()
      setPosts([...page.updates].reverse())
      setHasMore(page.hasMore)
    } catch (err) {
      setMessage({ kind: 'error', text: errorMessage(err) })
      setPosts((p) => p ?? [])
    }
  }

  useEffect(() => {
    load()
  }, [])

  // Free the preview's memory when the photo changes or the tab closes.
  useEffect(() => () => photo && URL.revokeObjectURL(photo.url), [photo])

  async function loadOlder() {
    try {
      const page = await getUpdates(posts[posts.length - 1].id)
      setPosts((p) => [...p, ...[...page.updates].reverse()])
      setHasMore(page.hasMore)
    } catch (err) {
      setMessage({ kind: 'error', text: errorMessage(err) })
    }
  }

  // A quick check for instant feedback - the server checks the real bytes.
  function choosePhoto(event) {
    const file = event.target.files?.[0]
    event.target.value = '' // so choosing the same file again still fires
    if (!file) return
    if (kindOf(file) !== 'image') {
      setMessage({ kind: 'error', text: 'Choose a JPEG, PNG, WebP or GIF image.' })
      return
    }
    if (file.size > PHOTO_MAX_BYTES) {
      setMessage({ kind: 'error', text: 'The photo can be at most 10 MB.' })
      return
    }
    setMessage(null)
    setPhoto({ file, url: URL.createObjectURL(file) })
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setPosting(true)
    setMessage(null)
    try {
      await postUpdate({ text: text.trim(), image: photo?.file })
      setText('')
      setPhoto(null)
      setMessage({ kind: 'ok', text: 'Posted - everyone can see it now.' })
      await load()
    } catch (err) {
      setMessage({ kind: 'error', text: errorMessage(err) })
    } finally {
      setPosting(false)
    }
  }

  async function handleDelete(post) {
    if (!window.confirm('Delete this update for everyone?')) return
    try {
      await deleteUpdate(post.id)
      setPosts((p) => p.filter((u) => u.id !== post.id))
    } catch (err) {
      setMessage({ kind: 'error', text: errorMessage(err) })
    }
  }

  const empty = !text.trim() && !photo

  return (
    <div className="max-w-xl space-y-6">
      <form onSubmit={handleSubmit} className="space-y-3 rounded-xl border border-slate-200 bg-surface p-5">
        <div>
          <h2 className="font-semibold text-slate-900">Post an update</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            Shown to every user in the “PingMe” chat at the top of their chat list, with a notification.
          </p>
        </div>

        <label htmlFor="update-text" className="sr-only">
          Update text
        </label>
        <textarea
          id="update-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={TEXT_MAX}
          rows={4}
          placeholder="e.g. New: voice notes are here 🎤"
          className="block w-full resize-y rounded-lg border border-slate-300 bg-surface px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 focus:outline-none"
        />
        <p className="text-right text-xs text-slate-500">
          {text.length} / {TEXT_MAX}
        </p>

        {photo && (
          <div className="flex items-center gap-3 rounded-lg bg-slate-50 p-2">
            <img src={photo.url} alt="" className="h-16 w-16 rounded-md object-cover" />
            <span className="min-w-0 flex-1 truncate text-sm text-slate-700">{photo.file.name}</span>
            <Button variant="ghost" size="sm" onClick={() => setPhoto(null)}>
              Remove
            </Button>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={fileInput}
            type="file"
            accept=".jpg,.jpeg,.png,.gif,.webp"
            onChange={choosePhoto}
            className="hidden"
            aria-label="Choose a photo"
          />
          <Button variant="secondary" size="sm" onClick={() => fileInput.current.click()}>
            <ImageIcon className="h-4 w-4" />
            {photo ? 'Change photo' : 'Add photo'}
          </Button>
          <Button type="submit" size="sm" disabled={empty || posting}>
            {posting ? 'Posting…' : 'Post'}
          </Button>
        </div>

        {message && (
          <p
            className={`text-sm ${message.kind === 'error' ? 'text-red-600' : 'text-emerald-700'}`}
            role={message.kind === 'error' ? 'alert' : 'status'}
          >
            {message.text}
          </p>
        )}
      </form>

      <section className="space-y-3">
        <h2 className="font-semibold text-slate-900">Past updates</h2>
        {posts === null ? (
          <div className="flex justify-center py-6">
            <Spinner />
          </div>
        ) : posts.length === 0 ? (
          <p className="text-sm text-slate-500">Nothing posted yet.</p>
        ) : (
          <ul className="space-y-3">
            {posts.map((post) => (
              <li key={post.id} className="flex gap-3 rounded-xl border border-slate-200 bg-surface p-4">
                {post.imageUrl && (
                  <img src={post.imageUrl} alt="" className="h-16 w-16 shrink-0 rounded-md object-cover" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-slate-500">
                    {dayLabel(post.createdAt)}, {formatTime(post.createdAt)}
                  </p>
                  {post.text ? (
                    <p className="mt-1 text-sm whitespace-pre-wrap wrap-anywhere text-slate-800">{post.text}</p>
                  ) : (
                    <p className="mt-1 text-sm text-slate-500 italic">Photo only</p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(post)}
                  className="shrink-0 self-start text-red-600"
                  aria-label="Delete update"
                >
                  <TrashIcon className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
        {hasMore && (
          <Button variant="secondary" size="sm" onClick={loadOlder}>
            Show older updates
          </Button>
        )}
      </section>
    </div>
  )
}
