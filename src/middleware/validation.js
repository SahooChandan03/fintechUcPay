const { body, param, query, validationResult } = require('express-validator');

// Middleware to handle validation errors
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array().map(error => ({
        field: error.path,
        message: error.msg,
        value: error.value
      }))
    });
  }
  next();
};

// Validation rules for registration
const validateRegistration = [
  body('email')
    .isEmail()
    .withMessage('Please provide a valid email address')
    .normalizeEmail(),
  body('phoneNumber')
    .matches(/^\+?[\d\s-()]+$/)
    .withMessage('Please provide a valid phone number'),
  body('firstName')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('First name must be between 2 and 50 characters'),
  body('lastName')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Last name must be between 2 and 50 characters'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'),
  handleValidationErrors
];

// Validation rules for OTP request
const validateOTPRequest = [
  body('identifier')
    .notEmpty()
    .withMessage('Email or phone number is required')
    .custom((value) => {
      const isEmail = value.includes('@');
      const isPhone = /^\+?[\d\s-()]+$/.test(value);
      
      if (!isEmail && !isPhone) {
        throw new Error('Please provide a valid email address or phone number');
      }
      return true;
    }),
  body('purpose')
    .optional()
    .isIn(['registration', 'login', 'forgotPassword'])
    .withMessage('Invalid purpose'),
  handleValidationErrors
];

// Validation rules for OTP verification
const validateOTPVerification = [
  body('identifier')
    .notEmpty()
    .withMessage('Email or phone number is required'),
  body('otp')
    .isLength({ min: 6, max: 6 })
    .withMessage('OTP must be 6 digits')
    .isNumeric()
    .withMessage('OTP must contain only numbers'),
  body('purpose')
    .optional()
    .isIn(['registration', 'login', 'forgotPassword'])
    .withMessage('Invalid purpose'),
  handleValidationErrors
];

// Validation rules for login
const validateLogin = [
  body('identifier')
    .notEmpty()
    .withMessage('Email or phone number is required'),
  body('password')
    .notEmpty()
    .withMessage('Password is required'),
  handleValidationErrors
];

// Validation rules for password reset
const validatePasswordReset = [
  body('identifier')
    .notEmpty()
    .withMessage('Email or phone number is required'),
  body('newPassword')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'),
  handleValidationErrors
];

// Validation rules for profile update
const validateProfileUpdate = [
  body('firstName')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('First name must be between 2 and 50 characters'),
  body('lastName')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Last name must be between 2 and 50 characters'),
  body('email')
    .optional()
    .isEmail()
    .withMessage('Please provide a valid email address')
    .normalizeEmail(),
  body('phoneNumber')
    .optional()
    .matches(/^\+?[\d\s-()]+$/)
    .withMessage('Please provide a valid phone number'),
  handleValidationErrors
];

// Validation rules for refresh token
const validateRefreshToken = [
  body('refreshToken')
    .notEmpty()
    .withMessage('Refresh token is required'),
  handleValidationErrors
];

// Validation rules for user ID parameter
const validateUserId = [
  param('userId')
    .isMongoId()
    .withMessage('Invalid user ID format'),
  handleValidationErrors
];

module.exports = {
  handleValidationErrors,
  validateRegistration,
  validateOTPRequest,
  validateOTPVerification,
  validateLogin,
  validatePasswordReset,
  validateProfileUpdate,
  validateRefreshToken,
  validateUserId
}; 