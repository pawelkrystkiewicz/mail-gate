import type { Email } from "../../core/types";
import { parseEmailAddress } from "../../utils/email";

export interface UniOneRecipient {
  email: string;
  substitutions?: Record<string, unknown>;
}

export interface UniOneMessage {
  recipients: UniOneRecipient[];
  body: {
    html?: string;
    plaintext?: string;
  };
  subject: string;
  from_email: string;
  from_name?: string;
  tags?: string[];
}

export interface UniOneRequest {
  message: UniOneMessage;
}

export interface UniOneResponse {
  status: "success" | "error";
  job_id?: string;
  emails?: string[];
  failed_emails?: Record<string, string>;
  message?: string;
  code?: number;
}

function buildRecipients(email: Email): UniOneRecipient[] {
  return email.to.map((recipient) => ({
    email: recipient,
    ...(email.variables?.[recipient] && { substitutions: email.variables[recipient] }),
  }));
}

function buildBody(email: Email): UniOneMessage["body"] {
  return {
    ...(email.html && { html: email.html }),
    ...(email.text && { plaintext: email.text }),
  };
}

export function toUniOneFormat(email: Email): UniOneMessage {
  const { email: from_email, name: from_name } = parseEmailAddress(email.from);
  const tags = email.tags?.length ? email.tags : undefined;

  return {
    recipients: buildRecipients(email),
    body: buildBody(email),
    subject: email.subject,
    from_email,
    ...(from_name && { from_name }),
    ...(tags && { tags }),
  };
}

export function toUniOneRequest(email: Email): UniOneRequest {
  return { message: toUniOneFormat(email) };
}
