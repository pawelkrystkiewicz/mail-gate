import type { Context, Next } from 'hono'
import { logger } from './logger'

/**
 * Rate limit configuration
 */
export interface RateLimitConfig {
  /** Maximum number of requests allowed in the window */
  limit: number
  /** Window size in milliseconds (default: 60000 = 1 minute) */
  windowMs?: number
  /** Key generator function - extracts the identifier for rate limiting (default: IP address) */
  keyGenerator?: (c: Context) => string
  /** Whether to skip rate limiting for this request */
  skip?: (c: Context) => boolean
  /** Custom response handler for rate limit exceeded */
  handler?: (c: Context, info: RateLimitInfo) => Response
}

export interface RateLimitInfo {
  limit: number
  remaining: number
  reset: number // Unix timestamp when the window resets
  retryAfter: number // Seconds until the client can retry
}

interface SlidingWindowEntry {
  count: number
  windowStart: number
  previousCount: number
  previousWindowStart: number
}

/**
 * In-memory store for rate limiting using sliding window algorithm
 */
class RateLimitStore {
  private store = new Map<string, SlidingWindowEntry>()
  private cleanupInterval: ReturnType<typeof setInterval>

  constructor(cleanupIntervalMs = 60000) {
    // Periodic cleanup of expired entries
    this.cleanupInterval = setInterval(() => {
      this.cleanup()
    }, cleanupIntervalMs)
  }

  /**
   * Get the current count for a key using sliding window algorithm
   */
  get(key: string, windowMs: number): SlidingWindowEntry {
    const now = Date.now()
    const windowStart = Math.floor(now / windowMs) * windowMs
    const entry = this.store.get(key)

    if (!entry) {
      return {
        count: 0,
        windowStart,
        previousCount: 0,
        previousWindowStart: windowStart - windowMs,
      }
    }

    // If we're in a new window, shift the current to previous
    if (entry.windowStart !== windowStart) {
      // Check if the previous window is the one we just left
      if (entry.windowStart === windowStart - windowMs) {
        return {
          count: 0,
          windowStart,
          previousCount: entry.count,
          previousWindowStart: entry.windowStart,
        }
      }
      // Window is older, reset everything
      return {
        count: 0,
        windowStart,
        previousCount: 0,
        previousWindowStart: windowStart - windowMs,
      }
    }

    return entry
  }

  /**
   * Increment the count for a key
   */
  increment(key: string, windowMs: number): SlidingWindowEntry {
    const now = Date.now()
    const windowStart = Math.floor(now / windowMs) * windowMs
    const existing = this.get(key, windowMs)

    const updated: SlidingWindowEntry = {
      count: existing.windowStart === windowStart ? existing.count + 1 : 1,
      windowStart,
      previousCount: existing.windowStart === windowStart ? existing.previousCount : existing.count,
      previousWindowStart:
        existing.windowStart === windowStart ? existing.previousWindowStart : existing.windowStart,
    }

    this.store.set(key, updated)
    return updated
  }

  /**
   * Calculate the effective count using sliding window algorithm
   */
  calculateSlidingWindowCount(entry: SlidingWindowEntry, windowMs: number): number {
    const now = Date.now()
    const windowStart = Math.floor(now / windowMs) * windowMs
    const elapsedInWindow = now - windowStart
    const windowProgress = elapsedInWindow / windowMs

    // Weight the previous window's count by how much of it is still relevant
    const previousWeight = 1 - windowProgress
    const weightedPreviousCount = entry.previousCount * previousWeight

    return entry.count + weightedPreviousCount
  }

  private cleanup(): void {
    const now = Date.now()
    const maxAge = 5 * 60 * 1000 // 5 minutes

    for (const [key, entry] of this.store.entries()) {
      if (now - entry.windowStart > maxAge) {
        this.store.delete(key)
      }
    }
  }

  destroy(): void {
    clearInterval(this.cleanupInterval)
    this.store.clear()
  }
}

// Singleton store instance
const store = new RateLimitStore()

/**
 * Get the client IP address, respecting X-Forwarded-For header
 */
