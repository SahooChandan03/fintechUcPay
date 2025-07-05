const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  phoneNumber: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    match: [/^\+?[\d\s-()]+$/, 'Please enter a valid phone number']
  },
  passwordHash: {
    type: String,
    required: true
  },
  salt: {
    type: String,
    required: true
  },
  firstName: {
    type: String,
    required: true,
    trim: true,
    maxlength: 50
  },
  lastName: {
    type: String,
    required: true,
    trim: true,
    maxlength: 50
  },
  kycStatus: {
    type: String,
    enum: ['pending', 'verified', 'rejected'],
    default: 'pending'
  },
  roles: {
    type: [String],
    default: ['user'],
    enum: ['user', 'admin', 'merchant']
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastLoginAt: {
    type: Date
  }
}, {
  timestamps: true
});

// Index for better query performance
userSchema.index({ email: 1 });
userSchema.index({ phoneNumber: 1 });
userSchema.index({ kycStatus: 1 });

// Virtual for full name
userSchema.virtual('fullName').get(function() {
  return `${this.firstName} ${this.lastName}`;
});

// Method to hash password
userSchema.methods.hashPassword = async function(password) {
  const salt = await bcrypt.genSalt(12);
  this.salt = salt;
  this.passwordHash = await bcrypt.hash(password, salt);
};

// Method to verify password
userSchema.methods.verifyPassword = async function(password) {
  return await bcrypt.compare(password, this.passwordHash);
};

// Method to get public profile (without sensitive data)
userSchema.methods.getPublicProfile = function() {
  const userObject = this.toObject();
  delete userObject.passwordHash;
  delete userObject.salt;
  return userObject;
};

// Pre-save middleware to ensure email and phone are unique
userSchema.pre('save', async function(next) {
  if (this.isModified('email') || this.isModified('phoneNumber')) {
    const User = this.constructor;
    const existingUser = await User.findOne({
      $or: [
        { email: this.email },
        { phoneNumber: this.phoneNumber }
      ],
      _id: { $ne: this._id }
    });

    if (existingUser) {
      if (existingUser.email === this.email) {
        throw new Error('Email already exists');
      }
      if (existingUser.phoneNumber === this.phoneNumber) {
        throw new Error('Phone number already exists');
      }
    }
  }
  next();
});

module.exports = mongoose.model('User', userSchema); 