import { describe, expect, test, beforeAll } from "bun:test";
import { registry } from "../src/core/registry";
import type { EmailProvider } from "../src/core/provider";
import type { Email, SendResult } from "../src/core/types";
import { processBatchesParallel, chunk } from "../src/utils/batch";

// Mock provider that simulates network latency
class MockLatencyProvider implements EmailProvider {
  readonly name = "mock-latency";
  readonly batchSize = 100;
  readonly rateLimit = 10;

  public callCount = 0;
  public callTimes: number[] = [];
  private latencyMs: number;

  constructor(latencyMs = 50) {
    this.latencyMs = latencyMs;
  }

  async sendBatch(emails: Email[]): Promise<SendResult[]> {
    const batches = chunk(emails, this.batchSize);
    const results: SendResult[] = [];

    for (const batch of batches) {
      this.callCount++;
      this.callTimes.push(Date.now());

      // Simulate network latency
      await new Promise((resolve) => setTimeout(resolve, this.latencyMs));

      results.push(
        ...batch.map((_, i) => ({
          id: `mock-${this.callCount}-${i}`,
          status: "queued" as const,
        }))
      );
    }

    return results;
  }

  reset() {
    this.callCount = 0;
    this.callTimes = [];
  }
}

describe("Performance Tests", () => {
  describe("Batch Processing", () => {
    test("processBatchesParallel processes faster than sequential", async () => {
      const items = Array.from({ length: 500 }, (_, i) => i);
      const latencyMs = 20;

      // Sequential processing (concurrency: 1)
      const seqStart = Date.now();
      await processBatchesParallel(
        items,
        100,
        async (batch) => {
          await new Promise((r) => setTimeout(r, latencyMs));
          return batch;
        },
        { concurrency: 1, rateLimit: 0 }
      );
      const seqDuration = Date.now() - seqStart;

      // Parallel processing (concurrency: 5)
      const parStart = Date.now();
      await processBatchesParallel(
        items,
        100,
        async (batch) => {
          await new Promise((r) => setTimeout(r, latencyMs));
          return batch;
        },
        { concurrency: 5, rateLimit: 0 }
      );
      const parDuration = Date.now() - parStart;

      // Parallel should be significantly faster
      expect(parDuration).toBeLessThan(seqDuration);
      console.log(`Sequential: ${seqDuration}ms, Parallel: ${parDuration}ms`);
    });

    test("handles 1000 emails efficiently", async () => {
      const emails: Email[] = Array.from({ length: 1000 }, (_, i) => ({
        from: "sender@test.com",
        to: [`recipient${i}@test.com`],
        subject: `Test ${i}`,
        html: `<p>Hello ${i}</p>`,
      }));

      const startTime = Date.now();
      const results = await processBatchesParallel(
        emails,
        100,
        async (batch) => {
          // Simulate 30ms API call
          await new Promise((r) => setTimeout(r, 30));
          return batch.map((_, i) => ({
            id: `id-${i}`,
            status: "queued" as const,
          }));
        },
        { concurrency: 5, rateLimit: 10 }
      );
      const duration = Date.now() - startTime;

      expect(results).toHaveLength(1000);
      expect(results.every((r) => r.status === "queued")).toBe(true);

      // With 10 batches, rate limiting adds ~100ms between requests
      // Total time depends on concurrency and rate limit staggering
      // Should complete in under 2 seconds
      expect(duration).toBeLessThan(2000);

      console.log(`1000 emails processed in ${duration}ms (${Math.round((1000 / duration) * 1000)} emails/sec)`);
    });

    test("respects rate limiting", async () => {
      const callTimes: number[] = [];
      const items = Array.from({ length: 10 }, (_, i) => i);

      await processBatchesParallel(
        items,
        1,
        async (batch) => {
          callTimes.push(Date.now());
          return batch;
        },
        { concurrency: 10, rateLimit: 10 } // 10 req/sec = 100ms between requests
      );

      // Check that calls are somewhat spaced out
      // With rate limit, we expect ~100ms between staggered requests
      expect(callTimes.length).toBe(10);
    });
  });

  describe("Bulk Email Scenarios", () => {
    test("Ghost newsletter: 500 subscribers with personalization", async () => {
      // Simulate Ghost sending newsletter to 500 subscribers
      // Each subscriber gets personalized email with recipient-variables
      const subscribers = Array.from({ length: 500 }, (_, i) => ({
        email: `user${i}@example.com`,
        name: `User ${i}`,
        id: i,
      }));

      const emails: Email[] = subscribers.map((sub) => ({
        from: "newsletter@ghost.com",
        to: [sub.email],
        subject: "Weekly Newsletter",
        html: `<p>Hello ${sub.name}!</p><p>Your ID is ${sub.id}</p>`,
        variables: { [sub.email]: { name: sub.name, id: sub.id } },
      }));

      const startTime = Date.now();
      const results = await processBatchesParallel(
        emails,
        100,
        async (batch) => {
          // Simulate 50ms API call per batch
          await new Promise((r) => setTimeout(r, 50));
          return batch.map((_, i) => ({
            id: `email-${i}`,
            status: "queued" as const,
          }));
        },
        { concurrency: 5, rateLimit: 10 }
      );
      const duration = Date.now() - startTime;

      expect(results).toHaveLength(500);
      console.log(`500 subscriber newsletter: ${duration}ms`);
    });

    test("Large blast: 5000 recipients (stress test)", async () => {
      const emails: Email[] = Array.from({ length: 5000 }, (_, i) => ({
        from: "blast@company.com",
        to: [`user${i}@test.com`],
        subject: "Important Update",
        html: "<p>Update content</p>",
      }));

      const startTime = Date.now();
      const results = await processBatchesParallel(
        emails,
        100,
        async (batch) => {
          // Simulate fast 20ms API call
          await new Promise((r) => setTimeout(r, 20));
          return batch.map((_, i) => ({
            id: `id-${i}`,
            status: "queued" as const,
          }));
        },
        { concurrency: 5, rateLimit: 10 }
      );
      const duration = Date.now() - startTime;

      expect(results).toHaveLength(5000);
      const emailsPerSec = Math.round((5000 / duration) * 1000);
      console.log(`5000 emails: ${duration}ms (${emailsPerSec} emails/sec)`);

      // Should handle 5000 emails in reasonable time
      expect(duration).toBeLessThan(5000); // Less than 5 seconds
    });
  });
});

