import { ChatIcon } from '../common/Icons.jsx'

const SIZES = {
  md: 'h-11 w-11',
  lg: 'h-16 w-16',
}

// The picture for PingMe's own account (the updates channel): the app logo
// on the brand colour, the same size as a user's Avatar.
export default function PingMeAvatar({ size = 'md' }) {
  return (
    <span
      className={`${SIZES[size]} inline-flex shrink-0 items-center justify-center rounded-full bg-brand-600 text-white`}
      aria-hidden="true"
    >
      <ChatIcon className={size === 'lg' ? 'h-8 w-8' : 'h-6 w-6'} />
    </span>
  )
}
