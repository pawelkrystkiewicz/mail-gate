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

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `4050` |
| `UNIONE_REGION` | UniOne region (`eu` or `us`) | `eu` |
| `LOG_LEVEL` | Log verbosity (`debug`, `info`, `warn`, `error`) | `info` |

Copy `.env.example` to `.env` to customize:

```bash
cp .env.example .env
```

> **Note:** API keys are provided per-request via Basic Auth, not stored in environment variables. This allows multiple providers and keys without restarting the server.

## Authentication

mail-gate uses **stateless authentication**. Each request includes the provider and API key via HTTP Basic Auth:

```
Authorization: Basic base64(provider:apikey)
```

**Format:** `provider:apikey`

| Provider | Example |
|----------|---------|
| Resend | `resend:re_xxxxxxxxxxxx` |
| UniOne | `unione:your-api-key-here` |

Ghost handles this automatically once you set `mailgun_api_key` in the database.

## API Reference

### Health Check

```bash
curl http://localhost:4050/health
```

```json
{
  "status": "ok",
  "mode": "stateless",
  "providers": ["resend", "unione"]
}
```

### Send Email (Mailgun-compatible)

```bash
curl -X POST http://localhost:4050/v3/your-domain.com/messages \
  -u "resend:re_xxxxxxxxxxxx" \
  -F "from=Your Name <sender@yourdomain.com>" \
  -F "to=recipient@example.com" \
  -F "subject=Hello from mail-gate" \
  -F "html=<h1>It works!</h1>"
```

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────────┐
│  Ghost CMS  │────▶│  mail-gate  │────▶│  Email Provider │
│             │     │ (Mailgun API)│     │ (Resend/UniOne) │
└─────────────┘     └─────────────┘     └─────────────────┘
```

1. Ghost sends email via Mailgun API format
2. mail-gate receives and transforms the request
3. Request is forwarded to your chosen provider
4. Response is translated back to Mailgun format

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
