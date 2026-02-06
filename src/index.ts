import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { createApiRoutes } from './api/routes'
import { createUniversalApiRoutes } from './api/v1'
import { registry } from './core/registry'
import { ResendProvider } from './providers/resend'
import { logger } from './utils/logger'
import {
  rateLimiter,
  loadRateLimitConfig,
  mailgunRateLimitHandler,
  universalApiRateLimitHandler,
} from './utils/ratelimit'
import { UniOneProvider, parseUniOneRegion } from './providers/unione'

const app = new Hono()

// Load rate limit configuration
const rateLimitConfig = loadRateLimitConfig()

// Parse ALLOWED_ORIGINS from environment
function getAllowedOrigins(): string[] {
  const originsEnv = process.env.ALLOWED_ORIGINS
  if (!originsEnv) {
    logger.warn(
      'ALLOWED_ORIGINS not set - CORS will reject all cross-origin requests',
    )
    return []
  }
  return originsEnv
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean)
}

const allowedOrigins = getAllowedOrigins()

// CORS middleware with restricted origins
app.use(
  '/*',
  cors({
    origin: origin => {
      // If no origins configured, reject all
      if (allowedOrigins.length === 0) {
        return null
      }
      // Check if origin is in allowed list
      if (origin && allowedOrigins.includes(origin)) {
        return origin
      }
      return null
    },
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Provider'],
    exposeHeaders: ['X-Request-Id'],
    maxAge: 86400,
    credentials: true,
  }),
)

// Apply rate limiting middleware (before routes, after CORS)
if (rateLimitConfig.enabled) {
  // Rate limit for health endpoint (more generous)
  app.use(
    '/health',
    rateLimiter({
      limit: rateLimitConfig.healthPerMinute,
    }),
  )

  // Rate limit for Mailgun-compatible email sending endpoint
  app.use(
    '/v3/:domain/messages',
    rateLimiter({
      limit: rateLimitConfig.sendPerMinute,
      handler: mailgunRateLimitHandler,
    }),
  )

  // Rate limit for Universal API email endpoints
  // Use single pattern to avoid double rate limiting on /api/v1/emails/batch
  app.use(
    '/api/v1/emails*',
    rateLimiter({
      limit: rateLimitConfig.sendPerMinute,
      handler: universalApiRateLimitHandler,
    }),
  )

  // Global rate limit for all other endpoints
  app.use(
    '/*',
    rateLimiter({
      limit: rateLimitConfig.globalPerMinute,
      // Skip endpoints that have specific rate limits
      skip: c => {
        const path = c.req.path
        return (
          path === '/health' ||
          /^\/v3\/[^/]+\/messages$/.test(path) ||
          path.startsWith('/api/v1/emails')
        )
      },
    }),
  )

  logger.info('Rate limiting enabled', {
    sendPerMinute: rateLimitConfig.sendPerMinute,
    healthPerMinute: rateLimitConfig.healthPerMinute,
    globalPerMinute: rateLimitConfig.globalPerMinute,
  })
} else {
  logger.warn('Rate limiting is disabled')
}

// Health check endpoint (no auth)
app.get('/health', c => {
  return c.json({
    status: 'ok',
    mode: 'stateless',
    providers: registry.list(),
  })
})

// Mount Mailgun-compatible API at /v3
const mailgunApi = createApiRoutes()
app.route('/v3', mailgunApi)

// Mount Universal API at /api/v1
const universalApi = createUniversalApiRoutes()
app.route('/api/v1', universalApi)

// Initialize providers (stateless - no API keys stored)
function initializeProviders() {
  // Register Resend provider
  registry.register(new ResendProvider())
  logger.info('Registered provider: resend')

  // Register UniOne provider with region config
  const region = parseUniOneRegion(process.env.UNIONE_REGION)
  registry.register(new UniOneProvider(region))
  logger.info('Registered provider: unione', { region })
}

// Start server
const port = parseInt(process.env.PORT ?? '4050', 10)

initializeProviders()

logger.info(`mail-gate starting on port ${port}`)
logger.info('Running in stateless mode - API keys provided per-request')
if (allowedOrigins.length > 0) {
  logger.info('CORS allowed origins', { origins: allowedOrigins })
} else {
  logger.warn('CORS: No allowed origins configured')
}

export default {
  port,
  fetch: app.fetch,
}
