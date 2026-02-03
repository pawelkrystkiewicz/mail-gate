FROM oven/bun:1 AS builder

WORKDIR /app

# Copy package files
COPY package.json bun.lockb ./

# Install dependencies
RUN bun install --frozen-lockfile --production

# Copy source code
COPY src ./src
COPY tsconfig.json ./

# Production image
FROM oven/bun:1-slim

WORKDIR /app

# Copy from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/src ./src
COPY --from=builder /app/package.json ./

# Create non-root user
RUN addgroup --system --gid 1001 mailgate && \
    adduser --system --uid 1001 --ingroup mailgate mailgate
USER mailgate

ARG PORT=3001
EXPOSE ${PORT}

ENV NODE_ENV=production
ENV PORT=${PORT}

CMD ["bun", "run", "src/index.ts"]
