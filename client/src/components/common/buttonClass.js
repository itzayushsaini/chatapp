// The look of every button, as a plain class list - used by Button.jsx, and
// on its own wherever a LINK has to look like a button (the home page's
// "Get started" and "Log in" navigate to other pages, so they must be <a>,
// not <button>). A separate file because a file of React components should
// only export components (that is what keeps Vite's hot reload working).
const VARIANTS = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 disabled:bg-brand-300',
  secondary: 'border border-slate-300 bg-surface text-slate-700 hover:bg-slate-50 disabled:text-slate-400',
  // brightness/opacity rather than red-700/red-300: dark mode re-uses those
  // two shades for light text on dark alert boxes (see index.css).
  danger: 'bg-red-600 text-white hover:brightness-90 disabled:opacity-50',
  ghost: 'text-slate-600 hover:bg-slate-100 disabled:text-slate-300',
}

const SIZES = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2.5 text-sm',
  lg: 'px-6 py-3 text-base',
}

export function buttonClass({ variant = 'primary', size = 'md', className = '' } = {}) {
  return `inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-[background-color,color,transform,box-shadow] duration-150 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:outline-none active:scale-[0.97] disabled:cursor-not-allowed disabled:active:scale-100 ${VARIANTS[variant]} ${SIZES[size]} ${className}`
}
