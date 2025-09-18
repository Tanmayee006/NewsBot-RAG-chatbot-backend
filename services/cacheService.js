const redisClient = require('../config/redis');

class CacheService {
  constructor() {
    this.defaultTTL = parseInt(process.env.CACHE_TTL) || 3600; // 1 hour
  }

  // Query result caching
  async cacheQueryResult(query, result, ttl = this.defaultTTL) {
    try {
      const key = this.getQueryCacheKey(query);
      const data = {
        result,
        timestamp: new Date().toISOString(),
        query: query
      };
      
      await redisClient.setEx(key, ttl, JSON.stringify(data));
      return true;
    } catch (error) {
      console.error('Cache write error:', error);
      return false;
    }
  }

  async getCachedQueryResult(query) {
    try {
      const key = this.getQueryCacheKey(query);
      const cached = await redisClient.get(key);
      
      if (cached) {
        const data = JSON.parse(cached);
        return {
          ...data.result,
          fromCache: true,
          cachedAt: data.timestamp
        };
      }
      
      return null;
    } catch (error) {
      console.error('Cache read error:', error);
      return null;
    }
  }

  // Session caching helpers
  async getSessionFromCache(sessionId) {
    try {
      const data = await redisClient.get(`session:${sessionId}`);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('Session cache read error:', error);
      return null;
    }
  }

  async updateSessionCache(sessionId, sessionData, ttl = 86400) {
    try {
      await redisClient.setEx(
        `session:${sessionId}`,
        ttl,
        JSON.stringify(sessionData)
      );
      return true;
    } catch (error) {
      console.error('Session cache write error:', error);
      return false;
    }
  }

  // Cache warming for popular queries
  async warmCache(popularQueries) {
    console.log('🔥 Warming cache with popular queries...');
    
    for (const query of popularQueries) {
      try {
        // Check if already cached
        const cached = await this.getCachedQueryResult(query);
        if (!cached) {
          console.log(`Warming cache for: ${query}`);
          // This would trigger RAG processing
          await processRAGQuery(query, 'cache-warming');
        }
      } catch (error) {
        console.error(`Failed to warm cache for query: ${query}`, error);
      }
    }
  }

  // Utility methods
  getQueryCacheKey(query) {
    return `query:${Buffer.from(query.toLowerCase().trim()).toString('base64')}`;
  }

  async clearCache(pattern = '*') {
    try {
      const keys = await redisClient.keys(pattern);
      if (keys.length > 0) {
        await redisClient.del(keys);
        console.log(`🗑️ Cleared ${keys.length} cache entries`);
      }
      return keys.length;
    } catch (error) {
      console.error('Cache clear error:', error);
      return 0;
    }
  }

  async getCacheStats() {
    try {
      const info = await redisClient.info('memory');
      const keyCount = await redisClient.dbSize();
      
      return {
        keyCount,
        memoryInfo: info,
        isConnected: redisClient.isReady
      };
    } catch (error) {
      console.error('Cache stats error:', error);
      return { error: error.message };
    }
  }
}

module.exports = new CacheService();
