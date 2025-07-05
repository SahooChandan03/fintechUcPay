const redisClient = require('../config/redis');

class OTPService {
  constructor() {
    this.otpLength = parseInt(process.env.OTP_LENGTH) || 6;
    this.otpExpiry = parseInt(process.env.OTP_EXPIRY) || 300; // 5 minutes
    this.tempUserExpiry = 3600; // 1 hour for temporary user data
  }

  async requestOTPCommon(payload) {
    try {
      console.log(payload,'payload');
      
      const { identifier, purpose = 'registration' } = payload;

      // Check rate limiting
      const rateLimit = await this.checkRateLimit(identifier, purpose);
      if (!rateLimit.allowed) {
        return {
          success: false,
          message: 'Too many OTP requests. Please try again later.',
          remainingTime: Math.ceil(rateLimit.remainingTime / 1000 / 60) // minutes
        };
      }

      // Generate and store OTP
      const otp = this.generateOTP();
      await this.storeOTP(identifier, otp, purpose);

      // Send OTP via notification
      // await notificationService.sendOTP(identifier, otp, purpose);

    return {
        success: true,
        message: `OTP sent successfully to ${identifier}`,
        purpose,
        expiresIn: 300 // 5 minutes
      };
    } catch (error) {
      console.error('OTP request error:', error);
      return {
        success: false,
        message: 'Failed to send OTP. Please try again.'
      }
    }
  }
  // Generate a random OTP
  generateOTP() {
    const digits = '0123456789';
    let otp = '';
    for (let i = 0; i < this.otpLength; i++) {
      otp += digits[Math.floor(Math.random() * digits.length)];
    }
    return otp;
  }

  // Store OTP in Redis with expiry
  async storeOTP(identifier, otp, purpose = 'registration') {
    console.table({identifier,otp,purpose})
    const key = `otp:${purpose}:${identifier}`;
    const value = JSON.stringify({
      otp,
      createdAt: new Date().toISOString(),
      attempts: 0
    });
    
    await redisClient.set(key, value, this.otpExpiry);
    return true;
  }

  // Get OTP from Redis
  async getOTP(identifier, purpose = 'registration') {
    const key = `otp:${purpose}:${identifier}`;
    const data = await redisClient.get(key);
    
    if (!data) {
      return null;
    }
    
    return JSON.parse(data);
  }

  // Verify OTP
  async verifyOTP(identifier, userOTP, purpose = 'registration') {
    const key = `otp:${purpose}:${identifier}`;
    const data = await redisClient.get(key);
    
    if (!data) {
      return { success: false, message: 'OTP expired or not found' };
    }
    
    const otpData = JSON.parse(data);
    
    // Check if OTP matches
    if (otpData.otp !== userOTP) {
      // Increment attempts
      otpData.attempts += 1;
      
      // If too many attempts, delete OTP
      if (otpData.attempts >= 3) {
        await redisClient.del(key);
        return { success: false, message: 'Too many failed attempts. Please request a new OTP.' };
      }
      
      // Update attempts in Redis
      await redisClient.set(key, JSON.stringify(otpData), this.otpExpiry);
      return { success: false, message: 'Invalid OTP' };
    }
    
    // OTP is valid, delete it from Redis
    await redisClient.del(key);
    return { success: true, message: 'OTP verified successfully' };
  }

  // Check if OTP exists (for rate limiting)
  async otpExists(identifier, purpose = 'registration') {
    const key = `otp:${purpose}:${identifier}`;
    const data = await redisClient.get(key);
    return !!data;
  }

  // Clear OTP (for cleanup)
  async clearOTP(identifier, purpose = 'registration') {
    const key = `otp:${purpose}:${identifier}`;
    await redisClient.del(key);
  }

  // Rate limiting for OTP requests
  async checkRateLimit(identifier, purpose = 'registration') {
    const rateLimitKey = `rate_limit:${purpose}:${identifier}`;
    const currentTime = Date.now();
    const windowMs = 15 * 60 * 1000; // 15 minutes
    
    const data = await redisClient.get(rateLimitKey);
    let requests = [];
    
    if (data) {
      requests = JSON.parse(data);
    }
    
    // Remove old requests outside the window
    requests = requests.filter(time => currentTime - time < windowMs);
    
    // Check if limit exceeded (max 5 requests per 15 minutes for OTP)
    if (requests.length >= 5) {
      return { allowed: false, remainingTime: windowMs - (currentTime - requests[0]) };
    }
    
    // Add current request
    requests.push(currentTime);
    await redisClient.set(rateLimitKey, JSON.stringify(requests), 900); // 15 minutes
    
    return { allowed: true, remainingRequests: 5 - requests.length };
  }

