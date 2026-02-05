// Universal API v1 Types

// Email address can be a string or structured object
export type EmailAddress =
  | string
  | {
      email: string
      name?: string
    }

// Single email request
export interface SendEmailRequest {
  from: EmailAddress
  to: EmailAddress | EmailAddress[]
  subject: string
  html?: string
  text?: string
  tags?: string[]
  metadata?: Record<string, unknown>
}

// Batch email request
export interface BatchEmailRequest {
  emails: SendEmailRequest[]
}

// Single email response
export interface SendEmailResponse {
  id: string
  status: 'queued' | 'sent'
  message: string
}

// Batch job status
export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed'

// Batch email response (202 Accepted)
export interface BatchEmailResponse {
  jobId: string
  status: JobStatus
  message: string
  statusUrl: string
}

// Job status response
export interface JobStatusResponse {
  jobId: string
  status: JobStatus
  total: number
  sent: number
  failed: number
  errors?: {
    index: number
    error: string
  }[]
  createdAt: string
  completedAt?: string
}

// API info response
export interface ApiInfoResponse {
  name: string
  version: string
  providers: string[]
  features: {
    singleEmail: boolean
    batchEmail: boolean
    jobTracking: boolean
    maxBatchSize: number
  }
}

// Error response
export interface ApiErrorResponse {
  type: 'validation_error' | 'auth_error' | 'provider_error' | 'internal_error'
  code: string
  message: string
  details?: Record<string, unknown>
}

// Helper to normalize email address to string
export function normalizeEmailAddress(addr: EmailAddress): string {
  if (typeof addr === 'string') {
    return addr
  }
  if (addr.name) {
    return `${addr.name} <${addr.email}>`
  }
  return addr.email
}

// Helper to normalize email addresses array
export function normalizeEmailAddresses(
  addrs: EmailAddress | EmailAddress[],
): string[] {
  const list = Array.isArray(addrs) ? addrs : [addrs]
  return list.map(normalizeEmailAddress)
}
