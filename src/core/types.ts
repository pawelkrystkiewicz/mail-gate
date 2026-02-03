export interface Email {
  from: string;
  to: string[];
  subject: string;
  html?: string;
  text?: string;
  tags?: string[];
  variables?: Record<string, Record<string, unknown>>;
}

export interface SendResult {
  id: string;
  status: "queued" | "sent" | "failed";
  error?: string;
}

export interface EmailEvent {
  id: string;
  type: "delivered" | "opened" | "clicked" | "bounced" | "complained";
  recipient: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export interface EventQuery {
  begin?: Date;
  end?: Date;
  limit?: number;
  eventType?: EmailEvent["type"];
}

export interface Suppression {
  address: string;
  reason: string;
  createdAt: Date;
}

export interface MailgunRequest {
  from: string;
  to: string[];
  subject: string;
  html?: string;
  text?: string;
  tags?: string[];
  trackingClicks?: boolean;
  trackingOpens?: boolean;
  recipientVariables?: Record<string, Record<string, unknown>>;
}

export interface MailgunResponse {
  id: string;
  message: string;
}
