// npm run seed - creates demo users, friendships and messages for trying the
// app locally or for a demo in the viva.
//
// Safety:
//  - refuses to run when NODE_ENV=production
//  - never deletes anything: if the demo users already exist it stops
import bcrypt from 'bcryptjs'
import mongoose from 'mongoose'

import { connectDb, disconnectDb } from '../config/db.js'
import { isProduction } from '../config/env.js'
import { Conversation } from '../models/Conversation.js'
import { Friendship } from '../models/Friendship.js'
import { Message } from '../models/Message.js'
import { User } from '../models/User.js'
import { pairKey } from '../utils/pairKey.js'

const DEMO_PASSWORD = 'password123'

const DEMO_USERS = [
  { username: 'aman', displayName: 'Aman Verma', bio: 'Final-year CSE. Building PingMe.' },
  { username: 'priya', displayName: 'Priya Sharma', bio: 'Frontend and UI design 🎨' },
  { username: 'rahul', displayName: 'Rahul Singh', bio: '' },
  { username: 'sneha', displayName: 'Sneha Gupta', bio: 'Coffee, code, repeat.' },
]

async function befriend(a, b) {
  const key = pairKey(a._id, b._id)
  await Friendship.create({
    pairKey: key,
    requester: a._id,
    recipient: b._id,
    status: 'accepted',
    respondedAt: new Date(),
  })
  const participants = [a._id, b._id].sort((x, y) => String(x).localeCompare(String(y)))
  return Conversation.create({ pairKey: key, participants })
}

async function addMessages(conversation, lines) {
  // Spread the messages out over the last two days so the date separators
  // ("Yesterday", "Today") show up.
  const start = Date.now() - 2 * 24 * 60 * 60 * 1000
  const step = (2 * 24 * 60 * 60 * 1000) / (lines.length + 1)
  let last
  for (const [i, [sender, text]] of lines.entries()) {
    const createdAt = new Date(start + step * (i + 1))
    last = await Message.create({
      // An explicit _id from the timestamp keeps _id order = time order,
      // which is what history pagination relies on.
      _id: mongoose.Types.ObjectId.createFromTime(createdAt.getTime() / 1000),
      conversation: conversation._id,
      sender: sender._id,
      text,
      clientId: crypto.randomUUID(),
      createdAt,
      updatedAt: createdAt,
    })
  }
  await Conversation.updateOne(
    { _id: conversation._id },
    { lastMessage: { text: last.text, sender: last.sender, createdAt: last.createdAt } },
  )
}

async function seed() {
  if (isProduction) {
    console.error('Refusing to seed: NODE_ENV is production.')
    process.exit(1)
  }

  await connectDb()

  if (await User.exists({ username: { $in: DEMO_USERS.map((u) => u.username) } })) {
    console.log('Demo users already exist - nothing to do.')
    return
  }

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12)
  const [aman, priya, rahul, sneha] = await User.create(
    DEMO_USERS.map((u) => ({ ...u, email: `${u.username}@example.com`, passwordHash })),
    { ordered: true },
  )

  const withPriya = await befriend(aman, priya)
  await addMessages(withPriya, [
    [aman, 'Hey! How are you?'],
    [priya, "I'm good! How about you?"],
    [aman, 'Doing great. Are you working on the project?'],
    [priya, "Yes, almost done. Let's discuss later."],
    [aman, 'Sure 👍'],
  ])
  await befriend(aman, rahul)

  // A pending request, so the Requests tab has something in it.
  await Friendship.create({
    pairKey: pairKey(sneha._id, aman._id),
    requester: sneha._id,
    recipient: aman._id,
    status: 'pending',
  })

  console.log('Seeded demo data. Log in as any of these, password "%s":', DEMO_PASSWORD)
  for (const u of DEMO_USERS) console.log(`  ${u.username}`)
}

seed()
  .catch((err) => {
    console.error('Seed failed:', err.message)
    process.exitCode = 1
  })
  .finally(() => disconnectDb())
