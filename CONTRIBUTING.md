# Contributing & Local Development

Start with the architecture: [docs/00-blueprint.md](docs/00-blueprint.md) and [docs/04-system-architecture.md](docs/04-system-architecture.md).

## Prerequisites

- **Node.js 24 LTS** (`nvm use` reads `.nvmrc`)
- **PostgreSQL 16+** running locally, with the `btree_gist`, `pg_trgm`, `citext` and `pgcrypto` extensions available (included in standard distributions)
- npm 11+ (ships with Node 24)

## Setup

```bash
nvm use
npm ci
cp .env.example .env.local
# Edit .env.local: set DATABASE_URL / DATABASE_MIGRATOR_URL / TEST_DATABASE_ADMIN_URL for your Postgres user,
# and generate JOB_TICK_SECRET and OPS_SECRET:
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"

npm run db:setup      # create database, apply migrations, seed reference data (idempotent)
npm run dev           # http://localhost:3000
```

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` / `build` / `start` | Next.js development server, production build, production server |
| `npm run lint` · `npm run typecheck` · `npm run format` | ESLint (zero warnings), TypeScript, Prettier |
| `npm test` | Unit + architecture tests (no database) |
| `npm run test:integration` | Integration tests; creates throwaway databases from a migrated template via `TEST_DATABASE_ADMIN_URL` |
| `npm run test:e2e` | Playwright against a production build (run `npm run build` first; `npx playwright install chromium` once) |
| `npm run db:generate` | Generate a SQL migration from Drizzle table changes (review the SQL before committing) |
| `npm run db:generate:custom -- --name=<name>` | Empty migration for hand-written SQL (functions, triggers, constraints Drizzle can't express) |
| `npm run db:migrate` · `npm run db:seed` | Apply migrations · insert missing reference data |
| `npm run jobs:tick` | Run one background-job tick locally (the deployed app uses `POST /api/internal/jobs/tick`) |

## Project structure

```
src/app/                  Next.js routes: pages and thin API adapters only
src/server/platform/      Cross-cutting primitives: db, errors, authz, audit, outbox, idempotency, rate limits, settings, http pipeline
src/server/modules/<m>/   Business modules: domain/ (pure) · application/ · infra/ · http/ · index.ts
src/ui/                   Design-system components
src/config/               brand.ts (the only place the product name lives) and env.ts (validated config)
drizzle/                  Reviewed SQL migrations (forward-only)
tests/                    unit/, integration/, architecture/, e2e/, helpers/
docs/                     Product, architecture, security and compliance documentation
```

## Engineering rules

These are enforced by `tests/architecture` and lint where possible:

- **Authorization happens in application services** via `authorize()` for every action. Never rely on `proxy.ts`, the UI or route wrappers alone.
- **Mutations go through REST route handlers** built with `defineRoute`. No Server Actions (ADR-019).
- **Domain code is pure**: no Next.js, database or logger imports; time comes from a `Clock`.
- **Modules import each other only through `index.ts`.**
- **Client components never import `@/server/*` or `@/config/env`.**
- **Money** is integer minor units + currency. **Time** is UTC instants + IANA time zones, never manual offsets.
- **Raw SQL timestamps** are passed as `${date.toISOString()}::timestamptz` (the driver's Date serialization is disabled).
- **Business rules are configurable** through the settings registry, not magic numbers.
- **Every sensitive action writes an audit record** in the same transaction.
- **No new dependency** without a short justification in the PR. Dependency install scripts are denied by default (`allowScripts` in `package.json`).
- **Never commit secrets.** `.env*` files are git-ignored except `.env.example`.

## Definition of done

See [docs/13-testing-strategy.md §12](docs/13-testing-strategy.md#12-definition-of-done-per-feature).

## Commits

Small, focused commits with imperative messages. CI must be green before merging to `main`.
