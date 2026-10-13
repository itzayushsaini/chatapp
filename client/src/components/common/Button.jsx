import { buttonClass } from './buttonClass.js'

export default function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  type = 'button',
  ...props
}) {
  return <button type={type} className={buttonClass({ variant, size, className })} {...props} />
}
