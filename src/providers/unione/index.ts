import type { EmailProvider } from "../../core/provider";
import type { Email, SendResult } from "../../core/types";
import { logger } from "../../utils/logger";
import { toUniOneRequest, type UniOneResponse } from "./transformer";

export type UniOneRegion = "us" | "eu";

export class UniOneProvider implements EmailProvider {
  readonly name = "unione";
  readonly batchSize = 500; // UniOne max recipients per request
  readonly rateLimit = 10; // Conservative rate limit

  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string, region: UniOneRegion = "us") {
    this.apiKey = apiKey;
    this.baseUrl =
      region === "eu"
        ? "https://eu1.unione.io"
        : "https://us1.unione.io";
  }

  async sendBatch(emails: Email[]): Promise<SendResult[]> {
    if (emails.length === 0) return [];

    const startTime = Date.now();
    logger.info("Starting UniOne batch send", { totalEmails: emails.length });

    const results: SendResult[] = [];

    // UniOne supports up to 500 recipients per request
    // Send each email individually to maintain per-email results
    for (const email of emails) {
      const result = await this.sendSingle(email);
      results.push(result);
    }

    const duration = Date.now() - startTime;
    const successful = results.filter((r) => r.status === "queued").length;
    const failed = results.filter((r) => r.status === "failed").length;

    logger.info("UniOne batch send complete", {
      totalEmails: emails.length,
      successful,
      failed,
      durationMs: duration,
    });

    return results;
  }

  private async sendSingle(email: Email): Promise<SendResult> {
    try {
      const request = toUniOneRequest(email);
      const url = `${this.baseUrl}/en/transactional/api/v1/email/send.json`;

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "X-API-KEY": this.apiKey,
        },
        body: JSON.stringify(request),
      });

      const data = (await response.json()) as UniOneResponse;

      if (!response.ok) {
        logger.error("UniOne API error", {
          status: response.status,
          message: data.message,
          code: data.code,
        });
        return {
          id: "",
          status: "failed",
          error: data.message ?? `HTTP ${response.status}`,
        };
      }

      if (data.status === "error") {
        logger.error("UniOne send error", {
          message: data.message,
          code: data.code,
        });
        return {
          id: "",
          status: "failed",
          error: data.message ?? "Unknown error",
        };
      }

      // Check for partial failures
      if (data.failed_emails && Object.keys(data.failed_emails).length > 0) {
        const failedAddresses = Object.keys(data.failed_emails);
        logger.warn("UniOne partial failure", {
          failed: failedAddresses,
          reasons: data.failed_emails,
        });

        // If all recipients failed
        if (failedAddresses.length === email.to.length) {
          return {
            id: data.job_id ?? "",
            status: "failed",
            error: `All recipients failed: ${JSON.stringify(data.failed_emails)}`,
          };
        }
      }

      logger.debug("UniOne email sent", {
        jobId: data.job_id,
        emails: data.emails,
      });

      return {
        id: data.job_id ?? "",
        status: "queued",
      };
    } catch (error) {
      logger.error("UniOne exception", {
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        id: "",
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }
}
