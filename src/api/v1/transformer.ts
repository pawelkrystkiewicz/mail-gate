import type { Email } from '../../core/types'
import type { UniversalEmailRequest, EmailAddressInput } from '../../core/types'

function normalizeAddress(addr: EmailAddressInput): string {
  if (typeof addr === 'string') return addr
  return addr.name ? `${addr.name} <${addr.email}>` : addr.email
}

function extractEmail(addr: EmailAddressInput): string {
  if (typeof addr === 'string') {
    // Extract email from "Name <email>" format if present
    const match = /<([^>]+)>/.exec(addr)
    return match ? match[1] : addr
  }
  return addr.email
}

export function toInternalEmail(request: UniversalEmailRequest): Email {
  return {
    from: normalizeAddress(request.from),
    to: request.to.map(addr => extractEmail(addr)),
    subject: request.subject,
    html: request.content.html,
    text: request.content.text,
    tags: request.tags,
  }
}

export function toInternalEmails(requests: UniversalEmailRequest[]): Email[] {
  return requests.map(toInternalEmail)
}
