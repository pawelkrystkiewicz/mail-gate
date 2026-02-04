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

### Rate Limiting

Each provider has different rate limits. mail-gate implements basic rate limiting via the `rateLimit` property on each provider, but this is a simple sequential approach rather than sophisticated throttling.

| Provider | Configured Rate Limit | API Actual Limit |
|----------|----------------------|------------------|
| UniOne | 10 req/s | Varies by plan |
| Resend | 10 req/s | Varies by plan |
