# Architecture

## Overview

```
iPhone (PWA) / laptop ──HTTPS──► Caddy (shared, /srv/edge) ──► api container
                                                                 │  Hono: /api + PWA static files
                                                                 ▼
Telegram ◄──long polling── worker container ──► Postgres 16 (own container)
                             │  pg-boss jobs, schedules,
                             │  file parsing, backups, bot
                             ├──► Cloudflare R2 (lesson files, DB backups)
                             └──► Claude API (from 005)
```

Everything runs on a 2 GB Ubuntu 24.04 VPS, shared with the baby tracker. Caddy, the host setup and the cutover live in the separate `infra-vps` repo. This repo owns only its own compose stack at `/srv/guitar-tracker`.

## Containers and memory

All three containers run from one image (`ghcr.io/carlosz44/guitar-tracker`). The api and worker use different start commands.

| Container | Role | Limit | Node heap |
|---|---|---|---|
| `api` | Hono HTTP server on port 3000. Serves `/api/*` and the built PWA with SPA fallback. Only this container joins the `edge` network (alias `guitar-tracker-api`). | 256 MiB | `--max-old-space-size=192` |
| `worker` | pg-boss consumer and scheduler, file extraction, backups, Telegram bot (from 004), LLM calls (from 005) | 384 MiB | `--max-old-space-size=160`, parser thread capped at 128 MB |
| `db` | `postgres:16-alpine` with `shared_buffers=64MB`, `max_connections=20`, `work_mem=4MB` | 256 MiB | — |

The VPS audit of 2026-09-30 found about 670 MiB in use and 1.25 GiB available, with a 2 GiB swapfile. The baby tracker's three containers use about 210 MiB. This stack should settle around 250 MiB in steady state. The limits are ceilings, so a runaway process gets OOM-killed instead of taking down the host.

## Repo layout

```
apps/
  web/        Vite + React PWA
  server/     Hono API (src/api.ts), worker (src/worker.ts), migrate (src/migrate.ts),
              db schema, jobs; migrations in drizzle/
packages/
  shared/     Zod schemas, shared types, constants (categories, statuses)
deploy/
  compose.prod.yml
.github/workflows/
  ci.yml        lint, typecheck, tests (pull requests, branches, and called by deploy)
  deploy.yml    push to main or manual: test → build → deploy
docs/
compose.dev.yml   Postgres for local development
Dockerfile
```

## Stack

| Area | Choice | Notes |
|---|---|---|
| Runtime | Node 24 LTS, TypeScript (strict) | |
| Workspace | pnpm workspaces | |
| Lint and format | Biome | |
| Tests | Vitest; Playwright smoke tests later | Integration tests hit a real Postgres |
| Web build | Vite | |
| UI | React, Tailwind CSS v4 (`@tailwindcss/vite`), shadcn/ui | |
| Routing and data | TanStack Router (file-based), TanStack Query | |
| Forms | React Hook Form + Zod resolver | |
| PWA | vite-plugin-pwa, icons from `@vite-pwa/assets-generator` | |
| Tab viewer | alphaTab (`@coderline/alphatab`) | Render only, no player. Use its Vite plugin for fonts and workers. |
| Dates | date-fns v4 + `@date-fns/tz` | |
| API | Hono, `@hono/node-server`, `@hono/zod-validator`, Hono RPC client | |
| Database | PostgreSQL 16, Drizzle ORM, drizzle-kit, `pg` | One driver for Drizzle and pg-boss. IDs from `uuidv7`. |
| Auth | Better Auth, GitHub provider, Drizzle adapter | |
| Jobs and schedules | pg-boss | Schedules use the `America/Lima` timezone |
| Files | Cloudflare R2 via `@aws-sdk/client-s3`, `s3-request-presigner`, `lib-storage` | |
| File parsing | alphaTab (Guitar Pro), mammoth (docx) | Runs in a worker thread |
| Logging | pino | JSON to stdout, rotated by Docker |
| Telegram (004) | grammY | Long polling from the worker |
| LLM (005) | `@anthropic-ai/sdk` | |
| Drag and drop (006) | dnd-kit | |
| Charts (008) | Recharts | |

## Key flows

**File upload (002)**
1. The web app asks the API for an upload URL, sending name, type and size. The API validates them, creates a `lesson_files` row with status `uploading`, and returns a presigned R2 PUT URL valid for 5 minutes.
2. The browser uploads straight to R2. The bytes never pass through the API.
3. The web app confirms the upload. The API checks the object exists with a HEAD request (and that the size matches), marks the row `uploaded`, and queues a `file.extract` job.
4. The worker streams the file from R2 and parses it in a worker thread with a 60-second timeout and a 128 MB heap cap. It saves `extracted_text` and `meta`, then sets `extraction_status` to `done` or `failed`. A malformed file kills the thread, not the worker.

**File viewing (002):** the API returns a presigned GET URL valid for 5 minutes. alphaTab renders Guitar Pro files in the browser; PDFs open in Safari's own viewer.

**Practice session (003):**
- The server creates the session at start.
- Each block change is sent as a PATCH with timestamps.
- Elapsed time is always computed from timestamps (`now − started_at − paused_seconds`), never counted up in memory. Locking the phone or reloading loses nothing.
- The active session id is also kept in `localStorage` so the app can resume it quickly.

**Reminders (004):** pg-boss schedules fire at each configured time in `America/Lima`. The worker checks today's minutes and sends a Telegram message only if the daily target hasn't been met and today wasn't skipped.

**LLM features (005, 006):**
1. The API queues a job.
2. The worker calls Claude and validates the output with the shared Zod schema.
3. The result is stored as an `llm_drafts` row, and the call is logged in `llm_runs`.
4. The web app polls for the draft and shows it for review. Only accepting it writes anything final.

