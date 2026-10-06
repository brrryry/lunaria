# Multi-stage Dockerfile for @lunaria/backend
FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@10.12.1 --activate

# Stage 1: Prune workspace to only @lunaria/backend and its dependencies
FROM base AS pruner
RUN apk add --no-cache libc6-compat
WORKDIR /app
RUN npm install -g turbo
COPY . .
RUN turbo prune @lunaria/backend --docker

# Stage 2: Install dependencies and build
FROM base AS builder
RUN apk add --no-cache libc6-compat
WORKDIR /app

# First install dependencies (cached unless package.json / lockfile change)
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile

# Copy source code and build
COPY --from=pruner /app/out/full/ .
RUN pnpm turbo run build --filter=@lunaria/backend

# Stage 3: Production runner
FROM base AS runner
RUN apk add --no-cache libc6-compat curl
WORKDIR /app

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nestjs

COPY --from=builder --chown=nestjs:nodejs /app .

USER nestjs

ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001

CMD ["node", "backend/dist/main"]
