# Caveats & Known Limitations

This document describes provider-specific limitations and architectural decisions in mail-gate.

## UniOne Provider

### Batch Sending Not Fully Optimized

UniOne's API supports up to **500 recipients per single API request**, which enables efficient batch sending. However, mail-gate's current implementation does not fully leverage this capability.

**Current behavior:**
- Each `Email` object is sent as a separate API call
- If a single email has multiple recipients in the `to` field, they are correctly batched into one UniOne API call
- Multiple `Email` objects with identical content are NOT consolidated into a single API call

**Code reference:** [src/providers/unione/index.ts:46-49](../src/providers/unione/index.ts#L46-L49)

```typescript
for (const email of emails) {
  const result = await this.sendSingle(email, apiKey)  // Sequential, not batched
  results.push(result)
}
```

**Why this matters:**
- For typical Ghost CMS usage, this is not an issue since Ghost sends individual emails per subscriber
- For high-volume scenarios with identical content going to many recipients, this results in more API calls than necessary

**Potential improvement:**
Consolidate multiple `Email` objects with identical `subject`, `from`, `html`, and `text` into a single UniOne API call with combined recipients (up to 500 per call).

**References:**
- [UniOne Web API Documentation](https://docs.unione.io/en/web-api)
- [UniOne API Reference - email/send](https://docs.unione.io/en/web-api-ref#email-send)

---

## Resend Provider

### Batch API Limitations

Resend's batch API has different constraints. See [Resend documentation](https://resend.com/docs/api-reference/emails/send-batch-emails) for current limits.

---

## General

### Request Rate Limiting (mail-gate)

mail-gate enforces per-IP rate limits to protect against abuse and resource exhaustion. The limits use a **sliding window algorithm** for smooth rate limiting (prevents burst traffic at window boundaries).

| Endpoint | Default Limit | Purpose |
|----------|---------------|---------|
| `/v3/:domain/messages` | 60 req/min | Email sending (Mailgun API) |
| `/api/v1/emails`, `/api/v1/emails/batch` | 60 req/min | Email sending (Universal API) |
| `/health` | 120 req/min | Health checks (monitoring-friendly) |
| All other endpoints | 200 req/min | Global fallback |

**Response headers included:**
- `X-RateLimit-Limit` — Maximum requests allowed
- `X-RateLimit-Remaining` — Requests remaining in current window
- `X-RateLimit-Reset` — Unix timestamp when the window resets
- `Retry-After` — Seconds to wait (only on 429 responses)

**Configuration:**
```bash
RATE_LIMIT_ENABLED=true           # Set to "false" to disable
RATE_LIMIT_SEND_PER_MINUTE=60     # Email endpoint limit
RATE_LIMIT_HEALTH_PER_MINUTE=120  # Health endpoint limit
RATE_LIMIT_GLOBAL_PER_MINUTE=200  # Global fallback
```

**Proxy support:** mail-gate respects `X-Forwarded-For` and `X-Real-IP` headers for accurate client IP detection behind reverse proxies (Traefik, Nginx, etc.).

### Provider Rate Limiting

Each provider has different rate limits for their APIs. mail-gate implements provider-level rate limiting via the `rateLimit` property on each provider.

| Provider | Configured Rate Limit | API Actual Limit |
|----------|----------------------|------------------|
| UniOne | 10 req/s | Varies by plan |
| Resend | 10 req/s | Varies by plan |

**Note:** Provider rate limits are separate from mail-gate's request rate limits. Even if mail-gate allows a request through, the downstream provider may reject it if you exceed their limits.