## Configuration

Config is validated with a Zod schema at startup; missing or invalid variables stop the process with a clear error.

| Variable | Used by | Notes |
|---|---|---|
| `NODE_ENV`, `PORT` (3000), `LOG_LEVEL` | all | |
| `APP_URL` | api | `https://ds.<domain>`, or `http://localhost:5173` in development |
| `DATABASE_URL` | api, worker | Built by the deploy workflow from `POSTGRES_PASSWORD` |
| `BETTER_AUTH_SECRET`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | api | |
| `ALLOWED_GITHUB_IDS` | api | Comma-separated numeric GitHub user ids |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | api, worker | Bucket `guitar-tracker` |
| `DEFAULT_TIMEZONE` | api | `America/Lima`, used when creating `user_settings` |
| `TELEGRAM_BOT_TOKEN` | worker | from 004 |
| `ANTHROPIC_API_KEY`, `LLM_MODEL_DEFAULT`, `LLM_MODEL_FAST` | worker | from 005. Defaults: `claude-sonnet-5-5` and `claude-haiku-4-5-20251001` |

## R2 layout

Bucket `guitar-tracker`:
- `lesson-files/<lessonId>/<fileId>-<safe-name>`
- `db-backups/guitartracker-YYYY-MM-DD.dump`
- `telegram-inbox/<batchId>/<itemId>-<safe-name>` (007)

The bucket needs a CORS rule allowing `PUT` and `GET` from `https://ds.<domain>` and `http://localhost:5173`. Objects are never public. Access is only through presigned URLs.

## Security

- **Login:** GitHub only. The account's numeric GitHub id must be in `ALLOWED_GITHUB_IDS`; anyone else is rejected before a user row is created.
- **Sessions:** HTTP-only, secure cookie. Sessions last 90 days and renew with use.
- **API:** every `/api` route except `/api/health` and `/api/auth/*` requires a session.
- **Telegram (004):** the bot only acts on the linked chat id and ignores everything else.
- **Uploads:** checked against an allowlist of extensions and MIME types, with a 25 MB maximum. Content is checked again during extraction.
- **Headers:** Hono's `secureHeaders` middleware.

## Deployment

Pushing to `main` runs GitHub Actions:
1. Lint, typecheck and tests, against a Postgres service container.
2. Build the image and push it to GHCR, tagged with the commit SHA and `latest`.
3. SSH in as `deploy`, checking the host key against the `VPS_KNOWN_HOSTS` secret:
   - copy `deploy/compose.prod.yml` to `/srv/guitar-tracker/`
   - rewrite `.env` from GitHub Secrets
   - log in to GHCR with the job's `GITHUB_TOKEN` (works whether the image is public or private)
   - run `docker compose pull`, log out of GHCR, then run `docker compose up -d db`
   - run migrations with the new image: `docker compose run --rm api node apps/server/dist/migrate.js`
   - run `docker compose up -d`. If migrations fail, the old containers keep running.
   - check `/api/health`

The image is built for `linux/amd64` unless the repo variable `IMAGE_PLATFORM` says otherwise. This mirrors the baby tracker's workflow. It needs the `infra-vps` repo's shared `edge` network and Caddy to be in place first.

The stack is defined in `deploy/compose.prod.yml`: the three services above with their memory limits and heap flags, json-file logging (10 MB × 3), the `edge` network on the api only, and no published ports.

## Backups and restore

**Backups:** a pg-boss scheduled job in the worker runs every night at 03:30 `America/Lima`.
- It runs `pg_dump -Fc` and streams the output to R2 as `db-backups/guitartracker-YYYY-MM-DD.dump`, then deletes dumps older than 30 days.
- The image includes `postgresql16-client`, whose major version matches the server.
- Each attempt is recorded in `backup_runs`; Settings shows the last successful one.
- If the worker was down at 03:30, pg-boss runs one catch-up backup when it starts again.
- Failures are retried 3 times with backoff, then logged at error level. From 004 they are also sent to Telegram.

This keeps backups inside the app, so they move with it to the home server. The baby tracker keeps its own host cron.

**Manual backup** (for example before a risky migration):

```
docker compose -f /srv/guitar-tracker/compose.prod.yml run --rm worker node apps/server/dist/backup-now.js
```

**Restore:**

```
docker compose -f /srv/guitar-tracker/compose.prod.yml exec -T db \
  pg_restore -U guitartracker -d guitartracker --clean --if-exists < guitartracker-YYYY-MM-DD.dump
```

## Observability

- pino JSON logs go to stdout. Docker rotates them at 10 MB × 3 files.
- `/api/health` reports database connectivity and the worker's last heartbeat. The worker writes a heartbeat row every minute through a pg-boss schedule, so a fresh heartbeat also proves jobs are running. It answers 200 even when the worker is stale, and 503 when the database is unreachable.
- The Settings page shows the last successful backup and, from 005, LLM spend this month.

## Testing

- **Unit tests:** pure domain rules such as day boundaries, streaks, block suggestions, reminder decisions and planner scoring. Time is injected, never read directly.
- **Integration tests:** API routes against a real Postgres (the CI service container locally, or `compose.dev.yml`), with auth stubbed by a test session helper.
- **End to end:** Playwright smoke tests for login and a practice session, added once 003 is done.

## Moving to the home server later

The same compose file works there:
1. Point DNS, or a Cloudflare Tunnel, at the new host.
2. Restore the latest dump.
3. Keep R2, or later switch file storage to an S3-compatible service on the NAS by changing the R2 variables.
