import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import { Hono } from 'hono'
import {
  rateLimiter,
  mailgunRateLimitHandler,
  universalApiRateLimitHandler,
  getClientIp,
  loadRateLimitConfig,
  _rateLimitStore,
} from '../src/utils/ratelimit'
import type { Context } from 'hono'

describe('Rate Limiter', () => {
  let app: Hono

  beforeEach(() => {
    // Clear the rate limit store between tests
    // eslint-disable-next-line @typescript-eslint/dot-notation
    _rateLimitStore['store'].clear()
    app = new Hono()
  })

  describe('basic functionality', () => {
    test('allows requests under the limit', async () => {
      app.use(
        '/*',
        rateLimiter({
          limit: 5,
        }),
      )
      app.get('/test', c => c.json({ ok: true }))

      // Make 5 requests - all should succeed
      for (let i = 0; i < 5; i++) {
        const res = await app.request('/test')
        expect(res.status).toBe(200)
      }
    })

    test('blocks requests over the limit', async () => {
      app.use(
        '/*',
        rateLimiter({
          limit: 3,
        }),
      )
      app.get('/test', c => c.json({ ok: true }))

      // First 3 requests should succeed
      for (let i = 0; i < 3; i++) {
        const res = await app.request('/test')
        expect(res.status).toBe(200)
      }

      // 4th request should be rate limited
      const res = await app.request('/test')
      expect(res.status).toBe(429)

      const json = (await res.json()) as { message: string; retryAfter: number }
      expect(json.message).toContain('Too many requests')
      expect(json.retryAfter).toBeGreaterThan(0)
    })

    test('includes rate limit headers in response', async () => {
      app.use(
        '/*',
        rateLimiter({
          limit: 10,
        }),
      )
      app.get('/test', c => c.json({ ok: true }))

      const res = await app.request('/test')

      expect(res.headers.get('X-RateLimit-Limit')).toBe('10')
      expect(res.headers.get('X-RateLimit-Remaining')).toBeTruthy()
      expect(res.headers.get('X-RateLimit-Reset')).toBeTruthy()
    })

    test('includes Retry-After header when rate limited', async () => {
      app.use(
        '/*',
        rateLimiter({
          limit: 1,
        }),
      )
      app.get('/test', c => c.json({ ok: true }))

      // Exhaust limit
      await app.request('/test')

      // Rate limited request
      const res = await app.request('/test')
      expect(res.status).toBe(429)
      expect(res.headers.get('Retry-After')).toBeTruthy()
    })
  })

  describe('key generation', () => {
    test('uses custom key generator when provided', async () => {
      app.use(
        '/*',
        rateLimiter({
          limit: 2,
          keyGenerator: c => c.req.header('X-User-Id') ?? 'anonymous',
        }),
      )
      app.get('/test', c => c.json({ ok: true }))

      // User A can make 2 requests
      const resA1 = await app.request('/test', {
        headers: { 'X-User-Id': 'user-a' },
      })
      const resA2 = await app.request('/test', {
        headers: { 'X-User-Id': 'user-a' },
      })
      expect(resA1.status).toBe(200)
      expect(resA2.status).toBe(200)

      // User A's 3rd request is rate limited
      const resA3 = await app.request('/test', {
        headers: { 'X-User-Id': 'user-a' },
      })
      expect(resA3.status).toBe(429)

      // But User B can still make requests
      const resB1 = await app.request('/test', {
        headers: { 'X-User-Id': 'user-b' },
      })
      expect(resB1.status).toBe(200)
    })

    test('respects X-Forwarded-For header', async () => {
      app.use(
        '/*',
        rateLimiter({
          limit: 1,
        }),
      )
      app.get('/test', c => c.json({ ok: true }))

      // Request from IP 1.1.1.1
      const res1 = await app.request('/test', {
        headers: { 'X-Forwarded-For': '1.1.1.1' },
      })
      expect(res1.status).toBe(200)

      // Second request from same IP is rate limited
      const res2 = await app.request('/test', {
        headers: { 'X-Forwarded-For': '1.1.1.1' },
      })
      expect(res2.status).toBe(429)

      // Request from different IP is allowed
      const res3 = await app.request('/test', {
        headers: { 'X-Forwarded-For': '2.2.2.2' },
      })
      expect(res3.status).toBe(200)
    })

    test('respects X-Real-IP header', async () => {
      app.use(
        '/*',
        rateLimiter({
          limit: 1,
        }),
      )
      app.get('/test', c => c.json({ ok: true }))

      // Request from IP using X-Real-IP
      const res1 = await app.request('/test', {
        headers: { 'X-Real-IP': '3.3.3.3' },
      })
      expect(res1.status).toBe(200)

      // Second request from same IP is rate limited
      const res2 = await app.request('/test', {
        headers: { 'X-Real-IP': '3.3.3.3' },
      })
      expect(res2.status).toBe(429)
    })

    test('X-Forwarded-For takes precedence over X-Real-IP', async () => {
      app.use(
        '/*',
        rateLimiter({
          limit: 1,
        }),
      )
      app.get('/test', c => c.json({ ok: true }))

      // First request with X-Forwarded-For
      const res1 = await app.request('/test', {
        headers: {
          'X-Forwarded-For': '1.1.1.1',
          'X-Real-IP': '2.2.2.2',
        },
      })
      expect(res1.status).toBe(200)

      // Second request with same X-Forwarded-For but different X-Real-IP is rate limited
      const res2 = await app.request('/test', {
        headers: {
          'X-Forwarded-For': '1.1.1.1',
          'X-Real-IP': '3.3.3.3',
        },
      })
      expect(res2.status).toBe(429)
    })
  })

  describe('skip function', () => {
    test('skips rate limiting when skip returns true', async () => {
      app.use(
        '/*',
        rateLimiter({
          limit: 1,
          skip: c => c.req.header('X-Skip-Rate-Limit') === 'true',
        }),
      )
      app.get('/test', c => c.json({ ok: true }))

      // Normal request exhausts limit
      const res1 = await app.request('/test')
      expect(res1.status).toBe(200)

      // Second normal request is rate limited
      const res2 = await app.request('/test')
      expect(res2.status).toBe(429)

      // Request with skip header bypasses rate limit
      const res3 = await app.request('/test', {
        headers: { 'X-Skip-Rate-Limit': 'true' },
      })
      expect(res3.status).toBe(200)
    })
  })

  describe('custom handlers', () => {
    test('uses Mailgun-compatible handler', async () => {
      app.use(
        '/*',
        rateLimiter({
          limit: 1,
          handler: mailgunRateLimitHandler,
        }),
      )
      app.get('/test', c => c.json({ ok: true }))

      // Exhaust limit
      await app.request('/test')

      const res = await app.request('/test')
      expect(res.status).toBe(429)

      const json = (await res.json()) as { message: string }
      expect(json.message).toContain('Rate limit exceeded')
    })

    test('uses Universal API handler', async () => {
      app.use(
        '/*',
        rateLimiter({
          limit: 1,
          handler: universalApiRateLimitHandler,
        }),
      )
      app.get('/test', c => c.json({ ok: true }))

      // Exhaust limit
      await app.request('/test')

      const res = await app.request('/test')
      expect(res.status).toBe(429)

      const json = (await res.json()) as {
        type: string
        code: string
        message: string
        details: { retryAfter: number; limit: number }
      }
      expect(json.type).toBe('rate_limit_error')
      expect(json.code).toBe('rate_limit_exceeded')
      expect(json.details.limit).toBe(1)
      expect(json.details.retryAfter).toBeGreaterThan(0)
    })
  })

  describe('window behavior', () => {
    test('resets count after window expires', async () => {
      // Use a very short window for testing
      app.use(
        '/*',
        rateLimiter({
          limit: 2,
          windowMs: 100, // 100ms window
        }),
      )
      app.get('/test', c => c.json({ ok: true }))

      // Exhaust limit
      await app.request('/test')
      await app.request('/test')

      // Should be rate limited
      const res1 = await app.request('/test')
      expect(res1.status).toBe(429)

      // Wait for window to expire
      await new Promise(resolve => setTimeout(resolve, 150))

      // Should be allowed again
      const res2 = await app.request('/test')
      expect(res2.status).toBe(200)
    })
  })
})