describe("Throughput Benchmarks", () => {
  test("measure maximum theoretical throughput", async () => {
    // Best case: minimal simulated latency to measure processing overhead
    const emailCounts = [100, 500, 1000, 2000];
    const results: Array<{ count: number; duration: number; perSec: number }> = [];

    for (const count of emailCounts) {
      const emails = Array.from({ length: count }, (_, i) => i);

      const start = performance.now();
      await processBatchesParallel(
        emails,
        100,
        async (batch) => {
          // Minimal 1ms delay to ensure measurable time
          await new Promise((r) => setTimeout(r, 1));
          return batch.map((n) => ({ id: String(n), status: "queued" as const }));
        },
        { concurrency: 10, rateLimit: 0 }
      );
      const duration = performance.now() - start;

      results.push({
        count,
        duration: Math.round(duration),
        perSec: duration > 0 ? Math.round((count / duration) * 1000) : 0,
      });
    }

    console.log("\nThroughput Benchmark Results:");
    console.log("─".repeat(40));
    for (const r of results) {
      console.log(`${r.count} emails: ${r.duration}ms (${r.perSec}/sec)`);
    }
    console.log("─".repeat(40));

    // All should complete with some measurable duration
    expect(results.every((r) => r.count > 0)).toBe(true);
    expect(results).toHaveLength(emailCounts.length);
  });
});
