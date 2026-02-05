import type { Context, Next } from 'hono'
import { registry } from '../../core/registry'
import { logger } from '../../utils/logger'
import type { ApiErrorResponse } from './types'

function authError(c: Context, code: string, message: string): Response {
  const error: ApiErrorResponse = {
    type: 'auth_error',
    code,
    message,
  }
  return c.json(error, 401)
}

export async function bearerAuthMiddleware(c: Context, next: Next) {
  // Get API key from Bearer token or X-API-Key header
  const authHeader = c.req.header('Authorization')
  const apiKeyHeader = c.req.header('X-API-Key')

  let apiKey: string | undefined

  if (authHeader) {
    if (!authHeader.startsWith('Bearer ')) {
      logger.warn('Invalid Authorization header format')
      return authError(
        c,
        'invalid_auth_format',
        'Authorization header must use Bearer scheme',
      )
    }
    apiKey = authHeader.slice(7) // Remove 'Bearer '
  } else if (apiKeyHeader) {
    apiKey = apiKeyHeader
  }

  if (!apiKey) {
    logger.warn('Missing API key')
    return authError(
      c,
      'missing_api_key',
      'API key required via Authorization: Bearer <key> or X-API-Key header',
    )
  }

  // Get provider from X-Provider header
  const providerName = c.req.header('X-Provider')

  if (!providerName) {
    logger.warn('Missing X-Provider header')
    return authError(c, 'missing_provider', 'X-Provider header is required')
  }

  if (!registry.has(providerName)) {
    logger.warn('Unknown provider', { provider: providerName })
    return authError(c, 'unknown_provider', `Unknown provider: ${providerName}`)
  }

  // Store provider and API key in context
  c.set('provider', providerName)
  c.set('apiKey', apiKey)

  await next()
}
