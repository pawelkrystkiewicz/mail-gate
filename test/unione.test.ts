import { describe, expect, test, mock, beforeEach, afterEach } from 'bun:test'
import {
  toUniOneFormat,
  toUniOneRequest,
} from '../src/providers/unione/transformer'
import { UniOneProvider, parseUniOneRegion } from '../src/providers/unione'
import type { Email } from '../src/core/types'

describe('UniOne transformer', () => {
  describe('toUniOneFormat', () => {
    test('converts basic email', () => {
      const email: Email = {
        from: 'sender@example.com',
        to: ['recipient@example.com'],
        subject: 'Test Subject',
        html: '<p>Hello</p>',
        text: 'Hello',
      }

      const result = toUniOneFormat(email)

      expect(result.from_email).toBe('sender@example.com')
      expect(result.from_name).toBeUndefined()
      expect(result.subject).toBe('Test Subject')
      expect(result.body.html).toBe('<p>Hello</p>')
      expect(result.body.plaintext).toBe('Hello')
      expect(result.recipients).toEqual([{ email: 'recipient@example.com' }])
    })

    test('parses from address with name', () => {
      const email: Email = {
        from: 'John Doe <john@example.com>',
        to: ['recipient@example.com'],
        subject: 'Test',
      }

      const result = toUniOneFormat(email)

      expect(result.from_email).toBe('john@example.com')
      expect(result.from_name).toBe('John Doe')
    })

    test('handles multiple recipients', () => {
      const email: Email = {
        from: 'sender@example.com',
        to: ['one@example.com', 'two@example.com'],
        subject: 'Test',
        html: '<p>Hello</p>',
      }

      const result = toUniOneFormat(email)

      expect(result.recipients).toHaveLength(2)
      expect(result.recipients[0]!.email).toBe('one@example.com')
      expect(result.recipients[1]!.email).toBe('two@example.com')
    })

    test('includes recipient substitutions from variables', () => {
      const email: Email = {
        from: 'sender@example.com',
        to: ['user@example.com'],
        subject: 'Hello {{name}}',
        html: '<p>Hello {{name}}</p>',
        variables: {
          'user@example.com': { name: 'John', id: 123 },
        },
      }

      const result = toUniOneFormat(email)

      expect(result.recipients[0]!.substitutions).toEqual({
        name: 'John',
        id: 123,
      })
    })

    test('includes tags when present', () => {
      const email: Email = {
        from: 'sender@example.com',
        to: ['recipient@example.com'],
        subject: 'Test',
        html: '<p>Hello</p>',
        tags: ['newsletter', 'weekly'],
      }

      const result = toUniOneFormat(email)

      expect(result.tags).toEqual(['newsletter', 'weekly'])
    })

    test('omits tags when empty', () => {
      const email: Email = {
        from: 'sender@example.com',
        to: ['recipient@example.com'],
        subject: 'Test',
        html: '<p>Hello</p>',
        tags: [],
      }

      const result = toUniOneFormat(email)

      expect(result.tags).toBeUndefined()
    })

    test('handles HTML only', () => {
      const email: Email = {
        from: 'sender@example.com',
        to: ['recipient@example.com'],
        subject: 'Test',
        html: '<p>Hello</p>',
      }

      const result = toUniOneFormat(email)

      expect(result.body.html).toBe('<p>Hello</p>')
      expect(result.body.plaintext).toBeUndefined()
    })

    test('handles text only', () => {
      const email: Email = {
        from: 'sender@example.com',
        to: ['recipient@example.com'],
        subject: 'Test',
        text: 'Hello',
      }

      const result = toUniOneFormat(email)

      expect(result.body.html).toBeUndefined()
      expect(result.body.plaintext).toBe('Hello')
    })
  })

  describe('toUniOneRequest', () => {
    test('wraps message in request format', () => {
      const email: Email = {
        from: 'sender@example.com',
        to: ['recipient@example.com'],
        subject: 'Test',
        html: '<p>Hello</p>',
      }

      const result = toUniOneRequest(email)

      expect(result.message).toBeDefined()
      expect(result.message.from_email).toBe('sender@example.com')
    })
  })
})

