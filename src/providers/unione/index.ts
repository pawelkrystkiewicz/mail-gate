import type { EmailProvider } from '../../core/provider'
import type { Email, SendResult } from '../../core/types'
import { logger } from '../../utils/logger'
import { toUniOneRequest, type UniOneResponse } from './transformer'

export type UniOneRegion = 'us' | 'eu'

const REGION_URLS: Record<UniOneRegion, string> = {
  us: 'https://us1.unione.io',
  eu: 'https://eu1.unione.io',
}

function isUniOneResponse(data: unknown): data is UniOneResponse {
  if (typeof data !== 'object' || data === null) return false
  const obj = data as Record<string, unknown>
  return obj.status === 'success' || obj.status === 'error'
}

export function parseUniOneRegion(value: string | undefined): UniOneRegion {
  if (value === 'eu') return 'eu'
  if (value && value !== 'us') {
    logger.warn(`Invalid UNIONE_REGION "${value}", defaulting to "us"`)
  }
  return 'us'
}

export class UniOneProvider implements EmailProvider {
  readonly name = 'unione'
  readonly batchSize = 500
  readonly rateLimit = 10

  private apiKey: string
  private baseUrl: string

  constructor(apiKey: string, region: UniOneRegion = 'us') {
    this.apiKey = apiKey
    this.baseUrl = REGION_URLS[region]
  }

  async sendBatch(emails: Email[]): Promise<SendResult[]> {
    if (emails.length === 0) return []

    const startTime = Date.now()
    logger.info('Starting UniOne batch send', { totalEmails: emails.length })

    const results: SendResult[] = []

    for (const email of emails) {
      const result = await this.sendSingle(email)
      results.push(result)
    }

    const duration = Date.now() - startTime
    const successful = results.filter(r => r.status === 'queued').length
    const failed = results.filter(r => r.status === 'failed').length

    logger.info('UniOne batch send complete', {
      totalEmails: emails.length,
      successful,
      failed,
      durationMs: duration,
    })

    return results
  }

  private async sendSingle(email: Email): Promise<SendResult> {
    try {
      const request = toUniOneRequest(email)
      const url = `${this.baseUrl}/en/transactional/api/v1/email/send.json`

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'X-API-KEY': this.apiKey,
        },
        body: JSON.stringify(request),
      })

      const json: unknown = await response.json()

      if (!isUniOneResponse(json)) {
        logger.error('UniOne invalid response format', { json })
        return {
          id: '',
          status: 'failed',
          error: 'Invalid response format from UniOne API',
        }
      }

      if (!response.ok) {
        logger.error('UniOne API error', {
          status: response.status,
          message: json.message,
          code: json.code,
        })
        return {
          id: '',
          status: 'failed',
          error: json.message ?? `HTTP ${response.status}`,
        }
      }

      if (json.status === 'error') {
        logger.error('UniOne send error', {
          message: json.message,
          code: json.code,
        })
        return {
          id: '',
          status: 'failed',
          error: json.message ?? 'Unknown error',
        }
      }

      if (json.failed_emails && Object.keys(json.failed_emails).length > 0) {
        const failedAddresses = Object.keys(json.failed_emails)
        logger.warn('UniOne partial failure', {
          failed: failedAddresses,
          reasons: json.failed_emails,
        })

        if (failedAddresses.length === email.to.length) {
          return {
            id: json.job_id ?? '',
            status: 'failed',
            error: `All recipients failed: ${JSON.stringify(json.failed_emails)}`,
          }
        }
      }

      logger.debug('UniOne email sent', {
        jobId: json.job_id,
        emails: json.emails,
      })

      return {
        id: json.job_id ?? '',
        status: 'queued',
      }
    } catch (error) {
      logger.error('UniOne exception', {
        error: error instanceof Error ? error.message : String(error),
      })
      return {
        id: '',
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }
}