describe('getClientIp', () => {
  test('extracts first IP from X-Forwarded-For with multiple IPs', () => {
    // Create a mock context
    const mockContext = {
      req: {
        header: (name: string) => {
          if (name === 'X-Forwarded-For') {
            return '1.1.1.1, 2.2.2.2, 3.3.3.3'
          }
          return undefined
        },
      },
    } as unknown as Context

    const ip = getClientIp(mockContext)
    expect(ip).toBe('1.1.1.1')
  })

  test('returns direct when no proxy headers present', () => {
    const mockContext = {
      req: {
        header: () => undefined,
      },
    } as unknown as Context

    const ip = getClientIp(mockContext)
    expect(ip).toBe('direct')
  })
})

describe('loadRateLimitConfig', () => {
  const originalEnv = { ...process.env }

  afterEach(() => {
    // Restore original env
    process.env = { ...originalEnv }
  })

  test('uses default values when env vars not set', () => {
    delete process.env.RATE_LIMIT_ENABLED
    delete process.env.RATE_LIMIT_SEND_PER_MINUTE
    delete process.env.RATE_LIMIT_HEALTH_PER_MINUTE
    delete process.env.RATE_LIMIT_GLOBAL_PER_MINUTE

    const config = loadRateLimitConfig()

    expect(config.enabled).toBe(true)
    expect(config.sendPerMinute).toBe(60)
    expect(config.healthPerMinute).toBe(120)
    expect(config.globalPerMinute).toBe(200)
  })

  test('parses env vars correctly', () => {
    process.env.RATE_LIMIT_ENABLED = 'false'
    process.env.RATE_LIMIT_SEND_PER_MINUTE = '30'
    process.env.RATE_LIMIT_HEALTH_PER_MINUTE = '60'
    process.env.RATE_LIMIT_GLOBAL_PER_MINUTE = '100'

    const config = loadRateLimitConfig()

    expect(config.enabled).toBe(false)
    expect(config.sendPerMinute).toBe(30)
    expect(config.healthPerMinute).toBe(60)
    expect(config.globalPerMinute).toBe(100)
  })

  test('handles invalid number values gracefully', () => {
    process.env.RATE_LIMIT_SEND_PER_MINUTE = 'invalid'
    process.env.RATE_LIMIT_HEALTH_PER_MINUTE = 'not-a-number'
    process.env.RATE_LIMIT_GLOBAL_PER_MINUTE = ''

    const config = loadRateLimitConfig()

    // Should fall back to defaults
    expect(config.sendPerMinute).toBe(60)
    expect(config.healthPerMinute).toBe(120)
    expect(config.globalPerMinute).toBe(200)
  })

  test('treats any value other than "false" as enabled', () => {
    process.env.RATE_LIMIT_ENABLED = 'true'
    expect(loadRateLimitConfig().enabled).toBe(true)

    process.env.RATE_LIMIT_ENABLED = '1'
    expect(loadRateLimitConfig().enabled).toBe(true)

    process.env.RATE_LIMIT_ENABLED = 'yes'
    expect(loadRateLimitConfig().enabled).toBe(true)

    process.env.RATE_LIMIT_ENABLED = ''
    expect(loadRateLimitConfig().enabled).toBe(true)
  })
})
