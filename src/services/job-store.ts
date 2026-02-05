import type { Job, JobStatus } from '../core/types'

export class JobStoreFullError extends Error {
  constructor() {
    super('Job store at capacity, try again later')
    this.name = 'JobStoreFullError'
  }
}

class JobStore {
  private jobs = new Map<string, Job>()
  private readonly maxJobs = 1000
  private readonly jobTTL = 24 * 60 * 60 * 1000 // 24 hours

  create(id: string, recipients: string[]): Job {
    // Check capacity before creating
    if (this.jobs.size >= this.maxJobs) {
      this.cleanup()
      // Still full after cleanup? Reject the request
      if (this.jobs.size >= this.maxJobs) {
        throw new JobStoreFullError()
      }
    }

    const job: Job = {
      id,
      status: 'pending',
      total: recipients.length,
      sent: 0,
      failed: 0,
      pending: recipients.length,
      results: recipients.map((recipient, index) => ({
        index,
        recipient,
        status: 'pending',
      })),
      created_at: new Date(),
    }

    this.jobs.set(id, job)
    return job
  }

  get(id: string): Job | undefined {
    return this.jobs.get(id)
  }

  updateStatus(id: string, status: JobStatus): void {
    const job = this.jobs.get(id)
    if (!job) return

    job.status = status

    if (status === 'processing' && !job.started_at) {
      job.started_at = new Date()
    }

    if (status === 'completed' || status === 'failed' || status === 'partial') {
      job.completed_at = new Date()
    }
  }

  updateEmailResult(
    id: string,
    index: number,
    result: {
      status: 'queued' | 'sent' | 'failed'
      provider_id?: string
      error?: string
    },
  ): void {
    const job = this.jobs.get(id)
    if (!job || index >= job.results.length) return

    const emailResult = job.results[index]
    if (!emailResult) return
    const wasPending = emailResult.status === 'pending'

    emailResult.status = result.status
    emailResult.provider_id = result.provider_id
    emailResult.error = result.error

    if (wasPending) {
      job.pending--
      if (result.status === 'failed') {
        job.failed++
      } else {
        job.sent++
      }
    }
  }

  private cleanup(): void {
    const now = Date.now()
    const expiredIds: string[] = []

    for (const [id, job] of this.jobs) {
      if (now - job.created_at.getTime() > this.jobTTL) {
        expiredIds.push(id)
      }
    }

    for (const id of expiredIds) {
      this.jobs.delete(id)
    }

    // If still over limit, remove oldest jobs
    if (this.jobs.size > this.maxJobs) {
      const sortedJobs = Array.from(this.jobs.entries()).sort(
        (a, b) => a[1].created_at.getTime() - b[1].created_at.getTime(),
      )

      const toRemove = sortedJobs.slice(0, this.jobs.size - this.maxJobs)
      for (const [id] of toRemove) {
        this.jobs.delete(id)
      }
    }
  }
}

export const jobStore = new JobStore()
