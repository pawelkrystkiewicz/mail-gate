import { Hono } from "hono";
import { cors } from "hono/cors";
import { createApiRoutes } from "./api/routes";
import { registry } from "./core/registry";
import { ResendProvider } from "./providers/resend";
import { UniOneProvider, parseUniOneRegion } from "./providers/unione";
import { logger } from "./utils/logger";

const app = new Hono();

// CORS middleware
app.use("/*", cors());

// Health check endpoint (no auth)
app.get("/health", (c) => {
  return c.json({
    status: "ok",
    provider: process.env.MAIL_PROVIDER ?? "resend",
    providers: registry.list(),
  });
});

// Mount Mailgun-compatible API at /v3
const api = createApiRoutes();
app.route("/v3", api);

// Initialize providers
function initializeProviders() {
  const resendApiKey = process.env.RESEND_API_KEY;
  if (resendApiKey) {
    const resendProvider = new ResendProvider(resendApiKey);
    registry.register(resendProvider);
    logger.info("Registered provider: resend");
  } else {
    logger.warn("RESEND_API_KEY not set, Resend provider not available");
  }

  const unioneApiKey = process.env.UNIONE_API_KEY;
  if (unioneApiKey) {
    const region = parseUniOneRegion(process.env.UNIONE_REGION);
    const unioneProvider = new UniOneProvider(unioneApiKey, region);
    registry.register(unioneProvider);
    logger.info("Registered provider: unione", { region });
  } else {
    logger.warn("UNIONE_API_KEY not set, UniOne provider not available");
  }
}

// Start server
const port = parseInt(process.env.PORT ?? "3001", 10);

initializeProviders();

logger.info(`mail-gate starting on port ${port}`);
logger.info(`Active provider: ${process.env.MAIL_PROVIDER ?? "resend"}`);

export default {
  port,
  fetch: app.fetch,
};
