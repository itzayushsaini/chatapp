// The caller wraps a group of these in role="status" with an sr-only label.
export default function Skeleton({ className = '' }) {
  return <div className={`skeleton rounded ${className}`} aria-hidden="true" />
}
