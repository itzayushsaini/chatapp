// One button component so every button has the same focus ring, disabled
// look and sizes. `variant` picks the colour.
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
}

export default function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  type = 'button',
  ...props
}) {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-[background-color,color,transform,box-shadow] duration-150 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:outline-none active:scale-[0.97] disabled:cursor-not-allowed disabled:active:scale-100 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...props}
    />
  )
}
