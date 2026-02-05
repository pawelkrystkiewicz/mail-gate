// Universal API v1 Types
import { z } from 'zod'

// Email address schema - can be a string or structured object
const EmailAddressObjectSchema = z.object({
  email: z.email(),
  name: z.string().optional(),
})

const EmailAddressSchema = z.union([z.email(), EmailAddressObjectSchema])

// Single email request schema
export const SendEmailRequestSchema = z
  .object({
    from: EmailAddressSchema,
    to: z.union([EmailAddressSchema, z.array(EmailAddressSchema).min(1)]),
    subject: z.string().min(1),
    html: z.string().optional(),
    text: z.string().optional(),
    tags: z.array(z.string()).optional(),
    metadata: z.record(z.unknown()).optional(),
  })
  .refine(data => data.html !== undefined || data.text !== undefined, {
    message: 'Either html or text content is required',
  })

// Batch email request schema
export const BatchEmailRequestSchema = z.object({
  emails: z.array(SendEmailRequestSchema).min(1),
})

// Infer types from schemas
export type EmailAddress = z.infer<typeof EmailAddressSchema>
export type SendEmailRequest = z.infer<typeof SendEmailRequestSchema>
export type BatchEmailRequest = z.infer<typeof BatchEmailRequestSchema>

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
