import type { Email } from "../../core/types";

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

interface ParsedFrom {
  email: string;
  name?: string;
}

function parseFromAddress(from: string): ParsedFrom {
  // Handle format: "Name <email@domain.com>" or just "email@domain.com"
  const match = from.match(/^(.+?)\s*<([^>]+)>$/);
  if (match && match[1] && match[2]) {
    return {
      name: match[1].trim(),
      email: match[2].trim(),
    };
  }
  return { email: from.trim() };
}

export function toUniOneFormat(email: Email): UniOneMessage {
  const parsed = parseFromAddress(email.from);

  const recipients: UniOneRecipient[] = email.to.map((recipient) => {
    const r: UniOneRecipient = { email: recipient };
    const vars = email.variables?.[recipient];
    if (vars) {
      r.substitutions = vars;
    }
    return r;
  });

  const message: UniOneMessage = {
    recipients,
    body: {},
    subject: email.subject,
    from_email: parsed.email,
  };

  if (parsed.name) {
    message.from_name = parsed.name;
  }

  if (email.html) {
    message.body.html = email.html;
  }

  if (email.text) {
    message.body.plaintext = email.text;
  }

  if (email.tags && email.tags.length > 0) {
    message.tags = email.tags;
  }

  return message;
}

export function toUniOneRequest(email: Email): UniOneRequest {
  return {
    message: toUniOneFormat(email),
  };
}
