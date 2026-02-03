import { describe, expect, test, beforeAll, mock } from "bun:test";
import { Hono } from "hono";
import { createApiRoutes } from "../src/api/routes";
import { registry } from "../src/core/registry";
import type { EmailProvider } from "../src/core/provider";
import type { Email, SendResult } from "../src/core/types";

// Mock provider for testing
class MockProvider implements EmailProvider {
  readonly name = "mock";
  readonly batchSize = 100;
  readonly rateLimit = 10;
  public sentEmails: Email[] = [];

  async sendBatch(emails: Email[]): Promise<SendResult[]> {
    this.sentEmails.push(...emails);
    return emails.map((_, i) => ({
      id: `mock-id-${i}`,
      status: "queued" as const,
    }));
  }

  reset() {
    this.sentEmails = [];
  }
}

describe("API endpoints", () => {
  const mockProvider = new MockProvider();
  let app: Hono;

  beforeAll(() => {
    registry.register(mockProvider);
    process.env.MAIL_PROVIDER = "mock";

    app = new Hono();
    const api = createApiRoutes();
    app.route("/v3", api);
  });

  test("returns 401 without auth", async () => {
    const res = await app.request("/v3/test.com/messages", {
      method: "POST",
    });

    expect(res.status).toBe(401);
  });

  test("returns 401 with invalid auth format", async () => {
    const res = await app.request("/v3/test.com/messages", {
      method: "POST",
      headers: {
        Authorization: "Bearer invalid",
      },
    });

    expect(res.status).toBe(401);
  });

  test("sends email with valid request", async () => {
    mockProvider.reset();

    const formData = new FormData();
    formData.append("from", "sender@test.com");
    formData.append("to", "recipient@example.com");
    formData.append("subject", "Test Subject");
    formData.append("html", "<p>Hello</p>");

    const res = await app.request("/v3/test.com/messages", {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa("api:test-key")}`,
      },
      body: formData,
    });

    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.message).toBe("Queued. Thank you.");
    expect(json.id).toContain("@test.com");

    expect(mockProvider.sentEmails).toHaveLength(1);
    expect(mockProvider.sentEmails[0].from).toBe("sender@test.com");
    expect(mockProvider.sentEmails[0].to).toEqual(["recipient@example.com"]);
  });

  test("returns 400 for missing required fields", async () => {
    const formData = new FormData();
    formData.append("from", "sender@test.com");
    // Missing 'to' and 'subject'

    const res = await app.request("/v3/test.com/messages", {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa("api:test-key")}`,
      },
      body: formData,
    });

    expect(res.status).toBe(400);
  });
});
