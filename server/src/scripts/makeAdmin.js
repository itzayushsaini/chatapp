// npm run make-admin -- <username> - the one-off bootstrap for the very
// first admin. There is no admin panel to grant isAdmin from before someone
// already has it, so this exists purely to break that chicken-and-egg
// problem. Every admin after the first can be made one from inside the
// panel itself (not built as a UI action here on purpose - promoting
// another admin is rare enough that a script is fine, and keeps the panel's
// own user-management screen focused on suspend/delete, not privilege
// escalation).
import { connectDb, disconnectDb } from '../config/db.js'
import { User } from '../models/User.js'

async function makeAdmin() {
  const username = process.argv[2]?.trim().toLowerCase()
  if (!username) {
    console.error('Usage: npm run make-admin -- <username>')
    process.exitCode = 1
    return
  }

  await connectDb()

  const user = await User.findOneAndUpdate({ username }, { isAdmin: true }, { new: true })
  if (!user) {
    console.error(`No user found with username "${username}".`)
    process.exitCode = 1
    return
  }

  console.log(`${user.displayName} (@${user.username}) is now an admin.`)
}

makeAdmin()
  .catch((err) => {
    console.error('make-admin failed:', err.message)
    process.exitCode = 1
  })
  .finally(() => disconnectDb())
