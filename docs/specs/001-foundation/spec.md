# 001 Foundation

**Status:** In progress
**Depends on:** nothing to build locally. The production deploy (AC-9 to AC-12) needs `infra-vps/001-shared-edge`.

## Why

Everything later needs a working skeleton: monorepo, database, login, the app shell installed on the iPhone, a worker for background jobs, backups, and a deploy pipeline. This spec delivers an app that does nothing useful yet but is fully deployed, secured and backed up.

## Scope

**In:**
- **Monorepo:** pnpm workspaces (`apps/web`, `apps/server`, `packages/shared`), TypeScript strict, Biome, Vitest.
- **Server:** API entry (`api.ts`), worker entry (`worker.ts`), migrate entry (`migrate.ts`), config validated with Zod, pino logger, `/api/health`.
- **Database:** Drizzle schema with Better Auth's tables plus `user_settings` and `worker_heartbeat`; drizzle-kit migrations.
- **Auth:** Better Auth with GitHub, the `ALLOWED_GITHUB_IDS` allowlist, 90-day rolling sessions, logout.
- **Web shell:**
  - routes `/today`, `/lessons`, `/topics`, `/history`, `/settings` (placeholders except Ajustes)
  - responsive navigation, dark theme only (D-17)
  - Spanish strings file
- **PWA:** manifest, icons, service worker for the app shell, iOS home-screen support.
- **Ajustes (Settings) page:** account (GitHub name and avatar), timezone (read-only), editable daily target, last successful backup, sign out.
- **R2 module:** client and presign helpers, used from 002 on.
- **Worker:** pg-boss setup, a heartbeat every minute, and the nightly backup job.
- **Deploy:** Dockerfile, `compose.dev.yml` (Postgres only), `deploy/compose.prod.yml`, GitHub Actions CI and deploy.

**Out:** lessons, topics, files UI, sessions, Telegram, LLM.

## User stories

- As Carlos, I want to open `ds.<domain>` on my iPhone, sign in with GitHub and add it to my home screen, so it behaves like an app.
- As Carlos, I want nobody else to be able to sign in, even with a GitHub account.
- As Carlos, I want every push to `main` to deploy automatically once the tests pass.
- As Carlos, I want nightly database backups in R2 without thinking about them.

## Acceptance criteria

**Auth**
- **AC-1** Given I'm signed out, when I open any app route, then I'm sent to `/login`, which shows "Entrar con GitHub".
- **AC-2** Given my GitHub numeric id is in `ALLOWED_GITHUB_IDS`, when I complete the GitHub flow, then I land on `/today` signed in, and a `user_settings` row exists with the defaults from `docs/domain.md`.
- **AC-3** Given a GitHub account whose id isn't in the allowlist, when it completes the GitHub flow, then it sees `/access-denied` with a Spanish message, no session is created, and no `user` row remains.
- **AC-4** Given I'm signed in and inactive for up to 90 days, when I reopen the app, then I'm still signed in. "Cerrar sesión" in Ajustes signs me out.
- **AC-5** Every `/api` route except `/api/health` and `/api/auth/*` returns 401 without a valid session.

**App shell and PWA**
- **AC-6** At widths under 1024 px the app shows a bottom navigation bar (Hoy, Clases, Temas, Historial, Ajustes). At 1024 px and above it shows a sidebar. Every visible string comes from `apps/web/src/i18n/es.ts`.
- **AC-7** Given Safari on iPhone, when I use Share → Add to Home Screen, then the app opens full-screen with the name "Daily Shed" and its icon, and the status bar is dark to match the app (D-17).
- **AC-8** In Ajustes I can change the daily target (10–240 minutes, in steps of 5). It persists, and invalid values show a Spanish validation message.

**Deploy and operations**
- **AC-9** Given a push to `main`:
  - when lint, typecheck or tests fail, nothing is deployed.
  - when they pass, the image is pushed to GHCR (tags: SHA and `latest`), deployed to `/srv/guitar-tracker`, migrations run, and the workflow finishes only after `https://ds.<domain>/api/health` returns 200.
- **AC-10** `/api/health` returns `{ status: "ok", db: "ok", worker: "ok" | "stale" }`. `worker` is `stale` when the last heartbeat is older than 3 minutes.
- **AC-11** On the VPS, `docker stats` shows the limits api 256 MiB, worker 384 MiB and db 256 MiB, and every container uses json-file logging with `max-size` 10m and `max-file` 3.
- **AC-12** Only `api` is attached to the `edge` network. `db` isn't reachable from other compose projects.

**Backups**
- **AC-13** At 03:30 `America/Lima` every night, the worker uploads a `pg_dump -Fc` to R2 at `db-backups/guitartracker-YYYY-MM-DD.dump` and deletes backup objects older than 30 days.
- **AC-14** Ajustes shows the date and time of the last successful backup, or "Sin respaldos todavía". A failed backup is logged at error level with no secrets in the log.

