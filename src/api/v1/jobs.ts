import type { JobStatus, JobStatusResponse } from './types'

export interface Job {
  id: string
  status: JobStatus
  total: number
  sent: number
  failed: number
  errors: { index: number; error: string }[]
  createdAt: Date
  completedAt?: Date
}

// In-memory job store (for production, consider Redis or similar)
const jobs = new Map<string, Job>()

// Clean up old jobs after 1 hour
const JOB_TTL_MS = 60 * 60 * 1000

export function createJob(total: number): Job {
  const job: Job = {
    id: crypto.randomUUID(),
    status: 'pending',
    total,
    sent: 0,
    failed: 0,
    errors: [],
    createdAt: new Date(),
  }
  jobs.set(job.id, job)
  return job
}

export function getJob(id: string): Job | undefined {
  return jobs.get(id)
}

export function updateJob(
  id: string,
  update: Partial<Pick<Job, 'status' | 'sent' | 'failed' | 'completedAt'>> & {
    error?: { index: number; error: string }
  },
): Job | undefined {
  const job = jobs.get(id)
  if (!job) return undefined

  if (update.status !== undefined) job.status = update.status
  if (update.sent !== undefined) job.sent = update.sent
  if (update.failed !== undefined) job.failed = update.failed
  if (update.completedAt !== undefined) job.completedAt = update.completedAt
  if (update.error) job.errors.push(update.error)

  return job
}

export function jobToResponse(job: Job, _baseUrl: string): JobStatusResponse {
  return {
    jobId: job.id,
    status: job.status,
    total: job.total,
    sent: job.sent,
    failed: job.failed,
    errors: job.errors.length > 0 ? job.errors : undefined,
    createdAt: job.createdAt.toISOString(),
    completedAt: job.completedAt?.toISOString(),
  }
}

// Periodically clean up old jobs
export function cleanupOldJobs(): void {
  const now = Date.now()
  for (const [id, job] of jobs) {
    if (now - job.createdAt.getTime() > JOB_TTL_MS) {
      jobs.delete(id)
    }
  }
}

// Run cleanup every 10 minutes
setInterval(cleanupOldJobs, 10 * 60 * 1000)
