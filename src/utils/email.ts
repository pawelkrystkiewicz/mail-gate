export interface ParsedEmailAddress {
  email: string;
  name?: string;
}

const EMAIL_WITH_NAME_REGEX = /^(.+?)\s*<([^>]+)>$/;

/**
 * Parses email address formats:
 * - "Name <email@domain.com>" -> { name: "Name", email: "email@domain.com" }
 * - "email@domain.com" -> { email: "email@domain.com" }
 */
export function parseEmailAddress(from: string): ParsedEmailAddress {
  const trimmed = from.trim();
  const match = trimmed.match(EMAIL_WITH_NAME_REGEX);

  if (match?.[1] && match[2]) {
    return {
      name: match[1].trim(),
      email: match[2].trim(),
    };
  }

  return { email: trimmed };
}
