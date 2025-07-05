const redisClient = require('../config/redis');

class OTPService {
  constructor() {
    this.otpLength = parseInt(process.env.OTP_LENGTH) || 6;
    this.otpExpiry = parseInt(process.env.OTP_EXPIRY) || 300; // 5 minutes
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
    
    // Check if limit exceeded (max 3 requests per 15 minutes)
    if (requests.length >= 3) {
      return { allowed: false, remainingTime: windowMs - (currentTime - requests[0]) };
    }
    
    // Add current request
    requests.push(currentTime);
    await redisClient.set(rateLimitKey, JSON.stringify(requests), 900); // 15 minutes
    
    return { allowed: true, remainingRequests: 3 - requests.length };
  }
}

module.exports = new OTPService(); 