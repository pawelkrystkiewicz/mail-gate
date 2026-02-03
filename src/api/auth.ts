import type { Context, Next } from "hono";
import { logger } from "../utils/logger";

export async function basicAuthMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header("Authorization");

  if (!authHeader) {
    logger.warn("Missing Authorization header");
    return c.json({ message: "Authentication required" }, 401);
  }

  if (!authHeader.startsWith("Basic ")) {
    logger.warn("Invalid Authorization header format");
    return c.json({ message: "Invalid authentication format" }, 401);
  }

  try {
    const base64Credentials = authHeader.slice(6);
    const credentials = atob(base64Credentials);
    const [username, password] = credentials.split(":");

    // Mailgun uses "api" as username and the API key as password
    if (username !== "api" || !password) {
      logger.warn("Invalid credentials format");
      return c.json({ message: "Invalid credentials" }, 401);
    }

    // Store the API key in context for potential use
    c.set("apiKey", password);

    await next();
  } catch {
    logger.error("Auth parsing error");
    return c.json({ message: "Invalid authentication" }, 401);
  }
}
