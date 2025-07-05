const redis = require('redis');

class RedisClient {
  constructor() {
    this.client = null;
  }

  async connect() {
    try {
      this.client = redis.createClient({
        url: process.env.REDIS_URL,
        // password: process.env.REDIS_PASSWORD || undefined,
      });

      this.client.on('error', (err) => {
        console.error('Redis Client Error:', err);
      });

      this.client.on('connect', () => {
        console.log('Redis Connected');
      });

      await this.client.connect();
    } catch (error) {
      console.error('Redis connection error:', error);
      process.exit(1);
    }
  }

  async set(key, value, expiry = null) {
    try {
      if (expiry) {
        await this.client.setEx(key, expiry, value);
      } else {
        await this.client.set(key, value);
      }
    } catch (error) {
      console.error('Redis SET error:', error);
      throw error;
    }
  }

  async get(key) {
    try {
      return await this.client.get(key);
    } catch (error) {
      console.error('Redis GET error:', error);
      throw error;
    }
  }

  async del(key) {
    try {
      await this.client.del(key);
    } catch (error) {
      console.error('Redis DEL error:', error);
      throw error;
    }
  }

  async disconnect() {
    if (this.client) {
      await this.client.quit();
    }
  }
}

const redisClient = new RedisClient();
module.exports = redisClient; 