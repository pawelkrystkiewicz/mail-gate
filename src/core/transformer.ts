import type { Email, MailgunRequest } from "./types";

export function parseMailgunFormData(formData: FormData): MailgunRequest {
  const from = formData.get("from") as string;
  const subject = formData.get("subject") as string;
  const html = formData.get("html") as string | null;
  const text = formData.get("text") as string | null;

  // Handle multiple 'to' values
  const toValues = formData.getAll("to") as string[];
  const to = toValues.flatMap((val) => val.split(",").map((e) => e.trim()));

  // Handle tags (o:tag)
  const tags = formData.getAll("o:tag") as string[];

  // Tracking options
  const trackingClicks = formData.get("o:tracking-clicks") === "yes";
  const trackingOpens = formData.get("o:tracking-opens") === "yes";

  // Recipient variables (JSON string)
  const recipientVarsStr = formData.get("recipient-variables") as string | null;
  let recipientVariables: Record<string, Record<string, unknown>> | undefined;
  if (recipientVarsStr) {
    try {
      recipientVariables = JSON.parse(recipientVarsStr);
    } catch {
      // Ignore invalid JSON
    }
  }

  return {
    from,
    to,
    subject,
    html: html ?? undefined,
    text: text ?? undefined,
    tags: tags.length > 0 ? tags : undefined,
    trackingClicks,
    trackingOpens,
    recipientVariables,
  };
}

export function mailgunToInternal(request: MailgunRequest): Email[] {
  const { from, to, subject, html, text, tags, recipientVariables } = request;

  // If recipient variables exist, create individual emails for personalization
  if (recipientVariables && Object.keys(recipientVariables).length > 0) {
    return to.map((recipient) => ({
      from,
      to: [recipient],
      subject,
      html: html ? replaceVariables(html, recipientVariables[recipient] ?? {}) : undefined,
      text: text ? replaceVariables(text, recipientVariables[recipient] ?? {}) : undefined,
      tags,
      variables: recipientVariables[recipient] ? { [recipient]: recipientVariables[recipient] } : undefined,
    }));
  }

  // Batch mode: single email to multiple recipients (if provider supports it)
  return [
    {
      from,
      to,
      subject,
      html,
      text,
      tags,
    },
  ];
}

function replaceVariables(content: string, variables: Record<string, unknown>): string {
  let result = content;
  for (const [key, value] of Object.entries(variables)) {
    // Mailgun uses %recipient.key% syntax
    const pattern = new RegExp(`%recipient\\.${key}%`, "g");
    result = result.replace(pattern, String(value));
  }
  return result;
}
