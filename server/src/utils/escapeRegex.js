// Escapes text so it is matched literally inside a RegExp. Without this, a
// search containing regex syntax (".*", "(", "[") would behave oddly or, with
// a pathological pattern, run slowly (ReDoS).
export function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
