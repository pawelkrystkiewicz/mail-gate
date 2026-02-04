import type {
  Email,
  SendResult,
  EmailEvent,
  EventQuery,
  Suppression,
  ProviderCapabilities,
} from './types'

export interface EmailProvider {
  readonly name: string
  readonly batchSize: number
  readonly rateLimit: number
  readonly capabilities: ProviderCapabilities

  sendBatch(emails: Email[], apiKey: string): Promise<SendResult[]>

  getEvents?(options: EventQuery, apiKey: string): Promise<EmailEvent[]>

  getSuppressions?(apiKey: string): Promise<Suppression[]>
  removeSuppression?(email: string, apiKey: string): Promise<void>
}
