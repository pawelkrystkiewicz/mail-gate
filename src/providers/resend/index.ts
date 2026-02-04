import { Resend } from 'resend'
import type { EmailProvider } from '../../core/provider'
import type { Email, SendResult, ProviderCapabilities } from '../../core/types'
import { processBatchesParallel } from '../../utils/batch'
import { logger } from '../../utils/logger'
import { toResendBatch } from './transformer'

export class ResendProvider implements EmailProvider {
  readonly name = 'resend'
  readonly batchSize = 100
  readonly rateLimit = 10 // Resend allows 10 requests/second
  readonly concurrency = 5 // Max parallel requests
  readonly capabilities: ProviderCapabilities = {
    batch: true,
    tracking: true,
    events: false,
    suppressions: false,
  }

  async sendBatch(emails: Email[], apiKey: string): Promise<SendResult[]> {
    if (emails.length === 0) return []

    const client = new Resend(apiKey)
    const startTime = Date.now()
    logger.info('Starting batch send', { totalEmails: emails.length })

    const results = await processBatchesParallel(
      emails,
      this.batchSize,
      batch => this.sendSingleBatch(client, batch),
      {
        concurrency: this.concurrency,
        rateLimit: this.rateLimit,
      },
    )

    const duration = Date.now() - startTime
    const successful = results.filter(r => r.status === 'queued').length
    const failed = results.filter(r => r.status === 'failed').length

    logger.info('Batch send complete', {
      totalEmails: emails.length,
      successful,
      failed,
      durationMs: duration,
      emailsPerSecond: Math.round((emails.length / duration) * 1000),
    })

    return results
  }

  private async sendSingleBatch(
    client: Resend,
    batch: Email[],
  ): Promise<SendResult[]> {
    try {
      const resendEmails = toResendBatch(batch)
      const response = await client.batch.send(resendEmails)

      if (response.error) {
        logger.error('Resend batch error', { error: response.error })
        return batch.map(() => ({
          id: '',
          status: 'failed' as const,
          error: response.error.message,
        }))
      }

      // Resend batch response: { data: { data: Array<{id: string}> } }
      const items = response.data.data
      if (items.length === 0) {
        logger.warn('Batch returned no items')
        return batch.map(() => ({
          id: '',
          status: 'failed' as const,
          error: 'No items in response',
        }))
      }

      logger.debug('Batch sent', { count: items.length })
      return items.map(r => ({
        id: r.id,
        status: 'queued' as const,
      }))
    } catch (error) {
      logger.error('Resend batch exception', {
        error: error instanceof Error ? error.message : String(error),
      })
      return batch.map(() => ({
        id: '',
        status: 'failed' as const,
        error: error instanceof Error ? error.message : 'Unknown error',
      }))
    }
  }
}
