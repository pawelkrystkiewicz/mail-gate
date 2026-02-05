import { describe, expect, test, beforeAll, beforeEach } from 'bun:test'
import { Hono } from 'hono'
import { createUniversalApiRoutes } from '../src/api/v1'
import { registry } from '../src/core/registry'
import type { EmailProvider } from '../src/core/provider'
import type { Email, SendResult } from '../src/core/types'

// Mock provider for testing
class MockProvider implements EmailProvider {
  readonly name = 'mock'
  readonly batchSize = 100
  readonly rateLimit = 10
  public sentEmails: Email[] = []
  public lastApiKey: string | null = null
  public shouldFail = false

  async sendBatch(emails: Email[], apiKey: string): Promise<SendResult[]> {
    this.sentEmails.push(...emails)
    this.lastApiKey = apiKey

    if (this.shouldFail) {
      return emails.map((_, i) => ({
        id: `mock-id-${i}`,
        status: 'failed' as const,
        error: 'Mock failure',
      }))
    }

    return emails.map((_, i) => ({
      id: `mock-id-${i}`,
      status: 'queued' as const,
    }))
  }

  reset() {
    this.sentEmails = []
    this.lastApiKey = null
    this.shouldFail = false
  }
}

describe('Universal API v1', () => {
  const mockProvider = new MockProvider()
  let app: Hono

  beforeAll(() => {
    registry.register(mockProvider)

    app = new Hono()
    const api = createUniversalApiRoutes()
    app.route('/api/v1', api)
  })

  beforeEach(() => {
    mockProvider.reset()
  })

  describe('GET /api/v1 - API Info', () => {
    test('returns API info without auth', async () => {
      const res = await app.request('/api/v1')

      expect(res.status).toBe(200)

      const json = (await res.json()) as {
        name: string
        version: string
        providers: string[]
        features: Record<string, unknown>
      }
      expect(json.name).toBe('mail-gate Universal API')
      expect(json.version).toBe('1.0.0')
      expect(json.providers).toContain('mock')
      expect(json.features.singleEmail).toBe(true)
      expect(json.features.batchEmail).toBe(true)
    })
  })

  describe('POST /api/v1/emails - Single Email', () => {
    test('returns 401 without auth', async () => {
      const res = await app.request('/api/v1/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'sender@test.com',
          to: 'recipient@test.com',
          subject: 'Test',
          text: 'Hello',
        }),
      })

      expect(res.status).toBe(401)
    })

    test('returns 401 without X-Provider header', async () => {
      const res = await app.request('/api/v1/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-key',
        },
        body: JSON.stringify({
          from: 'sender@test.com',
          to: 'recipient@test.com',
          subject: 'Test',
          text: 'Hello',
        }),
      })

      expect(res.status).toBe(401)
      const json = (await res.json()) as { code: string }
      expect(json.code).toBe('missing_provider')
    })

    test('sends email with Bearer token auth', async () => {
      const res = await app.request('/api/v1/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-api-key',
          'X-Provider': 'mock',
        },
        body: JSON.stringify({
          from: 'sender@test.com',
          to: 'recipient@test.com',
          subject: 'Test Subject',
          text: 'Hello World',
        }),
      })

      expect(res.status).toBe(200)

      const json = (await res.json()) as { id: string; status: string }
      expect(json.id).toBeDefined()
      expect(json.status).toBe('queued')

      expect(mockProvider.sentEmails).toHaveLength(1)
      expect(mockProvider.lastApiKey).toBe('test-api-key')
    })

    test('sends email with X-API-Key header auth', async () => {
      const res = await app.request('/api/v1/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': 'test-api-key',
          'X-Provider': 'mock',
        },
        body: JSON.stringify({
          from: 'sender@test.com',
          to: 'recipient@test.com',
          subject: 'Test Subject',
          html: '<p>Hello World</p>',
        }),
      })

      expect(res.status).toBe(200)
      expect(mockProvider.sentEmails).toHaveLength(1)
    })

    test('handles structured email addresses', async () => {
      const res = await app.request('/api/v1/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-api-key',
          'X-Provider': 'mock',
        },
        body: JSON.stringify({
          from: { email: 'sender@test.com', name: 'Sender Name' },
          to: [
            { email: 'recipient1@test.com', name: 'Recipient 1' },
            { email: 'recipient2@test.com' },
            'recipient3@test.com',
          ],
          subject: 'Test',
          text: 'Hello',
        }),
      })

      expect(res.status).toBe(200)
      expect(mockProvider.sentEmails).toHaveLength(1)
      expect(mockProvider.sentEmails[0]!.from).toBe(
        'Sender Name <sender@test.com>',
      )
      expect(mockProvider.sentEmails[0]!.to).toEqual([
        'Recipient 1 <recipient1@test.com>',
        'recipient2@test.com',
        'recipient3@test.com',
      ])
    })

    test('returns 400 for missing required fields', async () => {
      const res = await app.request('/api/v1/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-api-key',
          'X-Provider': 'mock',
        },
        body: JSON.stringify({
          from: 'sender@test.com',
          // Missing 'to', 'subject', and content
        }),
      })

      expect(res.status).toBe(400)
      const json = (await res.json()) as { type: string; code: string }
      expect(json.type).toBe('validation_error')
    })

    test('returns 500 on provider failure', async () => {
      mockProvider.shouldFail = true

      const res = await app.request('/api/v1/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-api-key',
          'X-Provider': 'mock',
        },
        body: JSON.stringify({
          from: 'sender@test.com',
          to: 'recipient@test.com',
          subject: 'Test',
          text: 'Hello',
        }),
      })

      expect(res.status).toBe(500)
      const json = (await res.json()) as { type: string }
      expect(json.type).toBe('provider_error')
    })
  })

  describe('POST /api/v1/emails/batch - Batch Email', () => {
    test('returns 202 with job ID for valid batch', async () => {
      const res = await app.request('/api/v1/emails/batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-api-key',
          'X-Provider': 'mock',
        },
        body: JSON.stringify({
          emails: [
            {
              from: 'sender@test.com',
              to: 'r1@test.com',
              subject: 'Test 1',
              text: 'Hello 1',
            },
            {
              from: 'sender@test.com',
              to: 'r2@test.com',
              subject: 'Test 2',
              text: 'Hello 2',
            },
          ],
        }),
      })

      expect(res.status).toBe(202)

      const json = (await res.json()) as {
        jobId: string
        status: string
        statusUrl: string
      }
      expect(json.jobId).toBeDefined()
      expect(json.status).toBe('processing')
      expect(json.statusUrl).toContain('/api/v1/jobs/')
    })

    test('returns 400 for empty batch', async () => {
      const res = await app.request('/api/v1/emails/batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-api-key',
          'X-Provider': 'mock',
        },
        body: JSON.stringify({
          emails: [],
        }),
      })

      expect(res.status).toBe(400)
      const json = (await res.json()) as { code: string }
      expect(json.code).toBe('invalid_request')
    })

    test('returns 400 for batch exceeding max size', async () => {
      const emails = Array.from({ length: 1001 }, (_, i) => ({
        from: 'sender@test.com',
        to: `r${i}@test.com`,
        subject: 'Test',
        text: 'Hello',
      }))

      const res = await app.request('/api/v1/emails/batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-api-key',
          'X-Provider': 'mock',
        },
        body: JSON.stringify({ emails }),
      })

      expect(res.status).toBe(400)
      const json = (await res.json()) as { code: string }
      expect(json.code).toBe('batch_too_large')
    })
  })

  describe('GET /api/v1/jobs/:id - Job Status', () => {
    test('returns 404 for non-existent job', async () => {
      const res = await app.request('/api/v1/jobs/non-existent-id', {
        headers: {
          Authorization: 'Bearer test-api-key',
          'X-Provider': 'mock',
        },
      })

      expect(res.status).toBe(404)
      const json = (await res.json()) as { code: string }
      expect(json.code).toBe('job_not_found')
    })

    test('returns job status for valid job', async () => {
      // First create a batch job
      const batchRes = await app.request('/api/v1/emails/batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-api-key',
          'X-Provider': 'mock',
        },
        body: JSON.stringify({
          emails: [
            {
              from: 'sender@test.com',
              to: 'r@test.com',
              subject: 'Test',
              text: 'Hello',
            },
          ],
        }),
      })

      const batchJson = (await batchRes.json()) as { jobId: string }

      // Wait a bit for async processing
      await new Promise(resolve => setTimeout(resolve, 50))

      // Then check job status
      const res = await app.request(`/api/v1/jobs/${batchJson.jobId}`, {
        headers: {
          Authorization: 'Bearer test-api-key',
          'X-Provider': 'mock',
        },
      })

      expect(res.status).toBe(200)

      const json = (await res.json()) as {
        jobId: string
        status: string
        total: number
      }
      expect(json.jobId).toBe(batchJson.jobId)
      expect(json.total).toBe(1)
    })
  })
})
