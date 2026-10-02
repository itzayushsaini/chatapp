import { SparklesIcon } from '../common/Icons.jsx'

const SIZES = {
  sm: { box: 'h-9 w-9', icon: 'h-5 w-5' },
  md: { box: 'h-11 w-11', icon: 'h-6 w-6' },
  lg: { box: 'h-16 w-16', icon: 'h-8 w-8' },
}

// PingMe AI's picture: sparkles on a green-to-violet gradient, the same
// sizes as a user's Avatar - so it is never mistaken for a real person.
export default function AiAvatar({ size = 'md' }) {
  const { box, icon } = SIZES[size]
  return (
    <span
      className={`${box} inline-flex shrink-0 items-center justify-center rounded-full bg-linear-135 from-brand-500 via-teal-500 to-violet-500 text-white`}
      aria-hidden="true"
    >
      <SparklesIcon className={icon} />
    </span>
  )
}
