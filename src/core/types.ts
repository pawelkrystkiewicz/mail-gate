export interface Email {
  from: string
  to: string[]
  subject: string
  html?: string
  text?: string
  tags?: string[]
  variables?: Record<string, Record<string, unknown>>
}

export interface SendResult {
  id: string
  status: 'queued' | 'sent' | 'failed'
  error?: string
}

export interface EmailEvent {
  id: string
  type: 'delivered' | 'opened' | 'clicked' | 'bounced' | 'complained'
  recipient: string
  timestamp: Date
  metadata?: Record<string, unknown>
}

export interface EventQuery {
  begin?: Date
  end?: Date
  limit?: number
  eventType?: EmailEvent['type']
}

export interface Suppression {
  address: string
  reason: string
  createdAt: Date
}

export interface MailgunRequest {
  from: string
  to: string[]
  subject: string
  html?: string
  text?: string
  tags?: string[]
  trackingClicks?: boolean
  trackingOpens?: boolean
  recipientVariables?: Record<string, Record<string, unknown>>
}

export interface MailgunResponse {
  id: string
  message: string
}

// ============================================================================
// Universal API Types
// ============================================================================

export interface EmailAddress {
  email: string
  name?: string
}

export type EmailAddressInput = string | EmailAddress

export interface EmailContent {
  html?: string
  text?: string
}

export interface UniversalEmailRequest {
  from: EmailAddressInput
  to: EmailAddressInput[]
  subject: string
  content: EmailContent
  reply_to?: EmailAddressInput
  tags?: string[]
  metadata?: Record<string, string>
  provider: string
}

export interface UniversalEmailResponse {
  id: string
  status: 'queued' | 'sent' | 'failed'
  provider: string
  provider_id?: string
  created_at: string
}

export interface BatchEmailRequest {
  emails: UniversalEmailRequest[]
  provider: string
}

export interface BatchJobResponse {
  job_id: string
  status: JobStatus
  total: number
  submitted_at: string
  status_url: string
}

export type JobStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'partial'

export interface Job {
  id: string
  status: JobStatus
  total: number
  sent: number
  failed: number
  pending: number
  results: JobEmailResult[]
  created_at: Date
  started_at?: Date
  completed_at?: Date
}

export interface JobEmailResult {
  index: number
  recipient: string
  status: 'pending' | 'queued' | 'sent' | 'failed'
  provider_id?: string
  error?: string
}

export interface JobStatusResponse {
  job_id: string
  status: JobStatus
  progress: {
    total: number
    sent: number
    failed: number
    pending: number
  }
  created_at: string
  started_at?: string
  completed_at?: string
  errors?: {
    index: number
    recipient: string
    code: string
    message: string
  }[]
}

export interface APIError {
  error: {
    type: ErrorType
    code: string
    message: string
    details?: Record<string, unknown>
  }
}

export type ErrorType =
  | 'authentication_error'
  | 'validation_error'
  | 'rate_limit_error'
  | 'provider_error'
  | 'not_found_error'
  | 'server_error'

export interface ProviderCapabilities {
  batch: boolean
  tracking: boolean
  events: boolean
  suppressions: boolean
}

export interface APIInfoResponse {
  name: string
  version: string
  api_version: string
  provider: {
    name: string
    batch_size: number
    rate_limit: number
  }
  capabilities: ProviderCapabilities
}
