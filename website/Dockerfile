# Multi-stage Dockerfile for @lunaria/website
FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@10.12.1 --activate

# Stage 1: Prune workspace to only @lunaria/website and its dependencies
FROM base AS pruner
RUN apk add --no-cache libc6-compat
WORKDIR /app
RUN npm install -g turbo
COPY . .
RUN turbo prune @lunaria/website --docker

# Stage 2: Install dependencies and build
FROM base AS builder
RUN apk add --no-cache libc6-compat
WORKDIR /app

# First install dependencies (cached unless package.json / lockfile change)
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile

# Copy source code
COPY --from=pruner /app/out/full/ .

# In Next.js, NEXT_PUBLIC_* variables are inlined at build time
ARG NEXT_PUBLIC_API_URL=http://localhost:3001/api
ARG NEXT_PUBLIC_VAPID_PUBLIC_KEY=""
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_VAPID_PUBLIC_KEY=$NEXT_PUBLIC_VAPID_PUBLIC_KEY

RUN pnpm turbo run build --filter=@lunaria/website

# Stage 3: Production runner
FROM base AS runner
RUN apk add --no-cache libc6-compat curl
WORKDIR /app

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app .

USER nextjs

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["pnpm", "--filter", "@lunaria/website", "start"]
