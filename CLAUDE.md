# CLAUDE.md

Development instructions for mail-gate.

## Project Overview

mail-gate is a Mailgun API compatibility middleware that allows Ghost CMS (and other Mailgun-dependent apps) to use alternative email providers like Resend and UniOne.

## Tech Stack

- **Runtime**: Bun
- **Framework**: Hono (web framework)
- **Language**: TypeScript
- **Providers**: Resend, UniOne

## Project Structure

```
src/
├── api/           # API routes and handlers
│   ├── auth.ts    # Basic auth middleware (Mailgun API)
│   ├── messages.ts # POST /v3/:domain/messages handler
│   ├── routes.ts  # Mailgun route definitions
│   └── v1/        # Universal API v1
│       ├── auth.ts    # Bearer + X-Provider auth middleware
│       ├── jobs.ts    # Batch job tracking
│       ├── routes.ts  # Universal API routes
│       └── types.ts   # Request/response types
├── core/          # Core abstractions
│   ├── provider.ts    # EmailProvider interface
│   ├── registry.ts    # Provider registry
│   ├── transformer.ts # Mailgun → internal format
│   └── types.ts       # Type definitions
├── providers/     # Email provider implementations
│   ├── resend/    # Resend provider (batch API)
│   └── unione/    # UniOne provider
├── utils/         # Utilities
│   ├── batch.ts   # Batch processing with rate limiting
│   ├── email.ts   # Email parsing utilities
│   ├── logger.ts  # Structured logging
│   └── ratelimit.ts # Request rate limiting middleware
└── index.ts       # Application entry point

test/              # Test files
```

## Commands

```bash
# Development
bun install        # Install dependencies
bun run dev        # Start with hot reload
bun run start      # Production start

# Testing
bun test           # Run all tests

# Code Quality
bun run lint       # Run ESLint
bun run lint:fix   # Fix ESLint issues
bun run format     # Format with Prettier
bun run format:check # Check formatting

# Docker
docker compose up -d      # Build and run
docker compose logs -f    # View logs
```

## Environment Variables

Copy `.env.example` to `.env` and configure:

| Variable | Required | Description |
|----------|----------|-------------|
| `UNIONE_REGION` | No | `eu` (default) or `us` |
| `PORT` | No | Server port (default: 4050) |
| `LOG_LEVEL` | No | `debug`, `info`, `warn`, `error` |
| `ALLOWED_ORIGINS` | Yes | Comma-separated CORS origins |
| `RATE_LIMIT_ENABLED` | No | Enable rate limiting (default: true) |
| `RATE_LIMIT_SEND_PER_MINUTE` | No | Email endpoints limit (default: 60) |
| `RATE_LIMIT_HEALTH_PER_MINUTE` | No | Health endpoint limit (default: 120) |
| `RATE_LIMIT_GLOBAL_PER_MINUTE` | No | Global fallback limit (default: 200) |

**Note:** API keys are provided per-request via headers, not via environment variables.

## Key Files

- [src/index.ts](src/index.ts) - Application entry, provider initialization, rate limiting setup
- [src/api/messages.ts](src/api/messages.ts) - Mailgun email sending endpoint
- [src/api/v1/routes.ts](src/api/v1/routes.ts) - Universal API endpoints
- [src/core/transformer.ts](src/core/transformer.ts) - Mailgun format parsing
- [src/providers/resend/index.ts](src/providers/resend/index.ts) - Resend implementation
- [src/providers/unione/index.ts](src/providers/unione/index.ts) - UniOne implementation
- [src/utils/ratelimit.ts](src/utils/ratelimit.ts) - Rate limiting middleware (sliding window)

## Authentication

mail-gate provides two APIs with different authentication methods:

### Mailgun-compatible API (`/v3`)

Uses Basic Auth with `provider:apikey` format:

```http
Authorization: Basic base64(provider:apikey)
```

Examples: `resend:re_xxxxxxxxxxxx` or `unione:your-api-key`

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

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | No | Health check |
| GET | `/api/v1` | No | API info & feature discovery |

### Mailgun-compatible API

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/v3/:domain/messages` | Basic | Send email (Mailgun format) |

### Universal API

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/v1/emails` | Bearer | Send single email |
| POST | `/api/v1/emails/batch` | Bearer | Send batch emails (async, returns 202) |
| GET | `/api/v1/jobs/:id` | Bearer | Get batch job status |

## Adding a New Provider

1. Create `src/providers/<name>/index.ts` implementing `EmailProvider`
2. Create `src/providers/<name>/transformer.ts` for format conversion
3. Register in `src/index.ts` during initialization
4. Add any region/config variables to `.env.example` (API keys are per-request)
5. Update README.md with provider documentation

## Testing

Tests use Bun's built-in test runner. Key test files:

- `test/api.test.ts` - Mailgun API endpoint tests
- `test/universal-api.test.ts` - Universal API endpoint tests
- `test/transformer.test.ts` - Format transformation tests
- `test/unione.test.ts` - UniOne provider tests
- `test/batch.test.ts` - Batch processing tests
- `test/email.test.ts` - Email parsing tests
- `test/ratelimit.test.ts` - Rate limiting tests
- `test/performance.test.ts` - Performance benchmarks
