import { Hono } from 'hono'
import { bearerAuthMiddleware } from './auth'
import { handleDiscovery } from './handlers/discovery'
import { handleSendEmail, handleSendBatch } from './handlers/emails'
import { handleGetJob } from './handlers/jobs'

export function createUniversalApiRoutes() {
  const api = new Hono()

  // Discovery endpoint (no auth required)
  api.get('/', handleDiscovery)

  // All other endpoints require authentication
  api.use('/*', bearerAuthMiddleware)

  // Email sending
  api.post('/emails', handleSendEmail)
  api.post('/emails/batch', handleSendBatch)

  // Job status
  api.get('/jobs/:id', handleGetJob)

  return api
}
