# Lunaria — Private Wealth & Financial Intelligence

Lunaria is a modern, cross-platform personal finance platform inspired by Monarch Money, engineered with:
- **Web App**: Next.js 14+ with App Router & modular widgets
- **Mobile Apps (iOS & Android)**: React Native + Expo SDK 51+ with unified navigation
- **Backend**: NestJS modular API gateway
- **Live Bank Connections**: Plaid API with AES-256-GCM encrypted tokens & webhook sync
- **Modular Dashboard Widgets**: Dynamic customizable layout saved per user
- **Investment Tracking**: Historical portfolio graphs and security snapshots
- **Security & Zero Casual Access**: KMS-backed encryption at rest, immutable audit logging, and Pino structured log scrubbing

---

## 🏗️ Monorepo Architecture

```
lunaria/
├── website/              # Next.js 14 Web Application
├── mobile/               # React Native & Expo App (iOS & Android)
├── backend/              # NestJS Modular Backend API
├── packages/
│   ├── types/            # Shared TypeScript interfaces & DTOs
│   └── db/               # Drizzle ORM PostgreSQL Schema & Migrations
├── pnpm-workspace.yaml   # Workspace configuration
└── turbo.json            # Turborepo build pipeline
```

---

## 🚀 Quick Start

### 1. Prerequisites
- **Node.js**: v20+ (tested with v26)
- **pnpm**: v10+ (`npm install -g pnpm`)
- **PostgreSQL**: (or Supabase / Neon connection URL)

### 2. Install Dependencies
```bash
pnpm install
```

### 3. Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

### 4. Run Development Servers
Run the full monorepo concurrently with Turborepo:
```bash
pnpm dev
```
Or run individually:
- **Website (Next.js)**: `cd website && pnpm dev` (http://localhost:3000)
- **Backend (NestJS)**: `cd backend && pnpm dev` (http://localhost:3001/api)
- **Mobile (Expo iOS/Android)**: `cd mobile && pnpm dev`
