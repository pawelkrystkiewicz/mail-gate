# mail-gate

Middleware API that mimics Mailgun, allowing Ghost CMS (and other Mailgun-dependent apps) to use alternative email providers.

## Why?

Ghost CMS requires Mailgun for bulk email (newsletters), costing $14+/month even with zero usage. mail-gate lets you use free-tier providers like Resend (3,000 emails/month free) instead.

## Supported Providers

| Provider | Status | Free Tier |
|----------|--------|-----------|
| Resend | ✅ Ready | 3,000/month |
| UniOne | ✅ Ready | 6,000/month |
| Amazon SES | 📋 Planned | 62,000/month (EC2) |
| Postmark | 📋 Planned | 100/month |
| SendGrid | 📋 Planned | 100/day |

## Quick Start

### 1. Install dependencies

```bash
bun install
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env if you need to change PORT or UNIONE_REGION
```

### 3. Run the server

```bash
bun run dev
```

### 4. Configure Ghost

Update Ghost's Mailgun settings in the database:

```sql
-- Set the mail-gate URL
UPDATE settings
SET value = 'http://127.0.0.1:3001/v3'
WHERE `key` = 'mailgun_base_url';

-- Set the API key in provider:apikey format
UPDATE settings
SET value = 'resend:re_xxxxxxxxxxxx'
WHERE `key` = 'mailgun_api_key';
```

Or if using Docker, point to your mail-gate container:

```sql
UPDATE settings
SET value = 'http://mail-gate:3001/v3'
WHERE `key` = 'mailgun_base_url';
```

## Docker

### Build and run

```bash
docker compose up -d
```

### Environment variables

| Variable | Description | Default |
|----------|-------------|---------|
| `UNIONE_REGION` | UniOne region (`eu`, `us`) | `eu` |
| `PORT` | Server port | `3001` |
| `LOG_LEVEL` | Log level (debug/info/warn/error) | `info` |
| `MAIL_PROVIDER` | Default provider for Universal API (`resend`, `unione`) | `resend` |

> **Note:** API keys are provided per-request via Basic Auth (see [Authentication](#authentication) below). No API keys are stored in environment variables.

## Authentication

mail-gate uses a stateless authentication model. API keys are provided per-request via HTTP Basic Auth:

```http
Authorization: Basic base64(provider:apikey)
```

Where `provider` is the email provider name (`resend` or `unione`) and `apikey` is your API key for that provider.

**Examples:**

- Resend: `resend:re_xxxxxxxxxxxx`
- UniOne: `unione:your-unione-api-key`

## API Endpoints

### Health Check

```bash
curl http://localhost:3001/health
```

### Send Email (Mailgun-compatible)

```bash
# Using Resend
curl -X POST http://localhost:3001/v3/your-domain.com/messages \
  -u "resend:re_xxxxxxxxxxxx" \
  -F "from=sender@example.com" \
  -F "to=recipient@example.com" \
  -F "subject=Test Email" \
  -F "html=<p>Hello World</p>"

# Using UniOne
curl -X POST http://localhost:3001/v3/your-domain.com/messages \
  -u "unione:your-unione-api-key" \
  -F "from=sender@example.com" \
  -F "to=recipient@example.com" \
  -F "subject=Test Email" \
  -F "html=<p>Hello World</p>"
```

## Universal API (v1)

For applications that don't need Mailgun compatibility, mail-gate provides a modern REST API at `/api/v1`.

### Features

- **Bearer token authentication** - Simple `Authorization: Bearer <key>` or `X-API-Key` header
- **Structured JSON requests** - Clean `{ email, name }` format instead of form-data
- **Async batch processing** - Submit batches, poll for status
- **Feature discovery** - Query provider capabilities at runtime

### V1 Authentication

```http
Authorization: Bearer your-api-key
```

Or:

```http
X-API-Key: your-api-key
```

### V1 Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1` | API info & capabilities |
| POST | `/api/v1/emails` | Send single email |
| POST | `/api/v1/emails/batch` | Send batch (returns 202) |
| GET | `/api/v1/jobs/:id` | Get batch job status |

### V1 Examples

**Send single email:**

```bash
curl -X POST http://localhost:3001/api/v1/emails \
  -H "Authorization: Bearer re_xxxxxxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{
    "from": { "email": "sender@example.com", "name": "Sender" },
    "to": [{ "email": "recipient@example.com" }],
    "subject": "Hello",
    "content": { "text": "Hello World" }
  }'
```

**Send batch (async):**

```bash
curl -X POST http://localhost:3001/api/v1/emails/batch \
  -H "X-API-Key: re_xxxxxxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{
    "emails": [
      {
        "from": { "email": "sender@example.com" },
        "to": [{ "email": "user1@example.com" }],
        "subject": "Hello",
        "content": { "text": "Hello User 1" }
      },
      {
        "from": { "email": "sender@example.com" },
        "to": [{ "email": "user2@example.com" }],
        "subject": "Hello",
        "content": { "text": "Hello User 2" }
      }
    ]
  }'
```

**Check job status:**

```bash
curl http://localhost:3001/api/v1/jobs/job_abc123 \
  -H "Authorization: Bearer re_xxxxxxxxxxxx"
```

**Discover capabilities:**

```bash
curl http://localhost:3001/api/v1
```

## Testing

```bash
bun test
```

## Architecture

```
                    ┌─────────────────────────────────────────┐
                    │              mail-gate                   │
                    │                                         │
Ghost CMS ─────────▶│  /v3 (Mailgun-compatible)              │
                    │         │                               │
                    │         ▼                               │
Other Apps ────────▶│  /api/v1 (Universal API)               │──▶ Resend/UniOne/etc.
                    │         │                               │
                    │         ▼                               │
                    │  Provider Adapter Layer                 │
                    └─────────────────────────────────────────┘
```

mail-gate provides two APIs:
- `/v3` - Mailgun-compatible API for Ghost CMS and other Mailgun-dependent apps
- `/api/v1` - Modern Universal API for new applications

## Documentation

- [Caveats & Known Limitations](docs/CAVEATS.md) - Provider-specific limitations and optimization notes

## License

MIT
