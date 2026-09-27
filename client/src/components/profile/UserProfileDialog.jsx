import Avatar from '../common/Avatar.jsx'
import Dialog from '../common/Dialog.jsx'

// Someone else's public profile: picture, name, @username and bio - exactly
// the PublicUser fields the server sends, nothing more.
export default function UserProfileDialog({ user, open, onClose, status }) {
  return (
    <Dialog open={open} onClose={onClose} title="Profile">
      <div className="flex flex-col items-center text-center">
        <Avatar user={user} size="xl" />
        <p className="mt-3 text-lg font-semibold text-slate-900">{user.displayName}</p>
        <p className="text-sm text-slate-500">@{user.username}</p>
        {status && <p className="mt-1 text-xs text-slate-500">{status}</p>}
        <p
          className={`mt-4 w-full rounded-xl bg-slate-50 px-4 py-3 text-sm break-words whitespace-pre-wrap ${
            user.bio ? 'text-slate-700' : 'text-slate-400 italic'
          }`}
        >
          {user.bio || 'No bio yet'}
        </p>
      </div>
    </Dialog>
  )
}
