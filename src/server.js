require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const connectDB = require('./config/database');
const redisClient = require('./config/redis');

const onboardingRoutes = require('./routes/onboarding');

const app = express();
console.log("hi")

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Rate limiting (global)
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 min
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// Health check
app.get('/health', (req, res) => res.status(200).json({ status: 'ok', service: 'uc-pay-backend' }));

// Onboarding routes
app.use('/api/onboarding', onboardingRoutes);

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