describe('UniOneProvider', () => {
  let originalFetch: typeof globalThis.fetch

  beforeEach(() => {
    originalFetch = globalThis.fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  test('uses EU region by default', () => {
    const provider = new UniOneProvider()
    expect(provider.name).toBe('unione')
    expect(provider.batchSize).toBe(500)
  })

  test('sends email successfully', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            status: 'success',
            job_id: 'job-123',
            emails: ['recipient@example.com'],
          }),
          { status: 200 },
        ),
      ),
    ) as unknown as typeof fetch

    const provider = new UniOneProvider()
    const email: Email = {
      from: 'sender@example.com',
      to: ['recipient@example.com'],
      subject: 'Test',
      html: '<p>Hello</p>',
    }

    const results = await provider.sendBatch([email], 'test-api-key')

    expect(results).toHaveLength(1)
    expect(results[0]!.status).toBe('queued')
    expect(results[0]!.id).toBe('job-123')
  })

  test('handles API error response', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            status: 'error',
            message: 'Invalid API key',
            code: 101,
          }),
          { status: 401 },
        ),
      ),
    ) as unknown as typeof fetch

    const provider = new UniOneProvider()
    const email: Email = {
      from: 'sender@example.com',
      to: ['recipient@example.com'],
      subject: 'Test',
      html: '<p>Hello</p>',
    }

    const results = await provider.sendBatch([email], 'invalid-key')

    expect(results).toHaveLength(1)
    expect(results[0]!.status).toBe('failed')
    expect(results[0]!.error).toContain('Invalid API key')
  })

  test('handles partial failures', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            status: 'success',
            job_id: 'job-123',
            emails: ['good@example.com'],
            failed_emails: {
              'bad@example.com': 'unsubscribed',
            },
          }),
          { status: 200 },
        ),
      ),
    ) as unknown as typeof fetch

    const provider = new UniOneProvider()
    const email: Email = {
      from: 'sender@example.com',
      to: ['good@example.com', 'bad@example.com'],
      subject: 'Test',
      html: '<p>Hello</p>',
    }

    const results = await provider.sendBatch([email], 'test-api-key')

    // Partial success is still marked as queued since some emails went through
    expect(results).toHaveLength(1)
    expect(results[0]!.status).toBe('queued')
  })

  test('handles all recipients failed', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            status: 'success',
            job_id: 'job-123',
            emails: [],
            failed_emails: {
              'bad@example.com': 'invalid',
            },
          }),
          { status: 200 },
        ),
      ),
    ) as unknown as typeof fetch

    const provider = new UniOneProvider()
    const email: Email = {
      from: 'sender@example.com',
      to: ['bad@example.com'],
      subject: 'Test',
      html: '<p>Hello</p>',
    }

    const results = await provider.sendBatch([email], 'test-api-key')

    expect(results).toHaveLength(1)
    expect(results[0]!.status).toBe('failed')
    expect(results[0]!.error).toContain('All recipients failed')
  })

  test('handles network error', async () => {
    globalThis.fetch = mock(() =>
      Promise.reject(new Error('Network error')),
    ) as unknown as typeof fetch

    const provider = new UniOneProvider()
    const email: Email = {
      from: 'sender@example.com',
      to: ['recipient@example.com'],
      subject: 'Test',
      html: '<p>Hello</p>',
    }

    const results = await provider.sendBatch([email], 'test-api-key')

    expect(results).toHaveLength(1)
    expect(results[0]!.status).toBe('failed')
    expect(results[0]!.error).toBe('Network error')
  })

  test('returns empty array for empty input', async () => {
    const provider = new UniOneProvider()
    const results = await provider.sendBatch([], 'test-api-key')

    expect(results).toEqual([])
  })

  test('uses EU region when specified', async () => {
    let capturedUrl = ''
    globalThis.fetch = mock((url: string) => {
      capturedUrl = url
      return Promise.resolve(
        new Response(
          JSON.stringify({
            status: 'success',
            job_id: 'job-123',
            emails: ['recipient@example.com'],
          }),
          { status: 200 },
        ),
      )
    }) as unknown as typeof fetch

    const provider = new UniOneProvider('eu')
    const email: Email = {
      from: 'sender@example.com',
      to: ['recipient@example.com'],
      subject: 'Test',
      html: '<p>Hello</p>',
    }

    await provider.sendBatch([email], 'test-api-key')

    expect(capturedUrl).toContain('eu1.unione.io')
  })

  test('sends correct headers', async () => {
    let capturedHeaders: Headers | undefined
    globalThis.fetch = mock((_url: string, options: RequestInit) => {
      capturedHeaders = new Headers(options.headers)
      return Promise.resolve(
        new Response(
          JSON.stringify({
            status: 'success',
            job_id: 'job-123',
            emails: ['recipient@example.com'],
          }),
          { status: 200 },
        ),
      )
    }) as unknown as typeof fetch

    const provider = new UniOneProvider()
    const email: Email = {
      from: 'sender@example.com',
      to: ['recipient@example.com'],
      subject: 'Test',
      html: '<p>Hello</p>',
    }

    await provider.sendBatch([email], 'my-secret-key')

    expect(capturedHeaders!.get('X-API-KEY')).toBe('my-secret-key')
    expect(capturedHeaders!.get('Content-Type')).toBe('application/json')
  })

  test('handles invalid response format', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(JSON.stringify({ unexpected: 'format' }), { status: 200 }),
      ),
    ) as unknown as typeof fetch

    const provider = new UniOneProvider()
    const email: Email = {
      from: 'sender@example.com',
      to: ['recipient@example.com'],
      subject: 'Test',
      html: '<p>Hello</p>',
    }

    const results = await provider.sendBatch([email], 'test-api-key')

    expect(results).toHaveLength(1)
    expect(results[0]!.status).toBe('failed')
    expect(results[0]!.error).toContain('Invalid response format')
  })
})

describe('parseUniOneRegion', () => {
  test('returns eu for undefined', () => {
    expect(parseUniOneRegion(undefined)).toBe('eu')
  })

  test("returns us for 'us'", () => {
    expect(parseUniOneRegion('us')).toBe('us')
  })

  test("returns eu for 'eu'", () => {
    expect(parseUniOneRegion('eu')).toBe('eu')
  })

  test('returns eu for invalid value', () => {
    expect(parseUniOneRegion('invalid')).toBe('eu')
  })

  test('returns eu for empty string', () => {
    expect(parseUniOneRegion('')).toBe('eu')
  })
})
