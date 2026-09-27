// One key per PAIR of users, whichever order they are given in:
//
//   pairKey(aman, priya) === pairKey(priya, aman)  // 'aaa..._bbb...'
//
// Friendship and Conversation both have a UNIQUE index on pairKey, so the
// database itself makes duplicate or crossed friend requests impossible.
export function pairKey(userA, userB) {
  return [String(userA), String(userB)].sort().join('_')
}
