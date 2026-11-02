import NodeCache from 'node-cache';
import { logger } from './logger';

// Standard TTL of 5 minutes, checking for expired keys every 1 minute
export const cache = new NodeCache({ stdTTL: 300, checkperiod: 60 });

export const clearCache = () => {
  const stats = cache.getStats();
  cache.flushAll();
  logger.info(`[Cache] Flushed ${stats.keys} keys from memory.`);
  return stats;
};

/** Drops every cached entry whose key starts with `prefix`. */
export const clearCacheByPrefix = (prefix: string) => {
  const keys = cache.keys().filter((k) => k.startsWith(prefix));
  if (keys.length) cache.del(keys);
  return keys.length;
};

// Example utility to wrap fetching data with cache
export const fetchWithCache = async <T>(
  key: string,
  fetchFn: () => Promise<T>,
  ttlSeconds?: number,
): Promise<T> => {
  const cached = cache.get<T>(key);
  if (cached) {
    logger.info(`[Cache] HIT for key: ${key}`);
    return cached;
  }

  logger.info(`[Cache] MISS for key: ${key}. Fetching...`);
  const data = await fetchFn();
  cache.set(key, data, ttlSeconds || 300);
  return data;
};
