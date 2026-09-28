import { useState } from 'react'

import { avatarColor, initials } from '../../utils/avatar.js'

const SIZES = {
  sm: 'h-9 w-9 text-sm',
  md: 'h-11 w-11 text-base',
  lg: 'h-16 w-16 text-xl',
  xl: 'h-24 w-24 text-3xl',
}

// The profile picture if there is one, otherwise initials on a coloured
// circle. `online` adds the green dot; leave it undefined for users whose
// presence we are not allowed to know.
export default function Avatar({ user, size = 'md', online }) {
  // If the picture fails to load (deleted a moment ago, network error), fall
  // back to initials. Remembering WHICH url failed means a new picture is
  // tried again automatically.
  const [failedUrl, setFailedUrl] = useState(null)
  const showPhoto = user.avatarUrl && user.avatarUrl !== failedUrl

  return (
    <span className="relative inline-flex shrink-0">
      {showPhoto ? (
        <img
          src={user.avatarUrl}
          alt=""
          onError={() => setFailedUrl(user.avatarUrl)}
          className={`${SIZES[size]} rounded-full bg-slate-200 object-cover`}
        />
      ) : (
        <span
          className={`${SIZES[size]} inline-flex items-center justify-center rounded-full font-semibold text-white`}
          style={{ backgroundColor: avatarColor(user.username) }}
          aria-hidden="true"
        >
          {initials(user.displayName)}
        </span>
      )}
      {online !== undefined && (
        <span className="absolute right-0 bottom-0 h-3 w-3" aria-hidden="true">
          {/* A soft pulse behind the dot, only while actually online - makes
              "online" read as a live signal rather than a static colour. */}
          {online && (
            <span className="animate-online-pulse absolute inset-0 rounded-full bg-emerald-400" />
          )}
          <span
            className={`absolute inset-0 rounded-full ring-2 ring-surface transition-colors duration-300 ${
              online ? 'bg-emerald-500' : 'bg-slate-300'
            }`}
          />
        </span>
      )}
    </span>
  )
}
