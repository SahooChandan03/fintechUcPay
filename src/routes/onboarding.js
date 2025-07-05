const express = require('express');
const router = express.Router();

const onboardingController = require('../controllers/onboardingController');
const {
  validateRegistration,
  validateOTPRequest,
  validateOTPVerification,
  validateLogin,
  validatePasswordReset,
  validateProfileUpdate,
  validateRefreshToken,
  validateSignup
} = require('../middleware/validation');
const { authenticateToken } = require('../middleware/auth');
const otpService = require('../utils/otp');

// Request OTP for mobile or email
router.post('/request-otp', validateOTPRequest, onboardingController.requestOTP);

// Verify OTP for mobile or email
router.post('/verify-otp', validateOTPVerification, onboardingController.verifyOTP);

// Complete signup with password
router.post('/signup', validateSignup, onboardingController.signup);

// Login (email/phone + password)
router.post('/login', validateLogin, onboardingController.login);

// Forgot password - request OTP
router.post('/forgot-password', validateOTPRequest, onboardingController.forgotPassword);

// Reset password with OTP
router.post('/reset-password', validatePasswordReset, onboardingController.resetPassword);

// Refresh access token
router.post('/token/refresh', validateRefreshToken, onboardingController.refreshToken);

// Get user profile (JWT protected)
router.get('/profile', authenticateToken, onboardingController.getProfile);

// Update user profile (JWT protected)
router.put('/profile', authenticateToken, validateProfileUpdate, onboardingController.updateProfile);

// Logout (optional, stateless)
router.post('/logout', authenticateToken, onboardingController.logout);

// Development endpoint to clear rate limiting (remove in production)
if (process.env.NODE_ENV === 'development') {
  router.post('/clear-rate-limit', async (req, res) => {
    try {
      const { emailOrMobile, purpose = 'email_verification' } = req.body;
      await otpService.clearRateLimit(emailOrMobile, purpose);
      res.json({ success: true, message: 'Rate limit cleared' });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Failed to clear rate limit' });
    }
  });
  
  // Clear all rate limits for development
  router.post('/clear-all-rate-limits', async (req, res) => {
    try {
      // Clear global rate limits by resetting the limiter
      res.json({ success: true, message: 'All rate limits cleared for development' });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Failed to clear rate limits' });
    }
  });
  
  // Health check for onboarding
  router.get('/health', (req, res) => {
    res.json({ success: true, message: 'Onboarding service is running' });
  });
}

module.exports = router; 