**Config**
- **AC-15** When a required environment variable is missing or invalid, the api, worker and migrate processes exit on startup with a message naming the variable and no stack trace.

## UX notes

- **Visual direction:** calm and high-contrast, one accent colour, no gradients. It will be used on a music stand at arm's length, so base font size is 16 px and touch targets are at least 44 px.
- **Hoy placeholder:** a friendly empty state ("Aquí verás tu práctica de hoy") until 003.
- **Login page:** the app name, a one-line description in Spanish, and the GitHub button.
- **Icon:** an original, simple mark generated from one SVG with `@vite-pwa/assets-generator`. No third-party logos.
- **iOS specifics:** `apple-touch-icon`, a dark theme colour, and safe-area insets so the bottom navigation clears the home indicator.
- **Service worker:** precaches the app shell only. `/api` is always fetched from the network. When a new version is available, show a toast ("Nueva versión disponible · Actualizar").

## Data

- Better Auth tables (`user`, `session`, `account`, `verification`) through the Drizzle adapter. IDs are UUIDv7 through Better Auth's id generator option.
- `user_settings`: see `docs/domain.md`.
- `worker_heartbeat`: `id` (singleton), `beat_at`.
- pg-boss creates its own schema, `pgboss`.

## API sketch

- `GET /api/health`
- `GET /api/me`: user, plus settings and last backup time
- `PATCH /api/settings` `{ dailyTargetMinutes }`
- `/api/auth/*`: Better Auth

## Deployment details

- **Dockerfile:** multi-stage.
  1. Install dependencies with pnpm fetch/offline.
  2. Build web and server.
  3. Runtime on `node:24-alpine` with `postgresql16-client`, production dependencies only, running as a non-root user.
- **Workflow steps:**
  1. Test job with a `postgres:16-alpine` service.
  2. Build and push to GHCR.
  3. Deploy over SSH as `deploy`:
     - copy the compose file
     - write `.env` from secrets, building `DATABASE_URL` from `POSTGRES_PASSWORD`
     - log in to GHCR with the job's `GITHUB_TOKEN` before pulling. This does nothing extra while the image is public, and keeps deploys working if the repo is ever made private. The workflow needs `packages: write` permission.
     - `docker compose pull`, then `docker logout ghcr.io`, then `docker compose up -d db`
     - migrate with the new image: `docker compose run --rm api node apps/server/dist/migrate.js`
     - only then `docker compose up -d`
     - health check against `APP_URL` with retries
- **GitHub Secrets:** `VPS_HOST`, `VPS_SSH_KEY`, `VPS_KNOWN_HOSTS`, `APP_URL`, `POSTGRES_PASSWORD`, `BETTER_AUTH_SECRET`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `ALLOWED_GITHUB_IDS`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`.
- **Local development:**
  - `compose.dev.yml` runs Postgres 16 on port 5433, so it doesn't clash with other local databases.
  - Vite runs on 5173 and proxies `/api` to the server on 3000.
  - Better Auth's base URL is `http://localhost:5173` in development.

## Manual setup (Carlos)

- [ ] GitHub repo `carlosz44/guitar-tracker`
- [ ] A dedicated CI key for this repo (`ssh-keygen -t ed25519 -C "gha-guitar-tracker" -f ~/.ssh/gha_guitar_tracker -N ""`). Add the public key to `deploy`'s `authorized_keys` and put the private key in `VPS_SSH_KEY`.
- [ ] Two GitHub OAuth apps:
  - production, with callback `https://ds.<domain>/api/auth/callback/github`
  - development, with callback `http://localhost:5173/api/auth/callback/github`
- [ ] Your numeric GitHub id (the `id` field at `https://api.github.com/users/carlosz44`)
- [ ] R2 bucket `guitar-tracker`, an API token scoped to it, and CORS allowing `GET` and `PUT` from the production and localhost origins
- [ ] DNS `ds.<domain>` → VPS
- [ ] The VPS host key for `VPS_KNOWN_HOSTS`: on the VPS run `ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub` to see its fingerprint, then from your laptop run `ssh-keyscan -t ed25519 <vps-host>`, check the fingerprint matches, and store that line as the secret
- [ ] The repo variable `IMAGE_PLATFORM` if the VPS isn't x86-64 (for example `linux/arm64`); it defaults to `linux/amd64`
- [ ] GitHub Secrets listed above

## Edge cases

- **Private GitHub email:** the allowlist is by id, so email doesn't matter. Store whatever GitHub returns.
- **Worker down when the backup time passes:** pg-boss runs missed schedules when it next starts, or the next night's run covers it. Either is acceptable, as long as the health check shows `worker: stale`.
- **R2 unreachable during a backup:** the job fails and pg-boss retries it 3 times with backoff before logging at error level.
- **Migrations fail on deploy:** the workflow fails and the old containers keep running. Migrations must be backward compatible with the previous image, which means expand-then-contract.

## Open questions

- None. Change a decision in `docs/decisions.md` first if any of this should change.
