import type { Context } from 'hono'
import { registry } from '../../../core/registry'
import type { UniversalEmailResponse, APIError } from '../../../core/types'
import { logger } from '../../../utils/logger'
import { toInternalEmail, toInternalEmails } from '../transformer'
import { validateEmailRequest, validateBatchRequest } from '../validation'
import { jobStore, JobStoreFullError } from '../../../services/job-store'
import type { AuthContext } from '../auth'

function generateId(prefix: string): string {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).substring(2, 10)
  return `${prefix}_${timestamp}${random}`
}

export async function handleSendEmail(c: Context) {
  try {
    const body: unknown = await c.req.json()
    const validation = validateEmailRequest(body)

    if (!validation.valid || !validation.data) {
      return c.json(validation.error, 400)
    }

    const providerName = validation.data.provider

    if (!registry.has(providerName)) {
      const error: APIError = {
        error: {
          type: 'validation_error',
          code: 'invalid_provider',
          message: `Unknown provider "${providerName}". Available: ${registry.list().join(', ')}`,
        },
      }
      return c.json(error, 400)
    }

    const provider = registry.get(providerName)
    const email = toInternalEmail(validation.data)
    const { apiKey } = c.get('auth') as AuthContext

    const results = await provider.sendBatch([email], apiKey)
    const result = results[0]

    if (!result || result.status === 'failed') {
      const error: APIError = {
        error: {
          type: 'provider_error',
          code: 'send_failed',
          message: result?.error ?? 'Failed to send email',
        },
      }
      return c.json(error, 502)
    }

    const response: UniversalEmailResponse = {
      id: generateId('msg'),
      status: result.status,
      provider: providerName,
      provider_id: result.id,
      created_at: new Date().toISOString(),
    }

    return c.json(response, 200)
  } catch (error) {
    logger.error('Email send error', {
      error: error instanceof Error ? error.message : String(error),
    })

    const apiError: APIError = {
      error: {
        type: 'server_error',
        code: 'internal_error',
        message: 'An unexpected error occurred',
      },
    }
    return c.json(apiError, 500)
  }
}

export async function handleSendBatch(c: Context) {
  try {
    const body: unknown = await c.req.json()
    const validation = validateBatchRequest(body)

    if (!validation.valid || !validation.data) {
      return c.json(validation.error, 400)
    }

    const providerName = validation.data.provider

    if (!registry.has(providerName)) {
      const error: APIError = {
        error: {
          type: 'validation_error',
          code: 'invalid_provider',
          message: `Unknown provider "${providerName}". Available: ${registry.list().join(', ')}`,
        },
      }
      return c.json(error, 400)
    }

    // Create job
    const jobId = generateId('job')
    const emails = toInternalEmails(validation.data.emails)
    const { apiKey } = c.get('auth') as AuthContext
    const recipients = validation.data.emails.map(e => {
      const to = e.to[0]
      if (!to) return ''
      return typeof to === 'string' ? to : to.email
    })

    let job
    try {
      job = jobStore.create(jobId, recipients)
    } catch (error) {
      if (error instanceof JobStoreFullError) {
        const apiError: APIError = {
          error: {
            type: 'rate_limit_error',
            code: 'too_many_jobs',
            message: 'Too many pending jobs, please try again later',
          },
        }
        return c.json(apiError, 429)
      }
      throw error
    }

    // Process in background with error handling
    processJobAsync(jobId, emails, providerName, apiKey).catch(error => {
      logger.error('Unhandled job processing error', {
        jobId,
        error: error instanceof Error ? error.message : String(error),
      })
      jobStore.updateStatus(jobId, 'failed')
    })

    return c.json(
      {
        job_id: job.id,
        status: job.status,
        total: job.total,
        submitted_at: job.created_at.toISOString(),
        status_url: `/api/v1/jobs/${job.id}`,
      },
      202,
    )
  } catch (error) {
    logger.error('Batch send error', {
      error: error instanceof Error ? error.message : String(error),
    })

    const apiError: APIError = {
      error: {
        type: 'server_error',
        code: 'internal_error',
        message: 'An unexpected error occurred',
      },
    }
    return c.json(apiError, 500)
  }
}

async function processJobAsync(
  jobId: string,
  emails: ReturnType<typeof toInternalEmails>,
  providerName: string,
  apiKey: string,
) {
  try {
    jobStore.updateStatus(jobId, 'processing')

    const provider = registry.get(providerName)
    const results = await provider.sendBatch(emails, apiKey)

    // Update job with results
    for (let i = 0; i < results.length; i++) {
      const result = results[i]
      if (!result) continue
      jobStore.updateEmailResult(jobId, i, {
        status: result.status,
        provider_id: result.id,
        error: result.error,
      })
    }

    // Determine final status
    const job = jobStore.get(jobId)
    if (job) {
      if (job.failed === job.total) {
        jobStore.updateStatus(jobId, 'failed')
      } else if (job.failed > 0) {
        jobStore.updateStatus(jobId, 'partial')
      } else {
        jobStore.updateStatus(jobId, 'completed')
      }
    }
  } catch (error) {
    logger.error('Job processing error', {
      jobId,
      error: error instanceof Error ? error.message : String(error),
    })
    jobStore.updateStatus(jobId, 'failed')
  }
}
