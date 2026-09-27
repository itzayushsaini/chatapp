import { ChatIcon } from './Icons.jsx'

export default function Logo({ small = false }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span
        className={`inline-flex items-center justify-center rounded-xl bg-blue-600 text-white ${
          small ? 'h-8 w-8' : 'h-10 w-10'
        }`}
      >
        <ChatIcon className={small ? 'h-5 w-5' : 'h-6 w-6'} />
      </span>
      <span className={`font-bold text-slate-900 ${small ? 'text-lg' : 'text-2xl'}`}>ChatApp</span>
    </span>
  )
}
