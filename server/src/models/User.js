import mongoose from 'mongoose'

// Shared with the zod schemas so the API and the database enforce the same rule
export const USERNAME_REGEX = /^[a-z0-9_.]{3,20}$/

export const USERNAME_COOLDOWN_DAYS = 30

export const BIO_MAX_LENGTH = 160

const userSchema = new mongoose.Schema(
  {
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
    avatarFileId: { type: mongoose.Schema.Types.ObjectId, default: null },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    // Never loaded unless asked for; missing on an account created with Google
    passwordHash: { type: String, select: false },
    authProvider: { type: String, enum: ['password', 'google'], default: 'password' },
    // No default: a sparse unique index would treat many nulls as duplicates
    googleId: { type: String, unique: true, sparse: true },
    theme: { type: String, enum: ['light', 'dark', 'system'], default: 'light' },
    // Session tokens issued before this are rejected, which signs out other devices
    passwordChangedAt: { type: Date, default: null },
    // Only the SHA-256 hash of the emailed token, never the raw token
    resetPasswordTokenHash: { type: String, select: false, default: null },
    resetPasswordExpires: { type: Date, select: false, default: null },
    lastSeen: { type: Date },
    updatesReadUpTo: { type: mongoose.Schema.Types.ObjectId, default: null },
    isAdmin: { type: Boolean, default: false },
    suspended: { type: Boolean, default: false },
    // false for older accounts, which only get a reminder to add a photo
    photoRequired: { type: Boolean, default: false },
  },
  { timestamps: true },
)

export const User = mongoose.model('User', userSchema)
