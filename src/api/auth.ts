import type { Context, Next } from 'hono'
import { registry } from '../core/registry'
import { logger } from '../utils/logger'

export async function basicAuthMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization')

  if (!authHeader) {
    logger.warn('Missing Authorization header')
    return c.json({ message: 'Authentication required' }, 401)
  }

  if (!authHeader.startsWith('Basic ')) {
    logger.warn('Invalid Authorization header format')
    return c.json({ message: 'Invalid authentication format' }, 401)
  }

  try {
    const base64Credentials = authHeader.slice(6)
    const credentials = atob(base64Credentials)
    const [providerName, apiKey] = credentials.split(':')

    if (!providerName || !apiKey) {
      logger.warn('Invalid credentials format')
      return c.json({ message: 'Invalid credentials format' }, 401)
    }

    if (!registry.has(providerName)) {
      logger.warn('Unknown provider', { provider: providerName })
      return c.json({ message: `Unknown provider: ${providerName}` }, 401)
    }

    // Store provider and API key in context
    c.set('provider', providerName)
    c.set('apiKey', apiKey)

    await next()
  } catch {
    logger.error('Auth parsing error')
    return c.json({ message: 'Invalid authentication' }, 401)
  }
}
