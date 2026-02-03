import type { Email } from "../../core/types";

export interface ResendEmail {
  from: string;
  to: string[];
  subject: string;
  html?: string;
  text?: string;
  tags?: Array<{ name: string; value: string }>;
}

export function toResendFormat(email: Email): ResendEmail {
  return {
    from: email.from,
    to: email.to,
    subject: email.subject,
    html: email.html,
    text: email.text,
    tags: email.tags?.map((tag) => ({ name: "tag", value: tag })),
  };
}

export function toResendBatch(emails: Email[]): ResendEmail[] {
  return emails.map(toResendFormat);
}
