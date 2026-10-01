# 001 Foundation: tasks

Small, ordered tasks. Each one ends with passing tests and can be committed on its own.

- [x] T1 Workspace scaffold: pnpm workspace, tsconfig base, Biome, Vitest projects, `.gitignore`, `.nvmrc`, `.env.example`, `compose.dev.yml` (PG16 on 5433), root scripts. A sanity test passes; `pnpm lint`, `pnpm typecheck` and `pnpm test` are green.
- [x] T2 `@ds/shared`: constants, settings, me and health schemas. (covers AC-8 schema)
- [x] T3 Server config loader per process, pino logger with redaction, Clock. (covers AC-15)
- [x] T4 Drizzle schema, `0000_foundation` migration, `migrate.ts`, DB client, test-DB global setup. Test: migration applies and the CHECK constraints hold.
- [x] T5 `createApp`, secureHeaders, `/api/health`, static serving with SPA fallback and cache headers. (covers AC-10)
- [x] T6 Better Auth: GitHub provider, allowlist hooks, settings creation, 90-day sessions, `requireSession`, test session helper, msw GitHub mock. (covers AC-2, AC-3, AC-4, AC-5)
- [x] T7 `GET /api/me`, `PATCH /api/settings`. (covers AC-8 API, AC-14 API)
- [x] T8 R2 module: client, presign PUT/GET, head, delete, list, uploadStream, key helpers. Unit tests.
- [x] T9 Worker: pg-boss setup, queues, heartbeat schedule, graceful shutdown. Integration test: heartbeat → health `ok`. (covers AC-10)
- [x] T10 Backup job: `pg_dump` stream to R2, `backup_runs`, 30-day retention, retries, 03:30 Lima schedule, safe error logging. (covers AC-13, AC-14 logging)
- [x] T11 Web scaffold: Vite, Tailwind v4 tokens (light, dark, accent), shadcn init, TanStack Router and Query, `hc` client, auth client, `es.ts`, Vite `/api` proxy. Static no-literal-strings test. (covers AC-6 strings)
- [x] T12 `/login`, `/access-denied`, `_app` guard, `/` → `/today`, not-found. (covers AC-1, AC-3 UI)
- [x] T13 App shell: bottom nav below 1024 px and sidebar from 1024 px, safe areas, placeholder routes with the Hoy empty state. (covers AC-6)
- [x] T14 `/settings` (Ajustes): account, timezone, daily target form, last backup, sign out. (covers AC-8 UI, AC-14 UI, AC-4 logout)
- [x] T15 PWA: `icon.svg`, assets generator, manifest, iOS metas, SW prompt toast, `/api` denylist. (covers AC-7 config)
- [x] T16 Dockerfile, `deploy/compose.prod.yml`. Compose config tests. Local `docker build` and a `compose up` smoke test with a dummy `edge` network. (covers AC-11, AC-12)
- [x] T17 `ci.yml` and `deploy.yml`. Workflow config tests. (covers AC-9)
- [x] T18 Docs:
  - D-15 (system tables) and D-16 (English route paths, Spanish labels) in `docs/decisions.md`.
  - Route paths in specs 001–003 updated to the English ones.
  - CLAUDE.md: confirmed commands, plus the system-table exception to Ownership.
  - `docs/architecture.md`: `VPS_KNOWN_HOSTS`, `backup_runs`, health 503.
  - README local setup.
  - Spec manual-setup list: `VPS_KNOWN_HOSTS`.
- [ ] T19 Manual verification after infra-vps/001 and the first deploy:
  - iPhone install and status bar (AC-7)
  - 390 px and desktop check (AC-6)
  - a push with a failing test deploys nothing (AC-9)
  - `docker stats` and logging (AC-11)
  - `docker network inspect edge` (AC-12)
  - first nightly backup in R2 and in Ajustes (AC-13, AC-14)

  Then set the spec status to Done and update `docs/specs/000-roadmap.md`.
