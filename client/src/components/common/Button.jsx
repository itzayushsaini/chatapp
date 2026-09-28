import { buttonClass } from './buttonClass.js'

// One button component so every button has the same focus ring, disabled
// look and sizes. `variant` picks the colour; the classes themselves live in
// buttonClass.js so links can share them.
export default function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  type = 'button',
  ...props
}) {
  return <button type={type} className={buttonClass({ variant, size, className })} {...props} />
}
