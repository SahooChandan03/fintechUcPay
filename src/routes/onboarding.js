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
  validateRefreshToken
} = require('../middleware/validation');
const { authenticateToken } = require('../middleware/auth');

// Request OTP (registration, login, forgot password)
router.post('/otp/request', validateOTPRequest, onboardingController.requestOTP);

// Verify OTP and complete registration
router.post('/register', validateRegistration, onboardingController.register);

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

module.exports = router; 