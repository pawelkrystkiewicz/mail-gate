import { describe, it, expect, beforeAll, mock } from 'bun:test'
import app from '../src/index'
import { registry } from '../src/core/registry'
import type { EmailProvider } from '../src/core/provider'
import type { Email, SendResult, ProviderCapabilities } from '../src/core/types'

// Mock provider for testing
class MockProvider implements EmailProvider {
  readonly name = 'mock'
  readonly batchSize = 100
  readonly rateLimit = 10
  readonly capabilities: ProviderCapabilities = {
    batch: true,
    tracking: true,
    events: false,
    suppressions: false,
  }

  private messageId = 0

  async sendBatch(emails: Email[]): Promise<SendResult[]> {
    return emails.map(() => ({
      id: `mock-id-${this.messageId++}`,
      status: 'queued' as const,
    }))
  }
}

describe('Universal API v1', () => {
  beforeAll(() => {
    // Register mock provider
    const mockProvider = new MockProvider()
    registry.register(mockProvider)
    process.env.MAIL_PROVIDER = 'mock'
  })

  describe('GET /api/v1 (discovery)', () => {
    it('returns API info without auth', async () => {
      const res = await app.fetch(new Request('http://localhost/api/v1'))
      expect(res.status).toBe(200)

      const body = await res.json()
      expect(body.name).toBe('mail-gate')
      expect(body.api_version).toBe('v1')
      expect(body.provider).toBeDefined()
      expect(body.capabilities).toBeDefined()
    })

    it('includes provider capabilities', async () => {
      const res = await app.fetch(new Request('http://localhost/api/v1'))
      const body = await res.json()

      expect(body.provider.name).toBe('mock')
      expect(body.capabilities.batch).toBe(true)
      expect(body.capabilities.tracking).toBe(true)
    })
  })

  describe('POST /api/v1/emails', () => {
    it('returns 401 without auth', async () => {
      const res = await app.fetch(
        new Request('http://localhost/api/v1/emails', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        }),
      )
      expect(res.status).toBe(401)
    })

    it('returns 401 with empty Bearer token', async () => {
      const res = await app.fetch(
        new Request('http://localhost/api/v1/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ',
          },
          body: JSON.stringify({}),
        }),
      )
      expect(res.status).toBe(401)
    })

    it('accepts X-API-Key header', async () => {
      const res = await app.fetch(
        new Request('http://localhost/api/v1/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': 'test-key',
          },
          body: JSON.stringify({
            from: { email: 'sender@test.com', name: 'Sender' },
            to: [{ email: 'recipient@test.com' }],
            subject: 'Test',
            content: { text: 'Hello' },
          }),
        }),
      )
      expect(res.status).toBe(200)
    })

    it('validates required fields', async () => {
      const res = await app.fetch(
        new Request('http://localhost/api/v1/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer test-key',
          },
          body: JSON.stringify({}),
        }),
      )
      expect(res.status).toBe(400)

      const body = await res.json()
      expect(body.error.type).toBe('validation_error')
      expect(body.error.details.fields).toBeDefined()
    })

    it('sends email with valid request', async () => {
      const res = await app.fetch(
        new Request('http://localhost/api/v1/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer test-key',
          },
          body: JSON.stringify({
            from: { email: 'sender@test.com', name: 'Sender' },
            to: [{ email: 'recipient@test.com', name: 'Recipient' }],
            subject: 'Test Subject',
            content: {
              html: '<h1>Hello</h1>',
              text: 'Hello',
            },
            tags: ['test'],
          }),
        }),
      )
      expect(res.status).toBe(200)

      const body = await res.json()
      expect(body.id).toMatch(/^msg_/)
      expect(body.status).toBe('queued')
      expect(body.provider).toBe('mock')
      expect(body.provider_id).toBeDefined()
      expect(body.created_at).toBeDefined()
    })

    it('accepts string email addresses', async () => {
      const res = await app.fetch(
        new Request('http://localhost/api/v1/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer test-key',
          },
          body: JSON.stringify({
            from: 'sender@test.com',
            to: ['recipient@test.com'],
            subject: 'Test',
            content: { text: 'Hello' },
          }),
        }),
      )
      expect(res.status).toBe(200)
    })

    it('rejects invalid email addresses', async () => {
      const res = await app.fetch(
        new Request('http://localhost/api/v1/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer test-key',
          },
          body: JSON.stringify({
            from: 'not-an-email',
            to: ['also-not-an-email'],
            subject: 'Test',
            content: { text: 'Hello' },
          }),
        }),
      )
      expect(res.status).toBe(400)
    })
  })

  describe('POST /api/v1/emails/batch', () => {
    it('creates batch job and returns 202', async () => {
      const res = await app.fetch(
        new Request('http://localhost/api/v1/emails/batch', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer test-key',
          },
          body: JSON.stringify({
            emails: [
              {
                from: { email: 'sender@test.com' },
                to: [{ email: 'recipient1@test.com' }],
                subject: 'Test 1',
                content: { text: 'Hello 1' },
              },
              {
                from: { email: 'sender@test.com' },
                to: [{ email: 'recipient2@test.com' }],
                subject: 'Test 2',
                content: { text: 'Hello 2' },
              },
            ],
          }),
        }),
      )
      expect(res.status).toBe(202)

      const body = await res.json()
      expect(body.job_id).toMatch(/^job_/)
      // Status may be 'pending' or 'processing' depending on timing
      expect(['pending', 'processing']).toContain(body.status)
      expect(body.total).toBe(2)
      expect(body.status_url).toContain('/api/v1/jobs/')
    })

    it('validates batch emails', async () => {
      const res = await app.fetch(
        new Request('http://localhost/api/v1/emails/batch', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer test-key',
          },
          body: JSON.stringify({
            emails: [
              {
                from: { email: 'sender@test.com' },
                // missing to, subject, content
              },
            ],
          }),
        }),
      )
      expect(res.status).toBe(400)

      const body = await res.json()
      expect(body.error.type).toBe('validation_error')
    })
  })

  describe('GET /api/v1/jobs/:id', () => {
    it('returns 404 for non-existent job', async () => {
      const res = await app.fetch(
        new Request('http://localhost/api/v1/jobs/nonexistent', {
          headers: { Authorization: 'Bearer test-key' },
        }),
      )
      expect(res.status).toBe(404)

      const body = await res.json()
      expect(body.error.type).toBe('not_found_error')
      expect(body.error.code).toBe('job_not_found')
    })

    it('returns job status', async () => {
      // Create a job first
      const createRes = await app.fetch(
        new Request('http://localhost/api/v1/emails/batch', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer test-key',
          },
          body: JSON.stringify({
            emails: [
              {
                from: { email: 'sender@test.com' },
                to: [{ email: 'recipient@test.com' }],
                subject: 'Test',
                content: { text: 'Hello' },
              },
            ],
          }),
        }),
      )
      const createBody = await createRes.json()
      const jobId = createBody.job_id

      // Wait a bit for background processing
      await new Promise(resolve => setTimeout(resolve, 50))

      // Get job status
      const res = await app.fetch(
        new Request(`http://localhost/api/v1/jobs/${jobId}`, {
          headers: { Authorization: 'Bearer test-key' },
        }),
      )
      expect(res.status).toBe(200)

      const body = await res.json()
      expect(body.job_id).toBe(jobId)
      expect(body.progress).toBeDefined()
      expect(body.progress.total).toBe(1)
      expect(body.created_at).toBeDefined()
    })
  })
})
