// A shimmering grey placeholder block, shown in place of real content while
// it loads (a chat row, a message bubble) - reads as "something is coming"
// far better than a bare spinner sitting in an empty page. Decorative: the
// caller wraps a group of these in role="status" with an sr-only label for
// screen readers, so a single skeleton needs no label of its own.
export default function Skeleton({ className = '' }) {
  return <div className={`skeleton rounded ${className}`} aria-hidden="true" />
}
