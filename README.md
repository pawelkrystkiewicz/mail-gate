# mail-gate

**Drop-in Mailgun replacement for Ghost CMS** — Use Resend, UniOne, or other email providers instead of Mailgun.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Bun](https://img.shields.io/badge/Bun-%23000000.svg?logo=bun&logoColor=white)](https://bun.sh)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

> **Keywords:** Ghost CMS email, Mailgun alternative, Ghost newsletter, Resend Ghost integration, UniOne Ghost, free email for Ghost, Ghost bulk email, Mailgun API compatible, Ghost email provider, self-hosted email gateway

## What is mail-gate?

mail-gate is a **Mailgun API-compatible proxy** that lets you use alternative email providers with Ghost CMS (or any app that requires Mailgun). It translates Mailgun API calls to your preferred provider's format.

### The Problem

Ghost CMS **requires Mailgun** for sending newsletters and bulk email. Mailgun's minimum plan costs **$14+/month** — even if you send zero emails.

### The Solution

mail-gate acts as a drop-in replacement that:

- Implements the **Mailgun API** that Ghost expects
- Routes emails through **free-tier providers** like Resend or UniOne
- Requires **zero code changes** to Ghost
- Works with **any Mailgun-dependent application**
- Also provides a **Universal API** for non-Ghost applications

## Supported Email Providers

| Provider | Status | Free Tier | Notes |
|----------|--------|-----------|-------|
| [Resend](https://resend.com) | ✅ Ready | 3,000/month | Great developer experience |
| [UniOne](https://unione.io) | ✅ Ready | 6,000/month | EU and US regions |
| Amazon SES | 📋 Planned | 62,000/month (EC2) | Coming soon |
| Postmark | 📋 Planned | 100/month | Coming soon |
| SendGrid | 📋 Planned | 100/day | Coming soon |

## Quick Start

### Option 1: Docker (Recommended)

```bash
# Clone the repository
git clone https://github.com/yourusername/mail-gate.git
cd mail-gate

# Configure environment
cp .env.example .env
# Edit .env - ALLOWED_ORIGINS is required for CORS

# Start the server
docker compose up -d

# Check logs
docker compose logs -f
```

### Option 2: Run with Bun

```bash
# Clone the repository
git clone https://github.com/yourusername/mail-gate.git
cd mail-gate

# Install dependencies
bun install

# Configure environment
cp .env.example .env
# Edit .env - ALLOWED_ORIGINS is required for CORS

# Start the server
bun run start

# Or for development with hot reload
bun run dev
```

### Option 3: Run from Source

```bash
git clone https://github.com/yourusername/mail-gate.git
cd mail-gate
bun install
cp .env.example .env
bun run src/index.ts
```

## Configuring Ghost CMS

Ghost stores Mailgun settings in its database. You need to update two settings:

### Step 1: Get Your Provider API Key

- **Resend**: Get your API key from [resend.com/api-keys](https://resend.com/api-keys)
- **UniOne**: Get your API key from the UniOne dashboard

### Step 2: Update Ghost Database

Connect to your Ghost database and run:

```sql
-- Point Ghost to mail-gate instead of Mailgun
UPDATE settings
SET value = 'http://localhost:4050/v3'
WHERE `key` = 'mailgun_base_url';

-- Set your API key in "provider:apikey" format
UPDATE settings
SET value = 'resend:re_xxxxxxxxxxxx'
WHERE `key` = 'mailgun_api_key';
```

**If using Docker Compose** with Ghost and mail-gate in the same network:

```sql
UPDATE settings
SET value = 'http://mail-gate:4050/v3'
WHERE `key` = 'mailgun_base_url';
```

### Step 3: Restart Ghost

```bash
# Docker
docker restart ghost

# Ghost-CLI
ghost restart
```

### Step 4: Test Your Setup

Send a test newsletter from Ghost Admin. Check mail-gate logs to verify the request is being processed:

```bash
# Docker
docker compose logs -f mail-gate

# Local
# Logs appear in terminal
```

## Configuration

### Environment Variables

| Variable | Required | Description | Default |
|----------|----------|-------------|---------|
| `ALLOWED_ORIGINS` | Yes | Comma-separated CORS origins | - |
| `PORT` | No | Server port | `4050` |
| `UNIONE_REGION` | No | UniOne region (`eu` or `us`) | `eu` |
| `LOG_LEVEL` | No | Log verbosity (`debug`, `info`, `warn`, `error`) | `info` |

Copy `.env.example` to `.env` to customize:

```bash
cp .env.example .env
```

> **Note:** API keys are provided per-request via headers, not stored in environment variables. This allows multiple providers and keys without restarting the server.

## APIs

mail-gate provides two APIs:

| API | Path | Use Case |
|-----|------|----------|
| Mailgun-compatible | `/v3` | Ghost CMS integration (drop-in Mailgun replacement) |
| Universal API | `/api/v1` | Modern REST interface for other applications |

## Authentication

### Mailgun-compatible API (`/v3`)

Uses HTTP Basic Auth with `provider:apikey` format:

```
Authorization: Basic base64(provider:apikey)
```

| Provider | Example |
|----------|---------|
| Resend | `resend:re_xxxxxxxxxxxx` |
| UniOne | `unione:your-api-key-here` |

Ghost handles this automatically once you set `mailgun_api_key` in the database.

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
  -F "from=Your Name <sender@yourdomain.com>" \
  -F "to=recipient@example.com" \
  -F "subject=Hello from mail-gate" \
  -F "html=<h1>It works!</h1>"
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

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────────┐
│  Ghost CMS  │────▶│  mail-gate  │────▶│  Email Provider │
│             │     │ (Mailgun API)│     │ (Resend/UniOne) │
└─────────────┘     └─────────────┘     └─────────────────┘
       or
┌─────────────┐     ┌─────────────┐     ┌─────────────────┐
│  Your App   │────▶│  mail-gate  │────▶│  Email Provider │
│             │     │(Universal API)│    │ (Resend/UniOne) │
└─────────────┘     └─────────────┘     └─────────────────┘
```

1. Ghost/App sends email via Mailgun API or Universal API format
2. mail-gate receives and transforms the request
3. Request is forwarded to your chosen provider
4. Response is translated back to the expected format

## Testing

```bash
bun test
```

## Troubleshooting

### Ghost shows "Email failed to send"

1. **Check mail-gate is running:**
   ```bash
   curl http://localhost:4050/health
   ```

2. **Verify your API key format:**
   - Must be `provider:apikey` (e.g., `resend:re_xxx`)
   - Check for typos in the provider name

3. **Check mail-gate logs for errors:**
   ```bash
   docker compose logs mail-gate
   ```

### Connection refused errors

- Ensure mail-gate is accessible from Ghost
- If using Docker, ensure both containers are on the same network
- Check firewall rules if running on separate hosts

### CORS errors

- Ensure `ALLOWED_ORIGINS` is set in your `.env` file
- Include all origins that will make requests to mail-gate

### Emails not arriving

1. Check your provider's dashboard for delivery status
2. Verify your sending domain is configured in the provider
3. Check spam folders
4. Review provider-specific requirements (SPF, DKIM, etc.)

### Rate limiting issues

Each provider has different rate limits. See [docs/CAVEATS.md](docs/CAVEATS.md) for details.

## Documentation

- [Caveats & Known Limitations](docs/CAVEATS.md) — Provider-specific limitations and optimization notes

## Contributing

Contributions are welcome! Here's how to get started:

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes
4. Run tests: `bun test`
5. Run linting: `bun run lint`
6. Submit a pull request

### Adding a New Provider

See [CLAUDE.md](CLAUDE.md) for detailed instructions on implementing new email providers.

## License

MIT — see [LICENSE](LICENSE) for details.

---

**Found mail-gate useful?** Give it a ⭐ on GitHub!
