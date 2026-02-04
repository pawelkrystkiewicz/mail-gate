import type { Context } from 'hono'
import { registry } from '../../../core/registry'
import type { APIInfoResponse } from '../../../core/types'

const VERSION = '0.2.0'

export function handleDiscovery(c: Context) {
  const providerName = process.env.MAIL_PROVIDER ?? 'resend'

  let providerInfo = {
    name: providerName,
    batch_size: 100,
    rate_limit: 10,
  }

  let capabilities = {
    batch: true,
    tracking: false,
    events: false,
    suppressions: false,
  }

  if (registry.has(providerName)) {
    const provider = registry.get(providerName)
    providerInfo = {
      name: provider.name,
      batch_size: provider.batchSize,
      rate_limit: provider.rateLimit,
    }
    capabilities = provider.capabilities
  }

  const response: APIInfoResponse = {
    name: 'mail-gate',
    version: VERSION,
    api_version: 'v1',
    provider: providerInfo,
    capabilities,
  }

  return c.json(response, 200)
}
