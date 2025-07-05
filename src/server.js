require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const connectDB = require('./config/database');
const redisClient = require('./config/redis');

const onboardingRoutes = require('./routes/onboarding');

const app = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Rate limiting (global) - more lenient for general API
const globalLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 min
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 200, // Increased limit
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many requests, please try again later.'
  }
});
app.use(globalLimiter);

// Specific rate limiting for onboarding routes
const onboardingLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Increased to 100 requests per 15 minutes for onboarding
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many onboarding requests, please try again later.'
  },
  // Add a key generator that's more lenient for development
  keyGenerator: (req) => {
    // In development, use a more generic key to avoid strict rate limiting
    if (process.env.NODE_ENV === 'development') {
      return 'dev-user';
    }
    return req.ip;
  }
});

// Health check
app.get('/health', (req, res) => res.status(200).json({ status: 'ok', service: 'uc-pay-backend' }));

// Onboarding routes with specific rate limiting
app.use('/api/onboarding', onboardingLimiter, onboardingRoutes);

// 404 handler
app.use((req, res, next) => {
  res.status(404).json({ success: false, message: 'API endpoint not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ success: false, message: 'Internal server error' });
});

// Start server
const PORT = process.env.PORT || 3000;
(async () => {
  await connectDB();
  await redisClient.connect();
  app.listen(PORT, () => {
    console.log(`UC-PAY backend running on port ${PORT}`);
  });
})(); 