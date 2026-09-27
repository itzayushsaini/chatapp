import { useAuth } from '../../context/AuthContext.jsx'
import ConfirmDialog from './ConfirmDialog.jsx'

// The "Log out?" confirmation, shared by the sidebar's log out button and
// the Settings page.
export default function LogoutDialog({ open, onClose }) {
  const { user, logout } = useAuth()
  // A Google-only account has no password to "log back in" with.
  const howToReturn =
    user?.authProvider === 'google'
      ? 'You can log back in any time with "Continue with Google".'
      : 'You will need your username (or email) and password to log back in.'

  return (
    <ConfirmDialog open={open} onClose={onClose} title="Log out?" confirmLabel="Log out" danger onConfirm={logout}>
      <p>{howToReturn}</p>
    </ConfirmDialog>
  )
}
