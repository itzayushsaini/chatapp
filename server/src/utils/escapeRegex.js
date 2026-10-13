// So a search is matched literally and can't be a slow regex (ReDoS)
export function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
