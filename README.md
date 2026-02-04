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

## Testing

```bash
bun test
```

## Architecture

```
Ghost CMS → mail-gate (Mailgun API Layer) → Provider Adapter → Resend/UniOne/etc.
```

mail-gate implements the Mailgun API that Ghost expects, then translates requests to the format required by your chosen email provider.

## Documentation

- [Caveats & Known Limitations](docs/CAVEATS.md) - Provider-specific limitations and optimization notes

## License

MIT
