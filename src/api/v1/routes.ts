import { Hono } from 'hono'
import type { Context } from 'hono'
import type { ZodError } from 'zod'
import { registry } from '../../core/registry'
import { logger } from '../../utils/logger'
import { bearerAuthMiddleware } from './auth'
import { createJob, getJob, updateJob, jobToResponse } from './jobs'
import type {
  SendEmailRequest,
  SendEmailResponse,
  BatchEmailResponse,
  ApiInfoResponse,
  ApiErrorResponse,
  JobStatusResponse,
} from './types'
import {
  SendEmailRequestSchema,
  BatchEmailRequestSchema,
  normalizeEmailAddress,
  normalizeEmailAddresses,
} from './types'
import type { Email } from '../../core/types'

const MAX_BATCH_SIZE = 1000

function validationError(
  c: Context,
  code: string,
  message: string,
  details?: Record<string, unknown>,
): Response {
  const error: ApiErrorResponse = {
    type: 'validation_error',
    code,
    message,
    details,
  }
  return c.json(error, 400)
}

function zodValidationError(c: Context, zodError: ZodError): Response {
  const issues = zodError.issues.map(e => ({
    path: e.path.join('.'),
    message: e.message,
  }))
  const error: ApiErrorResponse = {
    type: 'validation_error',
    code: 'invalid_request',
    message: issues[0]?.message ?? 'Validation failed',
    details: { issues },
  }
  return c.json(error, 400)
}

function providerError(
  c: Context,
  message: string,
  details?: Record<string, unknown>,
): Response {
  const error: ApiErrorResponse = {
    type: 'provider_error',
    code: 'send_failed',
    message,
    details,
  }
  return c.json(error, 500)
}

function transformToInternal(request: SendEmailRequest): Email {
  return {
    from: normalizeEmailAddress(request.from),
    to: normalizeEmailAddresses(request.to),
    subject: request.subject,
    html: request.html,
    text: request.text,
    tags: request.tags,
  }
}

export function createUniversalApiRoutes(): Hono {
  const api = new Hono()

  // GET /api/v1 - API info & feature discovery (no auth required)
  api.get('/', (c: Context) => {
    const providers = registry.list()
    const response: ApiInfoResponse = {
      name: 'mail-gate Universal API',
      version: '1.0.0',
      providers,
      features: {
        singleEmail: true,
        batchEmail: true,
        jobTracking: true,
        maxBatchSize: MAX_BATCH_SIZE,
      },
    }
    return c.json(response)
  })

  // Apply auth middleware to all routes below
  api.use('/emails/*', bearerAuthMiddleware)
  api.use('/jobs/*', bearerAuthMiddleware)

  // POST /api/v1/emails - Send single email
  api.post('/emails', async (c: Context) => {
    try {
      const body: unknown = await c.req.json()
      const parseResult = SendEmailRequestSchema.safeParse(body)

      if (!parseResult.success) {
        return zodValidationError(c, parseResult.error)
      }

      const request = parseResult.data
      const email = transformToInternal(request)
      const providerName = c.get('provider') as string
      const apiKey = c.get('apiKey') as string
      const provider = registry.get(providerName)

      logger.info('Sending single email via Universal API', {
        provider: providerName,
        to: email.to.length,
      })

      const results = await provider.sendBatch([email], apiKey)
      const result = results[0]

      if (!result || result.status === 'failed') {
        logger.error('Email send failed', { error: result?.error })
        return providerError(c, result?.error ?? 'Failed to send email')
      }

      const response: SendEmailResponse = {
        id: result.id,
        status: result.status === 'queued' ? 'queued' : 'sent',
        message: 'Email sent successfully',
      }

      return c.json(response, 200)
    } catch (err) {
      logger.error('Error sending email', {
        error: err instanceof Error ? err.message : String(err),
      })
      return providerError(c, 'Internal server error')
    }
  })

  // POST /api/v1/emails/batch - Send batch emails (async)
  api.post('/emails/batch', async (c: Context) => {
    try {
      const body: unknown = await c.req.json()
      const parseResult = BatchEmailRequestSchema.safeParse(body)

      if (!parseResult.success) {
        return zodValidationError(c, parseResult.error)
      }

      const { emails } = parseResult.data

      if (emails.length > MAX_BATCH_SIZE) {
        return validationError(
          c,
          'batch_too_large',
          `Batch size exceeds maximum of ${MAX_BATCH_SIZE}`,
          { maxBatchSize: MAX_BATCH_SIZE, requestedSize: emails.length },
        )
      }

      const providerName = c.get('provider') as string
      const apiKey = c.get('apiKey') as string
      const provider = registry.get(providerName)

      // Create job for tracking
      const job = createJob(emails.length)
      const baseUrl = new URL(c.req.url).origin

      logger.info('Starting batch email job', {
        jobId: job.id,
        provider: providerName,
        emailCount: emails.length,
      })

      // Process batch asynchronously
      updateJob(job.id, { status: 'processing' })

      // Fire and forget - process in background
      void (async () => {
        try {
          const internalEmails = emails.map(transformToInternal)
          const results = await provider.sendBatch(internalEmails, apiKey)

          let sent = 0
          let failed = 0

          for (let i = 0; i < results.length; i++) {
            const result = results[i]
            if (result?.status === 'failed') {
              failed++
              updateJob(job.id, {
                error: { index: i, error: result.error ?? 'Unknown error' },
              })
            } else {
              sent++
            }
          }

          updateJob(job.id, {
            status: failed === results.length ? 'failed' : 'completed',
            sent,
            failed,
            completedAt: new Date(),
          })

          logger.info('Batch job completed', {
            jobId: job.id,
            sent,
            failed,
          })
        } catch (err) {
          logger.error('Batch job failed', {
            jobId: job.id,
            error: err instanceof Error ? err.message : String(err),
          })
          updateJob(job.id, {
            status: 'failed',
            completedAt: new Date(),
          })
        }
      })()

      const response: BatchEmailResponse = {
        jobId: job.id,
        status: 'processing',
        message: 'Batch job started',
        statusUrl: `${baseUrl}/api/v1/jobs/${job.id}`,
      }

      return c.json(response, 202)
    } catch (err) {
      logger.error('Error starting batch job', {
        error: err instanceof Error ? err.message : String(err),
      })
      return providerError(c, 'Internal server error')
    }
  })

  // GET /api/v1/jobs/:id - Get job status
  api.get('/jobs/:id', (c: Context) => {
    const jobId = c.req.param('id')
    const job = getJob(jobId)

    if (!job) {
      const error: ApiErrorResponse = {
        type: 'validation_error',
        code: 'job_not_found',
        message: `Job ${jobId} not found`,
      }
      return c.json(error, 404)
    }

    const baseUrl = new URL(c.req.url).origin
    const response: JobStatusResponse = jobToResponse(job, baseUrl)

    return c.json(response)
  })

  return api
}
