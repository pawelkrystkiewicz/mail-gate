import type {
  Email,
  SendResult,
  EmailEvent,
  EventQuery,
  Suppression,
} from './types'

export interface EmailProvider {
  readonly name: string
  readonly batchSize: number
  readonly rateLimit: number

  sendBatch(emails: Email[]): Promise<SendResult[]>

  getEvents?(options: EventQuery): Promise<EmailEvent[]>

  getSuppressions?(): Promise<Suppression[]>
  removeSuppression?(email: string): Promise<void>
}