  // Store temporary user data in Redis
  async storeTempUser(identifier, type) {
    let tempUserData;
    
    if (type === 'phone') {
      // First contact - create new session
      tempUserData = {
        email: null,
        phoneNumber: identifier,
        emailVerified: null,
        phoneVerified: false,
        createdAt: new Date().toISOString()
      };
    } else if (type === 'email') {
      // Second contact - create new session for email
      tempUserData = {
        email: identifier,
        phoneNumber: null,
        emailVerified: false,
        phoneVerified: null,
        createdAt: new Date().toISOString()
      };
    }
    
    // Store with individual contact keys for easy lookup
    const key = `temp_user:${identifier}`;
    await redisClient.set(key, JSON.stringify(tempUserData), this.tempUserExpiry);
    
    return tempUserData;
  }

  // Get temporary user data from Redis
  async getTempUser(identifier) {
    console.log(identifier,'identifieridentifier');
    
    const key = `temp_user:${identifier}`;
    const data = await redisClient.get(key);
    console.log(data,'datadata');
    
    if (!data) {
      return null;
    }
    
    return JSON.parse(data);
  }

  // Update temporary user verification status
  async updateTempUserVerification(identifier, type, verified = true) {
    const key = `temp_user:${identifier}`;
    const tempUser = await this.getTempUser(identifier);
    
    if (!tempUser) {
      return null;
    }
    
    if (type === 'email') {
      tempUser.emailVerified = verified;
    } else if (type === 'phone') {
      tempUser.phoneVerified = verified;
    }
    
    // Update the temp user
    await redisClient.set(key, JSON.stringify(tempUser), this.tempUserExpiry);
    
    return tempUser;
  }

  // Delete temporary user data
  async deleteTempUser(identifier) {
    const key = `temp_user:${identifier}`;
    await redisClient.del(key);
  }

  // Find temporary user by email or phone
  async findTempUserByContact(identifier) {
    // Try to find by the identifier itself
    let tempUser = await this.getTempUser(identifier);
    
    if (tempUser) {
      return tempUser;
    }
    
    // If not found, check if this identifier is stored as email or phone in other temp users
    // This is a simplified approach - in a real scenario, you might want to maintain an index
    return null;
  }

  // Find temp user by either email or phone
  async findTempUserByEmailOrPhone(emailOrPhone) {
    // First try to find by the identifier itself
    let tempUser = await this.getTempUser(emailOrPhone);
    
    if (tempUser) {
      return tempUser;
    }
    
    // If not found, we need to search through all temp users
    // This is a simplified approach - in production you might want to maintain an index
    // For now, we'll return null and let the caller handle it
    return null;
  }

  // Get all temp user keys (helper method)
  async getAllTempUserKeys() {
    // This is a simplified approach - in production you might want to maintain an index
    // For now, we'll return an empty array and handle the logic differently
    return [];
  }

  // Clear rate limiting for testing (development only)
  async clearRateLimit(identifier, purpose = 'registration') {
    const rateLimitKey = `rate_limit:${purpose}:${identifier}`;
    await redisClient.del(rateLimitKey);
  }

  // Common method to request OTP (used by register endpoint)
  async requestOTPCommon({ identifier, type = 'registration' }) {
    try {
      const purpose = type;
      
      // Check rate limiting
      const rateLimit = await this.checkRateLimit(identifier, purpose);
      if (!rateLimit.allowed) {
        return { 
          success: false, 
          message: 'Too many OTP requests. Please try again later.',
          remainingTime: Math.ceil(rateLimit.remainingTime / 1000 / 60)
        };
      }

      // Check if OTP already exists
      const existingOTP = await this.otpExists(identifier, purpose);
      if (existingOTP) {
        return { 
          success: false, 
          message: 'OTP already sent. Please wait before requesting a new one.' 
        };
      }

      // Generate and store OTP
      const otp = this.generateOTP();
      await this.storeOTP(identifier, otp, purpose);

      return { 
        success: true, 
        message: 'OTP sent successfully',
        otp // In development, you might want to return OTP for testing
      };
    } catch (error) {
      console.error('OTP request error:', error);
      return { 
        success: false, 
        message: 'Failed to send OTP. Please try again.' 
      };
    }
  }
}

const otpService = new OTPService();
otpService.redisClient = redisClient;
module.exports = otpService; 