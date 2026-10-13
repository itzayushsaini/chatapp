// npm run make-admin -- <username>: there is no panel to grant the first admin from
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
