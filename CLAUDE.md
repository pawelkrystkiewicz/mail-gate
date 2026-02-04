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
│   ├── auth.ts    # Basic auth middleware
│   ├── messages.ts # POST /v3/:domain/messages handler
│   └── routes.ts  # Route definitions
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
| `MAIL_PROVIDER` | No | `resend` (default) or `unione` |
| `RESEND_API_KEY` | If using Resend | API key from resend.com |
| `UNIONE_API_KEY` | If using UniOne | API key from UniOne |
| `UNIONE_REGION` | No | `us` (default) or `eu` |
| `PORT` | No | Server port (default: 3001) |
| `LOG_LEVEL` | No | `debug`, `info`, `warn`, `error` |

## Key Files

- [src/index.ts](src/index.ts) - Application entry, provider initialization
- [src/api/messages.ts](src/api/messages.ts) - Main email sending endpoint
- [src/core/transformer.ts](src/core/transformer.ts) - Mailgun format parsing
- [src/providers/resend/index.ts](src/providers/resend/index.ts) - Resend implementation
- [src/providers/unione/index.ts](src/providers/unione/index.ts) - UniOne implementation

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check (no auth) |
| POST | `/v3/:domain/messages` | Send email (Mailgun-compatible) |

## Adding a New Provider

1. Create `src/providers/<name>/index.ts` implementing `EmailProvider`
2. Create `src/providers/<name>/transformer.ts` for format conversion
3. Register in `src/index.ts` during initialization
4. Add environment variables to `.env.example`
5. Update `docker-compose.yml` with new env vars

## Testing

Tests use Bun's built-in test runner. Key test files:
- `test/api.test.ts` - API endpoint tests
- `test/transformer.test.ts` - Format transformation tests
- `test/unione.test.ts` - UniOne provider tests
