// Same key in either order; its unique index makes crossed requests impossible
export function pairKey(userA, userB) {
  return [String(userA), String(userB)].sort().join('_')
}
