import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { createApiRoutes } from './api/routes'
import { createUniversalApiRoutes } from './api/v1'
import { registry } from './core/registry'
import { ResendProvider } from './providers/resend'
import { logger } from './utils/logger'
import { UniOneProvider, parseUniOneRegion } from './providers/unione'

const app = new Hono()

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
