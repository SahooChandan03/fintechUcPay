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
      // const rateLimit = await otpService.checkRateLimit(identifier, purpose);
      // if (!rateLimit.allowed) {
      //   return res.status(429).json({
      //     success: false,
      //     message: 'Too many OTP requests. Please try again later.',
      //     remainingTime: Math.ceil(rateLimit.remainingTime / 1000 / 60) // minutes
      //   });
      // }

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
      // await notificationService.sendOTP(identifier, otp, purpose);

     return  res.status(400).json({
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
  // async verifyOTPAndRegister(req, res) {
  //   try {
  //     const { identifier, otp, firstName, lastName, password } = req.body;

  //     // Verify OTP
  //     const otpResult = await otpService.verifyOTP(identifier, otp, 'registration');
  //     if (!otpResult.success) {
  //       return res.status(400).json({
  //         success: false,
  //         message: otpResult.message
  //       });
  //     }

  //     // Check if user already exists
  //     const existingUser = await User.findOne({
  //       $or: [{ email: identifier }, { phoneNumber: identifier }]
  //     });

  //     if (existingUser) {
  //       return res.status(400).json({
  //         success: false,
  //         message: 'User already exists'
  //       });
  //     }

  //     // Create new user
  //     const user = new User({
  //       email: identifier.includes('@') ? identifier : null,
  //       phoneNumber: !identifier.includes('@') ? identifier : null,
  //       firstName,
  //       lastName
  //     });

  //     // Hash password
  //     await user.hashPassword(password);

  //     // Save user
  //     await user.save();

  //     // Generate tokens
  //     const tokens = jwtService.generateTokens({
  //       userId: user._id,
  //       email: user.email,
  //       roles: user.roles
  //     });

  //     res.status(201).json({
  //       success: true,
  //       message: 'Registration completed successfully',
  //       data: {
  //         user: user.getPublicProfile(),
  //         tokens
  //       }
  //     });
  //   } catch (error) {
  //     console.error('Registration error:', error);
  //     res.status(500).json({
  //       success: false,
  //       message: 'Registration failed. Please try again.'
  //     });
  //   }
  // }

  // Request OTP for mobile or email
  async requestOTP(req, res) {
    try {
      const { emailOrMobile } = req.body;

      // Validate input
      const isEmail = emailOrMobile.includes('@');
      const isPhone = /^\+?[\d\s-()]+$/.test(emailOrMobile);
      
      if (!isEmail && !isPhone) {
        return res.status(400).json({
          success: false,
          message: 'Please provide a valid email address or phone number'
        });
      }

      // Check if user already exists with verified email/phone
      const existingUser = await User.findOne({
        $or: [
          { email: emailOrMobile },
          { phoneNumber: emailOrMobile }
        ]
      });

      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'User already exists with this email or phone number'
        });
      }

      // Store temporary user data in Redis
      const type = isEmail ? 'email' : 'phone';
      const tempUser = await otpService.storeTempUser(emailOrMobile, type);

      // Request OTP
      const otpType = isEmail ? 'email_verification' : 'phone_verification';
      const otpResult = await otpService.requestOTPCommon({ 
        identifier: emailOrMobile, 
        type: otpType 
      });

      if (!otpResult.success) {
        return res.status(400).json({
          success: false,
          message: otpResult.message
        });
      }

      res.status(200).json({
        success: true,
        message: `OTP sent successfully to ${emailOrMobile}`,
        data: {
          emailOrMobile,
          type: isEmail ? 'email' : 'phone'
        }
      });
    } catch (error) {
      console.error('OTP request error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to send OTP. Please try again.'
      });
    }
  }

  // Verify OTP for mobile or email
  async verifyOTP(req, res) {
    try {
      const { emailOrMobile, otp } = req.body;

      // Validate input
      const isEmail = emailOrMobile.includes('@');
      const isPhone = /^\+?[\d\s-()]+$/.test(emailOrMobile);
      
      if (!isEmail && !isPhone) {
        return res.status(400).json({
          success: false,
          message: 'Please provide a valid email address or phone number'
        });
      }

      // Get temporary user from Redis
      const tempUser = await otpService.getTempUser(emailOrMobile);

      if (!tempUser) {
        return res.status(400).json({
          success: false,
          message: 'No pending verification found. Please request OTP first.'
        });
      }

      // Verify OTP
      const otpType = isEmail ? 'email_verification' : 'phone_verification';
      const otpResult = await otpService.verifyOTP(emailOrMobile, otp, otpType);
      
      if (!otpResult.success) {
        return res.status(400).json({
          success: false,
          message: otpResult.message
        });
      }

      // Update verification status in Redis
      const type = isEmail ? 'email' : 'phone';
      const updatedTempUser = await otpService.updateTempUserVerification(emailOrMobile, type, true);

      res.status(200).json({
        success: true,
        message: 'OTP verified successfully',
        data: {
          emailOrMobile,
          type: isEmail ? 'email' : 'phone',
          verified: true,
          isFullyVerified: updatedTempUser.isFullyVerified
        }
      });
    } catch (error) {
      console.error('OTP verification error:', error);
      res.status(500).json({
        success: false,
        message: 'OTP verification failed. Please try again.'
      });
    }
  }

  // Complete signup with password
  async signup(req, res) {
    try {
      const { email, phoneNumber, firstName, lastName, password } = req.body;

      // Validate input
      if (!email || !phoneNumber) {
        return res.status(400).json({
          success: false,
          message: 'Both email and phone number are required'
        });
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({
          success: false,
          message: 'Please provide a valid email address'
        });
      }

      // Validate phone format
      const phoneRegex = /^\+?[\d\s-()]+$/;
      if (!phoneRegex.test(phoneNumber)) {
        return res.status(400).json({
          success: false,
          message: 'Please provide a valid phone number'
        });
      }

      // Check if both email and phone are verified in Redis
      const emailTempUser = await otpService.getTempUser(email);
      const phoneTempUser = await otpService.getTempUser(phoneNumber);
      
      if (!emailTempUser || !phoneTempUser) {
        return res.status(400).json({
          success: false,
          message: 'Both email and phone must be verified before signup'
        });
      }

      if (!emailTempUser.emailVerified || !phoneTempUser.phoneVerified) {
        return res.status(400).json({
          success: false,
          message: 'Both email and phone number must be verified before signup',
          data: {
            emailVerified: emailTempUser.emailVerified,
            phoneVerified: phoneTempUser.phoneVerified,
            email: email,
            phoneNumber: phoneNumber
          }
        });
      }

      // Check if both email and phone are verified
      if (!emailTempUser.emailVerified || !phoneTempUser.phoneVerified) {
        return res.status(400).json({
          success: false,
          message: 'Both email and phone number must be verified before signup',
          data: {
            emailVerified: emailTempUser.emailVerified,
            phoneVerified: phoneTempUser.phoneVerified,
            email: email,
            phoneNumber: phoneNumber
          }
        });
      }

      // Check if user already exists
      const existingUser = await User.findOne({
        $or: [
          { email: email },
          { phoneNumber: phoneNumber }
        ]
      });

      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'User already exists with these credentials'
        });
      }

      // Create new user with verified data from Redis
      const user = new User({
        email: email,
        phoneNumber: phoneNumber,
        firstName,
        lastName
      });

      // Hash password
      await user.hashPassword(password);

      // Save user
      await user.save();

      // Clean up temporary data from Redis
      await otpService.deleteTempUser(email);
      await otpService.deleteTempUser(phoneNumber);
      
      // Clear rate limits for both email and phone
      await otpService.clearRateLimit(email, 'email_verification');
      await otpService.clearRateLimit(phoneNumber, 'phone_verification');

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
      console.error('Signup error:', error);
      
      if (error.message.includes('already exists')) {
        return res.status(400).json({
          success: false,
          message: error.message
        });
      }

      res.status(500).json({
        success: false,
        message: 'Registration failed. Please try again.'
      });
    }
  }

  // Login with email/phone and password
  async login(req, res) {
    try {
      const { emailOrMobile, password } = req.body;

      // Find user by email or phone
      const user = await User.findOne({
        $or: [{ email: emailOrMobile }, { phoneNumber: emailOrMobile }]
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
      // await notificationService.sendOTP(identifier, otp, 'forgotPassword');

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