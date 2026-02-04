import type { Context } from 'hono'
import { registry } from '../core/registry'
import { parseMailgunFormData, mailgunToInternal } from '../core/transformer'
import type { MailgunResponse } from '../core/types'
import { logger } from '../utils/logger'

export async function handleSendMessage(c: Context) {
  const domain = c.req.param('domain')
  logger.info('Received message request', { domain })

  try {
    const contentType = c.req.header('Content-Type') ?? ''

    let formData: FormData

    if (contentType.includes('multipart/form-data')) {
      formData = await c.req.formData()
    } else if (contentType.includes('application/x-www-form-urlencoded')) {
      // Handle URL-encoded form data
      const body = await c.req.parseBody()
      formData = new FormData()
      for (const [key, value] of Object.entries(body)) {
        if (Array.isArray(value)) {
          for (const v of value) {
            formData.append(key, String(v))
          }
        } else if (value instanceof File) {
          formData.append(key, value)
        } else {
          formData.append(key, value)
        }
      }
    } else {
      logger.warn('Unsupported Content-Type', { contentType })
      return c.json({ message: 'Unsupported Content-Type' }, 400)
    }

    const mailgunRequest = parseMailgunFormData(formData)

    if (
      !mailgunRequest.from ||
      !mailgunRequest.to.length ||
      !mailgunRequest.subject
    ) {
      logger.warn('Missing required fields', {
        hasFrom: !!mailgunRequest.from,
        hasTo: mailgunRequest.to.length > 0,
        hasSubject: !!mailgunRequest.subject,
      })
      return c.json(
        { message: 'Missing required fields: from, to, subject' },
        400,
      )
    }

    logger.info('Parsed Mailgun request', {
      from: mailgunRequest.from,
      toCount: mailgunRequest.to.length,
      subject: mailgunRequest.subject,
    })

    // Transform to internal format
    const emails = mailgunToInternal(mailgunRequest)

    // Get configured provider
    const providerName = process.env.MAIL_PROVIDER ?? 'resend'
    if (!registry.has(providerName)) {
      logger.error('Provider not configured', { provider: providerName })
      return c.json(
        { message: `Provider "${providerName}" not configured` },
        500,
      )
    }

    const provider = registry.get(providerName)

    // Send batch
    const results = await provider.sendBatch(emails)

    // Check for failures
    const failed = results.filter(r => r.status === 'failed')
    if (failed.length === results.length) {
      logger.error('All emails failed to send', {
        errors: failed.map(f => f.error),
      })
      return c.json({ message: 'Failed to send emails' }, 500)
    }

    if (failed.length > 0) {
      logger.warn('Some emails failed', {
        failed: failed.length,
        total: results.length,
      })
    }

    // Generate Mailgun-compatible response
    const messageId = results[0]?.id ?? crypto.randomUUID()
    const response: MailgunResponse = {
      id: `<${messageId}@${domain}>`,
      message: 'Queued. Thank you.',
    }

    logger.info('Message queued', {
      id: response.id,
      emailCount: results.length,
    })

    return c.json(response)
  } catch (error) {
    logger.error('Error handling message', {
      error: error instanceof Error ? error.message : String(error),
    })
    return c.json({ message: 'Internal server error' }, 500)
  }
}
