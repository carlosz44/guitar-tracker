# Daily Shed (repo: guitar-tracker)

A personal guitar practice app for one user (Carlos). It logs the weekly guitar lesson and the teacher's files, turns lessons into practice topics, plans and times daily practice, sends Telegram reminders, and uses Claude to draft lesson notes and weekly plans.

Adds to `~/Dev/CLAUDE.md` and never contradicts it.

Before any work, read `guitar-tracker-product.md`, `guitar-tracker-domain.md`, `guitar-tracker-architecture.md` and `guitar-tracker-decisions.md` in `~/Dev/dev-workspace/projects/guitar-tracker/`, and the spec you're working on in `~/Dev/private-docs/guitar-tracker/<NNN-slug>/`. The roadmap is `~/Dev/private-docs/guitar-tracker/roadmap.md`. None of these live in this repo.

## How we work (spec-driven)

Features follow the workspace flow in `~/Dev/CLAUDE.md`: `/to-spec`, `/to-plan`, `/implement`, then `/spec-review`, `/code-review` and `/close-feature`. On top of it:

1. Every acceptance criterion (`AC-n`) gets at least one test that names it, for example `it('AC-3: rejects GitHub accounts outside the allowlist')`.
2. A spec's UX section covers the laptop first. The phone is a nice-to-have (D-22). A plan names the Drizzle migration, the request and response schemas from `packages/shared`, and the shadcn/ui components it uses.
3. When a spec is finished, set its `status` to `done` and update the roadmap.

If a spec conflicts with `guitar-tracker-decisions.md` or looks wrong, stop and ask instead of quietly deviating. New decisions get a new D-NN entry there.

## Commands

Setup: Node 24 (`nvm use`), pnpm via corepack (`corepack enable`), Docker running. Copy `.env.example` to `apps/server/.env` and fill in the dev GitHub OAuth app.

- `pnpm dev`: Postgres in Docker (port 5433), pending migrations, then api (3000), worker and Vite (5173) with hot reload
- `pnpm test`, `pnpm test:watch`. Integration tests need the dev Postgres and recreate `guitartracker_test`
- `pnpm e2e`: builds the web app, then runs Playwright against a fresh `guitartracker_e2e` database on port 3100. Needs the dev Postgres. Install Chromium once with `pnpm --filter @ds/e2e exec playwright install chromium`
- `pnpm lint`, `pnpm format` (Biome)
- `pnpm typecheck`
- `pnpm build`: web (Vite) and server (tsup)
- `pnpm db:generate` (drizzle-kit, after schema changes), `pnpm db:migrate`
- `pnpm backup:now`: one backup to R2 right away. Needs real `R2_*` values and a local `pg_dump` ≥ 16 (`brew install libpq`)
- `pnpm --filter @ds/web icons`: regenerate PWA icons after changing `apps/web/public/icon.svg`

## Conventions

- **Language.** Code, identifiers, commits, docs and specs are in English. Every string the user sees is in Spanish (es-PE): web strings live in `apps/web/src/i18n/es.ts`, Telegram and server-generated text in `apps/server/src/i18n/es.ts`. No i18n library.
- **Time.** Store instants as `timestamptz` in UTC. Anything about "a day" (today's minutes, streaks, reminders, plan days) is computed in the user's timezone (`America/Lima`) with `@date-fns/tz`. Calendar dates such as a lesson date or a plan day are `date` columns.
- **IDs.** UUIDv7, generated in the app.
- **Validation.** Zod schemas live in `packages/shared`. Forms, API validators and LLM output parsing all use the same schemas.
- **API.** Hono routes under `/api`, called from the web through the typed Hono RPC client (`hc`). No hand-written fetch wrappers.
- **Ownership.** Every table with user data has `user_id`, even though there's one user, and every query filters by it. System tables (`worker_heartbeat`, `backup_runs`) are the exception (D-15).
- **Migrations.** Only through drizzle-kit. Never edit a migration that has already been deployed.
- **Dependencies.** List any new dependency in the plan with a one-line reason. Prefer what `guitar-tracker-architecture.md` already lists.

## Guardrails

- The memory budget is real. Container limits are api 256 MiB, worker 384 MiB, db 256 MiB. Stream files instead of loading them whole where possible. Parse untrusted files in a worker thread with `resourceLimits` and a timeout.
- Never log secrets, tokens, file contents or full LLM prompts. Log ids, sizes and durations.
- Never commit `.env` files. Production config comes from GitHub Secrets.
- **This repo is public.** No real domains, IPs, GitHub ids or keys in code, docs or tests. Use `<domain>`-style placeholders. Deploy workflows run only on push to `main` or manual dispatch, never on `pull_request_target`.
- LLM output is always a draft that Carlos accepts. Nothing the model writes is saved as final automatically.
- Don't build anything `guitar-tracker-product.md` lists as a non-goal.

## Definition of done

- `pnpm test`, `pnpm typecheck` and `pnpm lint` pass.
- Every AC in the spec has a test.
- The UI has been checked at iPhone width (390 px) and on desktop.
- The UI shows only Spanish strings.
- `tasks.md` is ticked and the roadmap is updated.
