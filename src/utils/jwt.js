const jwt = require('jsonwebtoken');

class JWTService {
  constructor() {
    this.jwtSecret = process.env.JWT_SECRET;
    this.jwtRefreshSecret = process.env.JWT_REFRESH_SECRET;
    this.jwtExpiresIn = process.env.JWT_EXPIRES_IN || '15m';
    this.jwtRefreshExpiresIn = process.env.JWT_REFRESH_EXPIRES_IN || '7d';
  }

  // Generate access token
  generateAccessToken(payload) {
    if (!this.jwtSecret) {
      throw new Error('JWT_SECRET not configured');
    }

    return jwt.sign(payload, this.jwtSecret, {
      expiresIn: this.jwtExpiresIn,
      issuer: 'uc-pay',
      audience: 'uc-pay-users'
    });
  }

  // Generate refresh token
  generateRefreshToken(payload) {
    if (!this.jwtRefreshSecret) {
      throw new Error('JWT_REFRESH_SECRET not configured');
    }

    return jwt.sign(payload, this.jwtRefreshSecret, {
      expiresIn: this.jwtRefreshExpiresIn,
      issuer: 'uc-pay',
      audience: 'uc-pay-users'
    });
  }

  // Generate both access and refresh tokens
  generateTokens(payload) {
    return {
      accessToken: this.generateAccessToken(payload),
      refreshToken: this.generateRefreshToken(payload),
      expiresIn: this.jwtExpiresIn
    };
  }

  // Verify access token
  verifyAccessToken(token) {
    try {
      return jwt.verify(token, this.jwtSecret, {
        issuer: 'uc-pay',
        audience: 'uc-pay-users'
      });
    } catch (error) {
      throw new Error('Invalid access token');
    }
  }

  // Verify refresh token
  verifyRefreshToken(token) {
    try {
      return jwt.verify(token, this.jwtRefreshSecret, {
        issuer: 'uc-pay',
        audience: 'uc-pay-users'
      });
    } catch (error) {
      throw new Error('Invalid refresh token');
    }
  }

  // Decode token without verification (for getting payload)
  decodeToken(token) {
    try {
      return jwt.decode(token);
    } catch (error) {
      throw new Error('Invalid token format');
    }
  }

  // Get token expiration time
  getTokenExpiration(token) {
    try {
      const decoded = jwt.decode(token);
      return decoded ? new Date(decoded.exp * 1000) : null;
    } catch (error) {
      return null;
    }
  }

  // Check if token is expired
  isTokenExpired(token) {
    try {
      const decoded = jwt.decode(token);
      if (!decoded || !decoded.exp) return true;
      
      const currentTime = Math.floor(Date.now() / 1000);
      return decoded.exp < currentTime;
    } catch (error) {
      return true;
    }
  }
}

module.exports = new JWTService(); 