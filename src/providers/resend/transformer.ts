import type { CreateEmailOptions } from 'resend'
import type { Email } from '../../core/types'

export function toResendFormat({ from, subject, to, html, tags, text }: Email): CreateEmailOptions {
  const base = {
    from,
    to,
    subject,
    tags: tags?.map(tag => ({ name: tag, value: tag })),
  }

  if (html) return { ...base, html }
  if (text) return { ...base, text }
  return { ...base, text: '' }
}

export function toResendBatch(emails: Email[]): CreateEmailOptions[] {
  return emails.map(toResendFormat)
}
