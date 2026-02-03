import { Hono } from "hono";
import { basicAuthMiddleware } from "./auth";
import { handleSendMessage } from "./messages";

export function createApiRoutes() {
  const api = new Hono();

  // Apply Basic Auth to all routes
  api.use("/*", basicAuthMiddleware);

  // POST /v3/:domain/messages - Send emails (critical endpoint)
  api.post("/:domain/messages", handleSendMessage);

  // Health check (no auth required for monitoring)
  // This is defined outside the auth middleware

  return api;
}
