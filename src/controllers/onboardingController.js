const User = require('../models/User');
const otpService = require('../utils/otp');
const notificationService = require('../utils/notification');
const jwtService = require('../utils/jwt');

class OnboardingController {
  // Request OTP for registration, login, or forgot password
  async requestOTP(req, res) {
    try {
      const { identifier, purpose = 'registration' } = req.body;

      // Check rate limiting
      const rateLimit = await otpService.checkRateLimit(identifier, purpose);
      if (!rateLimit.allowed) {
        return res.status(429).json({
          success: false,
          message: 'Too many OTP requests. Please try again later.',
          remainingTime: Math.ceil(rateLimit.remainingTime / 1000 / 60) // minutes
        });
      }

      // Check if OTP already exists
      const existingOTP = await otpService.otpExists(identifier, purpose);
      if (existingOTP) {
        return res.status(400).json({
          success: false,
          message: 'OTP already sent. Please wait before requesting a new one.'
        });
      }

      // For registration, check if user already exists
      if (purpose === 'registration') {
        const existingUser = await User.findOne({
          $or: [{ email: identifier }, { phoneNumber: identifier }]
        });

        if (existingUser) {
          return res.status(400).json({
            success: false,
            message: 'User already exists with this email or phone number'
          });
        }
      }

      // For login and forgot password, check if user exists
      if (purpose === 'login' || purpose === 'forgotPassword') {
        const existingUser = await User.findOne({
          $or: [{ email: identifier }, { phoneNumber: identifier }]
        });

        if (!existingUser) {
          return res.status(404).json({
            success: false,
            message: 'User not found with this email or phone number'
          });
        }
      }

      // Generate and store OTP
      const otp = otpService.generateOTP();
      await otpService.storeOTP(identifier, otp, purpose);

      // Send OTP via notification
      await notificationService.sendOTP(identifier, otp, purpose);

      res.status(200).json({
        success: true,
        message: `OTP sent successfully to ${identifier}`,
        purpose,
        expiresIn: 300 // 5 minutes
      });
    } catch (error) {
      console.error('OTP request error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to send OTP. Please try again.'
      });
    }
  }

  // Verify OTP and complete registration
  async verifyOTPAndRegister(req, res) {
    try {
      const { identifier, otp, firstName, lastName, password } = req.body;

      // Verify OTP
      const otpResult = await otpService.verifyOTP(identifier, otp, 'registration');
      if (!otpResult.success) {
        return res.status(400).json({
          success: false,
          message: otpResult.message
        });
      }

      // Check if user already exists
      const existingUser = await User.findOne({
        $or: [{ email: identifier }, { phoneNumber: identifier }]
      });

      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'User already exists'
        });
      }

      // Create new user
      const user = new User({
        email: identifier.includes('@') ? identifier : null,
        phoneNumber: !identifier.includes('@') ? identifier : null,
        firstName,
        lastName
      });

      // Hash password
      await user.hashPassword(password);

      // Save user
      await user.save();

      // Generate tokens
      const tokens = jwtService.generateTokens({
        userId: user._id,
        email: user.email,
        roles: user.roles
      });

      res.status(201).json({
        success: true,
        message: 'Registration completed successfully',
        data: {
          user: user.getPublicProfile(),
          tokens
        }
      });
    } catch (error) {
      console.error('Registration error:', error);
      res.status(500).json({
        success: false,
        message: 'Registration failed. Please try again.'
      });
    }
  }

  // Login with email/phone and password
  async login(req, res) {
    try {
      const { identifier, password } = req.body;

      // Find user by email or phone
      const user = await User.findOne({
        $or: [{ email: identifier }, { phoneNumber: identifier }]
      });

      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'Invalid credentials'
        });
      }

      if (!user.isActive) {
        return res.status(401).json({
          success: false,
          message: 'Account is deactivated'
        });
      }

      // Verify password
      const isPasswordValid = await user.verifyPassword(password);
      if (!isPasswordValid) {
        return res.status(401).json({
          success: false,
          message: 'Invalid credentials'
        });
      }

      // Update last login
      user.lastLoginAt = new Date();
      await user.save();

      // Generate tokens
      const tokens = jwtService.generateTokens({
        userId: user._id,
        email: user.email,
        roles: user.roles
      });

      res.status(200).json({
        success: true,
        message: 'Login successful',
        data: {
          user: user.getPublicProfile(),
          tokens
        }
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({
        success: false,
        message: 'Login failed. Please try again.'
      });
    }
  }

  // Forgot password - request OTP
  async forgotPassword(req, res) {
    try {
      const { identifier } = req.body;

      // Find user
      const user = await User.findOne({
        $or: [{ email: identifier }, { phoneNumber: identifier }]
      });

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Check rate limiting
      const rateLimit = await otpService.checkRateLimit(identifier, 'forgotPassword');
      if (!rateLimit.allowed) {
        return res.status(429).json({
          success: false,
          message: 'Too many password reset requests. Please try again later.',
          remainingTime: Math.ceil(rateLimit.remainingTime / 1000 / 60)
        });
      }

      // Generate and send OTP
      const otp = otpService.generateOTP();
      await otpService.storeOTP(identifier, otp, 'forgotPassword');
      await notificationService.sendOTP(identifier, otp, 'forgotPassword');

      res.status(200).json({
        success: true,
        message: 'Password reset OTP sent successfully',
        expiresIn: 300
      });
    } catch (error) {
      console.error('Forgot password error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to send password reset OTP'
      });
    }
  }

  // Reset password with OTP
  async resetPassword(req, res) {
    try {
      const { identifier, otp, newPassword } = req.body;

      // Verify OTP
      const otpResult = await otpService.verifyOTP(identifier, otp, 'forgotPassword');
      if (!otpResult.success) {
        return res.status(400).json({
          success: false,
          message: otpResult.message
        });
      }

      // Find user
      const user = await User.findOne({
        $or: [{ email: identifier }, { phoneNumber: identifier }]
      });

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Update password
      await user.hashPassword(newPassword);
      await user.save();

      res.status(200).json({
        success: true,
        message: 'Password reset successfully'
      });
    } catch (error) {
      console.error('Password reset error:', error);
      res.status(500).json({
        success: false,
        message: 'Password reset failed'
      });
    }
  }

  // Refresh access token
  async refreshToken(req, res) {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        return res.status(400).json({
          success: false,
          message: 'Refresh token is required'
        });
      }

      // Verify refresh token
      const decoded = jwtService.verifyRefreshToken(refreshToken);
      
      // Find user
      const user = await User.findById(decoded.userId);
      if (!user || !user.isActive) {
        return res.status(401).json({
          success: false,
          message: 'Invalid refresh token'
        });
      }

      // Generate new tokens
      const tokens = jwtService.generateTokens({
        userId: user._id,
        email: user.email,
        roles: user.roles
      });

      res.status(200).json({
        success: true,
        message: 'Token refreshed successfully',
        data: { tokens }
      });
    } catch (error) {
      console.error('Token refresh error:', error);
      res.status(401).json({
        success: false,
        message: 'Invalid refresh token'
      });
    }
  }

  // Get user profile
  async getProfile(req, res) {
    try {
      const user = req.user;
      
      res.status(200).json({
        success: true,
        data: {
          user: user.getPublicProfile()
        }
      });
    } catch (error) {
      console.error('Get profile error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get profile'
      });
    }
  }

  // Update user profile
  async updateProfile(req, res) {
    try {
      const { firstName, lastName, email, phoneNumber } = req.body;
      const user = req.user;

      // Update fields if provided
      if (firstName) user.firstName = firstName;
      if (lastName) user.lastName = lastName;
      if (email) user.email = email;
      if (phoneNumber) user.phoneNumber = phoneNumber;

      await user.save();

      res.status(200).json({
        success: true,
        message: 'Profile updated successfully',
        data: {
          user: user.getPublicProfile()
        }
      });
    } catch (error) {
      console.error('Update profile error:', error);
      
      if (error.message.includes('already exists')) {
        return res.status(400).json({
          success: false,
          message: error.message
        });
      }

      res.status(500).json({
        success: false,
        message: 'Failed to update profile'
      });
    }
  }

  // Logout (optional - can be handled client-side by removing tokens)
  async logout(req, res) {
    try {
      // In a more advanced implementation, you might want to blacklist the token
      // For now, we'll just return a success response
      res.status(200).json({
        success: true,
        message: 'Logged out successfully'
      });
    } catch (error) {
      console.error('Logout error:', error);
      res.status(500).json({
        success: false,
        message: 'Logout failed'
      });
    }
  }
}

module.exports = new OnboardingController(); 