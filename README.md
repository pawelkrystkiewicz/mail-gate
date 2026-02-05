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
# Edit .env - ALLOWED_ORIGINS is required for CORS
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
SET value = 'http://127.0.0.1:4050/v3'
WHERE `key` = 'mailgun_base_url';

-- Set the API key in provider:apikey format
UPDATE settings
SET value = 'resend:re_xxxxxxxxxxxx'
WHERE `key` = 'mailgun_api_key';
```

Or if using Docker, point to your mail-gate container:

```sql
UPDATE settings
SET value = 'http://mail-gate:4050/v3'
WHERE `key` = 'mailgun_base_url';
```

## Docker

### Build and run

```bash
docker compose up -d
```

### Environment variables

| Variable | Required | Description | Default |
|----------|----------|-------------|---------|
| `ALLOWED_ORIGINS` | Yes | Comma-separated CORS origins | - |
| `UNIONE_REGION` | No | UniOne region (`eu`, `us`) | `eu` |
| `PORT` | No | Server port | `4050` |
| `LOG_LEVEL` | No | Log level (debug/info/warn/error) | `info` |

> **Note:** API keys are provided per-request via headers (see [Authentication](#authentication) below). No API keys are stored in environment variables.

## APIs

mail-gate provides two APIs:

| API | Path | Use Case |
|-----|------|----------|
| Mailgun-compatible | `/v3` | Ghost CMS integration (drop-in Mailgun replacement) |
| Universal API | `/api/v1` | Modern REST interface for other applications |

## Authentication

### Mailgun-compatible API (`/v3`)

Uses HTTP Basic Auth with `provider:apikey` format:

```http
Authorization: Basic base64(provider:apikey)
```

**Examples:**
- Resend: `resend:re_xxxxxxxxxxxx`
- UniOne: `unione:your-unione-api-key`

### Universal API (`/api/v1`)

Uses Bearer token or X-API-Key header with X-Provider header:

```http
Authorization: Bearer <apikey>
X-Provider: resend
```

Or:

```http
X-API-Key: <apikey>
X-Provider: resend
```

## API Endpoints

### Health & Discovery

```bash
# Health check
curl http://localhost:4050/health

# API info (Universal API)
curl http://localhost:4050/api/v1
```

### Mailgun-compatible API

```bash
# Send email using Resend
curl -X POST http://localhost:4050/v3/your-domain.com/messages \
  -u "resend:re_xxxxxxxxxxxx" \
  -F "from=sender@example.com" \
  -F "to=recipient@example.com" \
  -F "subject=Test Email" \
  -F "html=<p>Hello World</p>"
```

### Universal API

```bash
# Send single email
curl -X POST http://localhost:4050/api/v1/emails \
  -H "Authorization: Bearer re_xxxxxxxxxxxx" \
  -H "X-Provider: resend" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "sender@example.com",
    "to": "recipient@example.com",
    "subject": "Test Email",
    "html": "<p>Hello World</p>"
  }'

# Send batch emails (async)
curl -X POST http://localhost:4050/api/v1/emails/batch \
  -H "Authorization: Bearer re_xxxxxxxxxxxx" \
  -H "X-Provider: resend" \
  -H "Content-Type: application/json" \
  -d '{
    "emails": [
      {"from": "sender@example.com", "to": "user1@example.com", "subject": "Hello", "text": "Hi there"},
      {"from": "sender@example.com", "to": "user2@example.com", "subject": "Hello", "text": "Hi there"}
    ]
  }'
# Returns 202 with jobId, poll /api/v1/jobs/:id for status

# Check batch job status
curl http://localhost:4050/api/v1/jobs/{jobId} \
  -H "Authorization: Bearer re_xxxxxxxxxxxx" \
  -H "X-Provider: resend"
```

### API Reference

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | No | Health check |
| GET | `/api/v1` | No | API info & feature discovery |
| POST | `/v3/:domain/messages` | Basic | Send email (Mailgun format) |
| POST | `/api/v1/emails` | Bearer | Send single email |
| POST | `/api/v1/emails/batch` | Bearer | Send batch emails (returns 202) |
| GET | `/api/v1/jobs/:id` | Bearer | Get batch job status |

## Testing

```bash
bun test
```

## Architecture

```
Ghost CMS → mail-gate (Mailgun API Layer) → Provider Adapter → Resend/UniOne/etc.
     or
Your App  → mail-gate (Universal API)    → Provider Adapter → Resend/UniOne/etc.
```

mail-gate implements the Mailgun API that Ghost expects, plus a modern Universal API for other applications. Requests are translated to the format required by your chosen email provider.

## Documentation

- [Caveats & Known Limitations](docs/CAVEATS.md) - Provider-specific limitations and optimization notes

## License

MIT
