import type { Context } from 'hono'
import type { JobStatusResponse, APIError } from '../../../core/types'
import { jobStore } from '../../../services/job-store'

export function handleGetJob(c: Context) {
  const jobId = c.req.param('id')

  const job = jobStore.get(jobId)

  if (!job) {
    const error: APIError = {
      error: {
        type: 'not_found_error',
        code: 'job_not_found',
        message: `Job "${jobId}" not found`,
      },
    }
    return c.json(error, 404)
  }

  // Extract errors from failed emails
  const errors = job.results
    .filter(r => r.status === 'failed' && r.error)
    .slice(0, 10)
    .map(r => ({
      index: r.index,
      recipient: r.recipient,
      code: 'send_failed',
      message: r.error ?? 'Unknown error',
    }))

  const response: JobStatusResponse = {
    job_id: job.id,
    status: job.status,
    progress: {
      total: job.total,
      sent: job.sent,
      failed: job.failed,
      pending: job.pending,
    },
    created_at: job.created_at.toISOString(),
    started_at: job.started_at?.toISOString(),
    completed_at: job.completed_at?.toISOString(),
    errors: errors.length > 0 ? errors : undefined,
  }

  return c.json(response, 200)
}
