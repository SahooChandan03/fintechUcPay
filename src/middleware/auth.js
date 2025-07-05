const jwtService = require('../utils/jwt');
const User = require('../models/User');

// Middleware to authenticate JWT token
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access token required'
      });
    }

    // Verify the token
    const decoded = jwtService.verifyAccessToken(token);
    
    // Get user from database
    const user = await User.findById(decoded.userId).select('-passwordHash -salt');
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not found'
      });
    }

    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Account is deactivated'
      });
    }

    // Add user to request object
    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired token'
    });
  }
};

// Middleware to check if user has required roles
const authorizeRoles = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const hasRole = req.user.roles.some(role => roles.includes(role));
    
    if (!hasRole) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions'
      });
    }

    next();
  };
};

// Middleware to check if user has completed KYC
const requireKYC = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required'
    });
  }

  if (req.user.kycStatus !== 'verified') {
    return res.status(403).json({
      success: false,
      message: 'KYC verification required',
      kycStatus: req.user.kycStatus
    });
  }

  next();
};

// Optional authentication middleware (doesn't fail if no token)
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
      const decoded = jwtService.verifyAccessToken(token);
      const user = await User.findById(decoded.userId).select('-passwordHash -salt');
      
      if (user && user.isActive) {
        req.user = user;
      }
    }
  } catch (error) {
    // Ignore token errors for optional auth
  }
  
  next();
};

module.exports = {
  authenticateToken,
  authorizeRoles,
  requireKYC,
  optionalAuth
}; 