export function getClientIp(c: Context): string {
  // Check X-Forwarded-For header (set by reverse proxies like Traefik/Nginx)
  const forwardedFor = c.req.header('X-Forwarded-For')
  if (forwardedFor) {
    // Take the first IP (original client)
    const firstIp = forwardedFor.split(',')[0]?.trim()
    if (firstIp) {
      return firstIp
    }
  }

  // Check X-Real-IP header (alternative proxy header)
  const realIp = c.req.header('X-Real-IP')
  if (realIp) {
    return realIp
  }

  // Fall back to direct connection IP
  // In Bun, we need to get this from the connection info
  // For now, use a default that groups all direct connections
  return 'direct'
}

/**
 * Default rate limit exceeded handler
 */
function defaultHandler(c: Context, info: RateLimitInfo): Response {
  return c.json(
    {
      message: 'Too many requests, please try again later',
      retryAfter: info.retryAfter,
    },
    429,
  )
}

/**
 * Mailgun-compatible rate limit exceeded handler
 * Returns error format that Ghost and other Mailgun clients expect
 */
export function mailgunRateLimitHandler(c: Context, _info: RateLimitInfo): Response {
  return c.json(
    {
      message: 'Rate limit exceeded. Please retry after the specified time.',
    },
    429,
  )
}

/**
 * Universal API rate limit exceeded handler
 */
export function universalApiRateLimitHandler(c: Context, info: RateLimitInfo): Response {
  return c.json(
    {
      type: 'rate_limit_error',
      code: 'rate_limit_exceeded',
      message: 'Too many requests, please try again later',
      details: {
        retryAfter: info.retryAfter,
        limit: info.limit,
      },
    },
    429,
  )
}

/**
 * Create rate limiting middleware
 */
export function rateLimiter(config: RateLimitConfig) {
  const {
    limit,
    windowMs = 60000,
    keyGenerator = getClientIp,
    skip,
    handler = defaultHandler,
  } = config

  return async (c: Context, next: Next) => {
    // Check if we should skip rate limiting
    if (skip?.(c)) {
      await next()
      return
    }

    const key = keyGenerator(c)
    const entry = store.increment(key, windowMs)
    const effectiveCount = store.calculateSlidingWindowCount(entry, windowMs)

    // Calculate rate limit info
    const windowStart = Math.floor(Date.now() / windowMs) * windowMs
    const reset = Math.ceil((windowStart + windowMs) / 1000)
    const remaining = Math.max(0, Math.floor(limit - effectiveCount))
    const retryAfter = Math.ceil((windowStart + windowMs - Date.now()) / 1000)

    const info: RateLimitInfo = {
      limit,
      remaining,
      reset,
      retryAfter,
    }

    // Set rate limit headers on all responses
    c.header('X-RateLimit-Limit', String(limit))
    c.header('X-RateLimit-Remaining', String(remaining))
    c.header('X-RateLimit-Reset', String(reset))

    // Check if rate limit exceeded
    if (effectiveCount > limit) {
      c.header('Retry-After', String(retryAfter))

      const path = c.req.path
      logger.warn('Rate limit exceeded', {
        ip: key,
        path,
        count: Math.ceil(effectiveCount),
        limit,
      })

      return handler(c, info)
    }

    await next()
  }
}

/**
 * Configuration loaded from environment variables
 */
export interface RateLimitEnvConfig {
  enabled: boolean
  sendPerMinute: number
  healthPerMinute: number
  globalPerMinute: number
}

/**
 * Load rate limit configuration from environment variables
 */
export function loadRateLimitConfig(): RateLimitEnvConfig {
  const enabled = process.env.RATE_LIMIT_ENABLED !== 'false'
  const sendPerMinute = parseInt(process.env.RATE_LIMIT_SEND_PER_MINUTE ?? '60', 10)
  const healthPerMinute = parseInt(process.env.RATE_LIMIT_HEALTH_PER_MINUTE ?? '120', 10)
  const globalPerMinute = parseInt(process.env.RATE_LIMIT_GLOBAL_PER_MINUTE ?? '200', 10)

  return {
    enabled,
    sendPerMinute: isNaN(sendPerMinute) ? 60 : sendPerMinute,
    healthPerMinute: isNaN(healthPerMinute) ? 120 : healthPerMinute,
    globalPerMinute: isNaN(globalPerMinute) ? 200 : globalPerMinute,
  }
}

// Export store for testing purposes
export { store as _rateLimitStore }
