import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { createApiRoutes } from './api/routes'
import { registry } from './core/registry'
import { ResendProvider } from './providers/resend'
import { logger } from './utils/logger'
import { UniOneProvider, parseUniOneRegion } from './providers/unione'

const app = new Hono()

// CORS middleware
app.use('/*', cors())

// Health check endpoint (no auth)
app.get('/health', c => {
  return c.json({
    status: 'ok',
    mode: 'stateless',
    providers: registry.list(),
  })
})

// Mount Mailgun-compatible API at /v3
const api = createApiRoutes()
app.route('/v3', api)

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
const port = parseInt(process.env.PORT ?? '3001', 10)

initializeProviders()

logger.info(`mail-gate starting on port ${port}`)
logger.info('Running in stateless mode - API keys provided per-request')

export default {
  port,
  fetch: app.fetch,
}
