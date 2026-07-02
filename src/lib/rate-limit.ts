import { Redis } from "ioredis";
import type { Config } from "../config.js";

export type LimitResult = { allowed: boolean; remaining: number; retryAfterSeconds: number };

export class SlidingLimiter {
  private readonly redis: Redis;
  constructor(config: Config) { this.redis = new Redis(config.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 }); }

  async check(key: string, limit: number, windowSeconds: number): Promise<LimitResult> {
    const bucket = Math.floor(Date.now() / (windowSeconds * 1000));
    const redisKey = `limit:${key}:${bucket}`;
    const count = await this.redis.incr(redisKey);
    if (count === 1) await this.redis.expire(redisKey, windowSeconds + 2);
    return { allowed: count <= limit, remaining: Math.max(0, limit - count), retryAfterSeconds: windowSeconds };
  }

  async close() { await this.redis.quit(); }
}
