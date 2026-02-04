import type { CreateEmailOptions } from "resend";
import type { Email } from "../../core/types";

export function toResendFormat(email: Email): CreateEmailOptions {
  return {
    from: email.from,
    to: email.to,
    subject: email.subject,
    html: email.html,
    text: email.text,
    tags: email.tags?.map((tag) => ({ name: "tag", value: tag })),
  } as CreateEmailOptions;
}

export function toResendBatch(emails: Email[]): CreateEmailOptions[] {
  return emails.map(toResendFormat);
}
