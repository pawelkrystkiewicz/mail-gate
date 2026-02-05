import { z } from 'zod'
import type {
  APIError,
  UniversalEmailRequest,
  BatchEmailRequest,
} from '../../core/types'

// Custom email validation that handles "Name <email>" format
const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/

function isValidEmail(value: string): boolean {
  const match = /<([^>]+)>/.exec(value)
  const cleanEmail = (match && match[1]) ? match[1] : value
  return emailRegex.test(cleanEmail)
}

const emailString = z.string().refine(isValidEmail, 'Invalid email address')

const emailObject = z.object({
  email: z.string().refine(isValidEmail, 'Invalid email address'),
  name: z.string().optional(),
})

const emailAddress = z.union([emailString, emailObject])

const emailContent = z
  .object({
    html: z.string().optional(),
    text: z.string().optional(),
  })
  .refine(c => c.html || c.text, 'Either html or text content is required')

// Base email schema (without provider - used for batch items)
const baseEmailSchema = z.object({
  from: emailAddress,
  to: z
    .array(emailAddress)
    .min(1, 'At least one recipient is required')
    .max(50, 'Maximum 50 recipients per email'),
  subject: z
    .string()
    .min(1, 'Subject is required')
    .max(998, 'Subject cannot exceed 998 characters'),
  content: emailContent,
  reply_to: emailAddress.optional(),
  tags: z.array(z.string()).max(5, 'Maximum 5 tags per email').optional(),
  metadata: z.record(z.string(), z.string()).optional(),
})

const providerField = z
  .string()
  .min(
    1,
    'Provider is required. Without it, we cannot determine which provider to route your request to and which API key applies.',
  )

// Full email request schema (with provider)
export const emailRequestSchema = baseEmailSchema.extend({
  provider: providerField,
})

// Batch request schema
export const batchRequestSchema = z.object({
  provider: providerField,
  emails: z
    .array(baseEmailSchema)
    .min(1, 'At least one email is required')
    .max(1000, 'Maximum 1000 emails per batch'),
})

interface ValidationResult {
  valid: boolean
  error?: APIError
}

interface FieldError {
  field: string
  message: string
}

function formatZodErrors(error: z.ZodError): FieldError[] {
  return error.issues.map(issue => ({
    field: issue.path.join('.') || 'body',
    message: issue.message,
  }))
}

function validationError(fields: FieldError[]): APIError {
  return {
    error: {
      type: 'validation_error',
      code: 'invalid_request',
      message: 'Request validation failed',
      details: { fields },
    },
  }
}

export function validateEmailRequest(
  body: unknown,
): ValidationResult & { data?: UniversalEmailRequest } {
  const result = emailRequestSchema.safeParse(body)

  if (!result.success) {
    return {
      valid: false,
      error: validationError(formatZodErrors(result.error)),
    }
  }

  return { valid: true, data: result.data as UniversalEmailRequest }
}

export function validateBatchRequest(
  body: unknown,
): ValidationResult & { data?: BatchEmailRequest } {
  const result = batchRequestSchema.safeParse(body)

  if (!result.success) {
    return {
      valid: false,
      error: validationError(formatZodErrors(result.error)),
    }
  }

  return { valid: true, data: result.data as unknown as BatchEmailRequest }
}
