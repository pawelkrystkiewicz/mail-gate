import type {
  APIError,
  UniversalEmailRequest,
  BatchEmailRequest,
  EmailAddressInput,
} from '../../core/types'

interface ValidationResult {
  valid: boolean
  error?: APIError
}

interface FieldError {
  field: string
  message: string
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

function isValidEmailAddress(addr: EmailAddressInput): boolean {
  const email = typeof addr === 'string' ? addr : addr.email
  // Basic email validation
  return (
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    /<[^\s@]+@[^\s@]+\.[^\s@]+>$/.test(email)
  )
}

export function validateEmailRequest(
  body: unknown,
): ValidationResult & { data?: UniversalEmailRequest } {
  if (!body || typeof body !== 'object') {
    return {
      valid: false,
      error: validationError([
        { field: 'body', message: 'Request body is required' },
      ]),
    }
  }

  const request = body as Record<string, unknown>
  const errors: FieldError[] = []

  // Validate 'from'
  if (!request.from) {
    errors.push({ field: 'from', message: 'Sender address is required' })
  } else if (!isValidEmailAddress(request.from as EmailAddressInput)) {
    errors.push({ field: 'from', message: 'Invalid sender email address' })
  }

  // Validate 'to'
  if (!request.to) {
    errors.push({ field: 'to', message: 'At least one recipient is required' })
  } else if (!Array.isArray(request.to) || request.to.length === 0) {
    errors.push({
      field: 'to',
      message: 'Recipients must be a non-empty array',
    })
  } else if (request.to.length > 50) {
    errors.push({ field: 'to', message: 'Maximum 50 recipients per email' })
  } else {
    const invalidRecipients = (request.to as EmailAddressInput[]).filter(
      addr => !isValidEmailAddress(addr),
    )
    if (invalidRecipients.length > 0) {
      errors.push({
        field: 'to',
        message: 'One or more recipient addresses are invalid',
      })
    }
  }

  // Validate 'subject'
  if (!request.subject || typeof request.subject !== 'string') {
    errors.push({ field: 'subject', message: 'Subject is required' })
  } else if (request.subject.length > 998) {
    errors.push({
      field: 'subject',
      message: 'Subject cannot exceed 998 characters',
    })
  }

  // Validate 'content'
  if (!request.content || typeof request.content !== 'object') {
    errors.push({ field: 'content', message: 'Content is required' })
  } else {
    const content = request.content as Record<string, unknown>
    if (!content.html && !content.text) {
      errors.push({
        field: 'content',
        message: 'Either html or text content is required',
      })
    }
  }

  // Validate 'tags'
  if (request.tags !== undefined) {
    if (!Array.isArray(request.tags)) {
      errors.push({ field: 'tags', message: 'Tags must be an array' })
    } else if (request.tags.length > 5) {
      errors.push({ field: 'tags', message: 'Maximum 5 tags per email' })
    }
  }

  if (errors.length > 0) {
    return { valid: false, error: validationError(errors) }
  }

  return { valid: true, data: request as unknown as UniversalEmailRequest }
}

export function validateBatchRequest(
  body: unknown,
): ValidationResult & { data?: BatchEmailRequest } {
  if (!body || typeof body !== 'object') {
    return {
      valid: false,
      error: validationError([
        { field: 'body', message: 'Request body is required' },
      ]),
    }
  }

  const request = body as Record<string, unknown>
  const errors: FieldError[] = []

  if (!request.emails) {
    errors.push({ field: 'emails', message: 'Emails array is required' })
  } else if (!Array.isArray(request.emails)) {
    errors.push({ field: 'emails', message: 'Emails must be an array' })
  } else if (request.emails.length === 0) {
    errors.push({ field: 'emails', message: 'At least one email is required' })
  } else if (request.emails.length > 1000) {
    errors.push({ field: 'emails', message: 'Maximum 1000 emails per batch' })
  } else {
    // Validate each email in the batch
    for (let i = 0; i < request.emails.length; i++) {
      const emailResult = validateEmailRequest(request.emails[i])
      if (!emailResult.valid && emailResult.error) {
        const emailErrors = emailResult.error.error.details?.fields as
          | FieldError[]
          | undefined
        if (emailErrors) {
          for (const err of emailErrors) {
            errors.push({
              field: `emails[${i}].${err.field}`,
              message: err.message,
            })
          }
        }
      }
    }
  }

  if (errors.length > 0) {
    return { valid: false, error: validationError(errors) }
  }

  return { valid: true, data: request as unknown as BatchEmailRequest }
}
