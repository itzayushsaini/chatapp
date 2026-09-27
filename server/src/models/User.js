import mongoose from 'mongoose'

// 3-20 characters: lowercase letters, digits, underscore and dot. Shared with
// the zod schemas so the API and the database enforce exactly the same rule.
export const USERNAME_REGEX = /^[a-z0-9_.]{3,20}$/

// A username can be changed at most once in this many days. Changing it often
// would let someone hop between names to impersonate others or confuse their
// friends. Registering does not count as a change.
export const USERNAME_COOLDOWN_DAYS = 30

export const BIO_MAX_LENGTH = 160

const userSchema = new mongoose.Schema(
  {
    // The public ID people search for. `unique` creates a unique index, which
    // is what really prevents duplicates - see authService.register and
    // profileService.updateProfile.
    username: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: USERNAME_REGEX,
    },
    usernameChangedAt: { type: Date, default: null },
    displayName: { type: String, required: true, trim: true, minlength: 1, maxlength: 40 },
    bio: { type: String, trim: true, maxlength: BIO_MAX_LENGTH, default: '' },
    // The profile picture's id in GridFS (see storageService), or null for
    // "show my initials".
    avatarFileId: { type: mongoose.Schema.Types.ObjectId, default: null },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    // select: false means a normal query never loads the hash. Only login asks
    // for it explicitly with .select('+passwordHash').
    passwordHash: { type: String, required: true, select: false },
    lastSeen: { type: Date },
  },
  { timestamps: true },
)

export const User = mongoose.model('User', userSchema)
