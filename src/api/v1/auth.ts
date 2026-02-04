import type { Context, Next } from 'hono'
import type { APIError } from '../../core/types'

export interface AuthContext {
  apiKey: string
}

function authError(message: string, code: string): APIError {
  return {
    error: {
      type: 'authentication_error',
      code,
      message,
    },
  }
}

export async function bearerAuthMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization')
  const apiKeyHeader = c.req.header('X-API-Key')

  let apiKey: string | undefined

  // Check Bearer token first
  if (authHeader?.startsWith('Bearer ')) {
    apiKey = authHeader.slice(7)
  }
  // Fallback to X-API-Key header
  else if (apiKeyHeader) {
    apiKey = apiKeyHeader
  }

  if (!apiKey) {
    return c.json(
      authError(
        'API key required. Use Bearer token or X-API-Key header.',
        'missing_credentials',
      ),
      401,
    )
  }

  if (apiKey.trim().length === 0) {
    return c.json(authError('API key cannot be empty.', 'invalid_api_key'), 401)
  }

  c.set('auth', { apiKey } as AuthContext)
  await next()
}
