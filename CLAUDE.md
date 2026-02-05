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
│   ├── auth.ts    # Basic auth middleware (v3)
│   ├── messages.ts # POST /v3/:domain/messages handler
│   ├── routes.ts  # v3 route definitions
│   └── v1/        # Universal API
│       ├── auth.ts      # Bearer/X-API-Key auth
│       ├── routes.ts    # v1 route definitions
│       ├── transformer.ts # Universal → internal format
│       ├── validation.ts  # Request validation
│       └── handlers/
│           ├── discovery.ts # GET /api/v1
│           ├── emails.ts    # POST /emails, /emails/batch
│           └── jobs.ts      # GET /jobs/:id
├── core/          # Core abstractions
│   ├── provider.ts    # EmailProvider interface
│   ├── registry.ts    # Provider registry
│   ├── transformer.ts # Mailgun → internal format
│   └── types.ts       # Type definitions
├── providers/     # Email provider implementations
│   ├── resend/    # Resend provider (batch API)
│   └── unione/    # UniOne provider
├── services/      # Business logic
│   └── job-store.ts   # In-memory batch job storage
├── utils/         # Utilities
│   ├── batch.ts   # Batch processing with rate limiting
│   ├── email.ts   # Email parsing utilities
│   └── logger.ts  # Structured logging
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
| `PORT` | No | Server port (default: 3001) |
| `LOG_LEVEL` | No | `debug`, `info`, `warn`, `error` |
| `MAIL_PROVIDER` | No | Default provider for Universal API (`resend`, `unione`) |

**Note:** API keys are provided per-request via Basic Auth (`provider:apikey` format) for v3 API, or Bearer token for v1 API.

## Key Files

- [src/index.ts](src/index.ts) - Application entry, provider initialization
- [src/api/messages.ts](src/api/messages.ts) - Mailgun-compatible email endpoint
- [src/api/v1/routes.ts](src/api/v1/routes.ts) - Universal API routes
- [src/api/v1/handlers/emails.ts](src/api/v1/handlers/emails.ts) - V1 email sending
- [src/core/transformer.ts](src/core/transformer.ts) - Mailgun format parsing
- [src/providers/resend/index.ts](src/providers/resend/index.ts) - Resend implementation
- [src/providers/unione/index.ts](src/providers/unione/index.ts) - UniOne implementation
- [src/services/job-store.ts](src/services/job-store.ts) - Batch job storage

## Authentication

mail-gate supports two authentication methods depending on the API:

### v3 API (Mailgun-compatible)

Basic Auth with `provider:apikey` format:

```http
Authorization: Basic base64(provider:apikey)
```

Examples: `resend:re_xxxxxxxxxxxx` or `unione:your-api-key`

### v1 API (Universal)

Bearer token or X-API-Key header:

```http
Authorization: Bearer your-api-key
```

Or:

```http
X-API-Key: your-api-key
```

## API Endpoints

| Method | Path                    | Auth   | Description                      |
|--------|-------------------------|--------|----------------------------------|
| GET    | `/health`               | No     | Health check                     |
| POST   | `/v3/:domain/messages`  | Basic  | Send email (Mailgun-compatible)  |
| GET    | `/api/v1`               | No     | API info & capabilities          |
| POST   | `/api/v1/emails`        | Bearer | Send single email                |
| POST   | `/api/v1/emails/batch`  | Bearer | Send batch (async)               |
| GET    | `/api/v1/jobs/:id`      | Bearer | Get batch job status             |

## Adding a New Provider

1. Create `src/providers/<name>/index.ts` implementing `EmailProvider`
2. Create `src/providers/<name>/transformer.ts` for format conversion
3. Register in `src/index.ts` during initialization
4. Add any region/config variables to `.env.example` (API keys are per-request)
5. Update README.md with provider documentation

## Testing

Tests use Bun's built-in test runner. Key test files:

- `test/api.test.ts` - v3 API endpoint tests
- `test/v1-api.test.ts` - Universal API tests
- `test/transformer.test.ts` - Format transformation tests
- `test/unione.test.ts` - UniOne provider tests
- `test/batch.test.ts` - Batch processing tests
- `test/email.test.ts` - Email parsing tests
- `test/performance.test.ts` - Performance benchmarks
