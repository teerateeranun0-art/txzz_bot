/**
 * Hybrid Redis / In-Memory Cache Layer.
 * Connects to Redis when REDIS_URL or REDIS_HOST is configured,
 * or gracefully falls back to a high-performance in-memory cache with TTL.
 */

import { config } from '../config.js';
import { logger } from './logger.js';

class InMemoryCache {
  constructor() {
    this.store = new Map();
    this.ttls = new Map();
    // Periodic sweep every 60s
    this.sweepInterval = setInterval(() => this.sweep(), 60_000);
    this.sweepInterval.unref?.();
  }

  get(key) {
    const expireAt = this.ttls.get(key);
    if (expireAt && Date.now() > expireAt) {
      this.delete(key);
      return null;
    }
    return this.store.get(key) ?? null;
  }

  set(key, value, ttlSeconds = 0) {
    this.store.set(key, value);
    if (ttlSeconds > 0) {
      this.ttls.set(key, Date.now() + ttlSeconds * 1000);
    } else {
      this.ttls.delete(key);
    }
    return true;
  }

  delete(key) {
    this.store.delete(key);
    this.ttls.delete(key);
    return true;
  }

  has(key) {
    return this.get(key) !== null;
  }

  clear() {
    this.store.clear();
    this.ttls.clear();
  }

  sweep() {
    const now = Date.now();
    for (const [key, expireAt] of this.ttls.entries()) {
      if (now > expireAt) {
        this.store.delete(key);
        this.ttls.delete(key);
      }
    }
  }

  size() {
    return this.store.size;
  }
}

class CacheManager {
  constructor() {
    this.memory = new InMemoryCache();
    this.isRedis = false;
    this.redisClient = null;
    this.status = 'MEMORY_FALLBACK';
  }

  async init() {
    const redisUrl = process.env.REDIS_URL || (process.env.REDIS_HOST ? `redis://${process.env.REDIS_HOST}:${process.env.REDIS_PORT || 6379}` : null);
    
    if (!redisUrl) {
      this.status = 'MEMORY_FALLBACK';
      logger.info('Redis: ไม่ได้ตั้งค่า REDIS_URL -> ใช้งาน High-Performance In-Memory Cache (Active)');
      return;
    }

    try {
      // Dynamic import to avoid crash if ioredis/redis is not yet installed
      const { createClient } = await import('redis');
      this.redisClient = createClient({ url: redisUrl });
      
      this.redisClient.on('error', (err) => {
        logger.warn('Redis Error, ใช้งาน In-Memory fallback ชั่วคราว:', err.message);
        this.status = 'DISCONNECTED_FALLBACK';
      });

      this.redisClient.on('connect', () => {
        this.isRedis = true;
        this.status = 'ONLINE';
        logger.info('เชื่อมต่อ Redis สำเร็จ (Distributed State Enabled)');
      });

      await this.redisClient.connect();
    } catch (err) {
      logger.warn('ไม่สามารถเชื่อมต่อ Redis ได้ (ใช้งาน In-Memory Fallback):', err.message);
      this.isRedis = false;
      this.status = 'MEMORY_FALLBACK';
    }
  }

  async get(key) {
    if (this.isRedis && this.redisClient?.isReady) {
      try {
        const raw = await this.redisClient.get(key);
        if (raw === null) return null;
        try {
          return JSON.parse(raw);
        } catch {
          return raw;
        }
      } catch (err) {
        logger.warn(`Redis get failed (${key}), reading from memory fallback:`, err.message);
      }
    }
    return this.memory.get(key);
  }

  async set(key, value, ttlSeconds = 0) {
    const serialized = typeof value === 'object' ? JSON.stringify(value) : value;
    this.memory.set(key, value, ttlSeconds);

    if (this.isRedis && this.redisClient?.isReady) {
      try {
        if (ttlSeconds > 0) {
          await this.redisClient.setEx(key, ttlSeconds, serialized);
        } else {
          await this.redisClient.set(key, serialized);
        }
      } catch (err) {
        logger.warn(`Redis set failed (${key}):`, err.message);
      }
    }
    return true;
  }

  async delete(key) {
    this.memory.delete(key);
    if (this.isRedis && this.redisClient?.isReady) {
      try {
        await this.redisClient.del(key);
      } catch (err) {
        logger.warn(`Redis del failed (${key}):`, err.message);
      }
    }
    return true;
  }

  async getStatus() {
    return {
      type: this.isRedis && this.redisClient?.isReady ? 'Redis' : 'In-Memory Cache (TTL)',
      status: this.isRedis && this.redisClient?.isReady ? 'ONLINE' : 'ONLINE (Memory Fallback)',
      keysCached: this.memory.size(),
    };
  }

  async close() {
    if (this.redisClient && this.redisClient.isReady) {
      try {
        await this.redisClient.quit();
      } catch {
        /* ignore */
      }
    }
  }
}

export const cache = new CacheManager();
