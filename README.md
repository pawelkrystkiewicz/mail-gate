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
# Edit .env with your Resend API key
```

### 3. Run the server

```bash
bun run dev
```

### 4. Configure Ghost

Update Ghost's Mailgun base URL in the database:

```sql
UPDATE settings
SET value = 'http://127.0.0.1:3001/v3'
WHERE `key` = 'mailgun_base_url';
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
| `MAIL_PROVIDER` | Active email provider (`resend`, `unione`) | `resend` |
| `RESEND_API_KEY` | Resend API key | - |
| `UNIONE_API_KEY` | UniOne API key | - |
| `UNIONE_REGION` | UniOne region (`us`, `eu`) | `us` |
| `PORT` | Server port | `3001` |
| `LOG_LEVEL` | Log level (debug/info/warn/error) | `info` |

## API Endpoints

### Health Check

```bash
curl http://localhost:3001/health
```

### Send Email (Mailgun-compatible)

```bash
curl -X POST http://localhost:3001/v3/your-domain.com/messages \
  -u "api:your-mailgun-api-key" \
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

## License

MIT
