// Three small dots that bounce in sequence, next to "typing…" - the same
// idea WhatsApp and iMessage use so "someone is typing" reads as a live
// signal rather than static text. Decorative (the text next to it already
// says "typing…" for screen readers), so it is aria-hidden.
export default function TypingDots({ className = '' }) {
  return (
    <span className={`inline-flex items-center gap-0.5 ${className}`} aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1 w-1 rounded-full bg-current animate-bounce-dot"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </span>
  )
}
