# 001 Foundation: plan

**Spec:** ./spec.md
**Status:** Approved

## Approach

**Workspace.** pnpm workspaces: `@ds/web`, `@ds/server`, `@ds/shared`. Root `tsconfig.base.json` (strict, `noUncheckedIndexedAccess`), one `biome.json`, Vitest projects (`shared`, `server-unit`, `server-int`, `web`). Node 24 pinned with `engines` and `.nvmrc`. Root scripts match the CLAUDE.md command list. `pnpm dev` runs `docker compose -f compose.dev.yml up -d --wait` and then `pnpm -r --parallel dev`, which starts web (Vite), api (`tsx watch src/api.ts`) and worker (`tsx watch src/worker.ts`).

**Shared (`packages/shared/src`).**
- `settings.ts`: `dailyTargetMinutesSchema` (int, 10–240, `multipleOf(5)`, Spanish messages) and `updateSettingsSchema`.
- `me.ts`, `health.ts`: response schemas.
- `constants.ts`: defaults (timezone, target 30, lesson weekday 4, reminder times) and topic categories.

Shipped as TS source. Server consumes it via a tsup bundle, web via Vite.

**Server (`apps/server/src`).**
- **Entries:** `api.ts`, `worker.ts`, `migrate.ts`. Each one first calls `loadConfig(schema)`.
- **`config.ts`:** one Zod schema per process: api needs DB, auth, R2 and `APP_URL`; worker needs DB and R2; migrate needs DB only. On failure it prints `Config inválida: FALTA/INVÁLIDO <VAR>` lines to stderr and calls `process.exit(1)`, with no stack trace.
- **`logger.ts`:** pino, redacting `req.headers.cookie`, `authorization`, `*.password`, `*.secret` and `*.token`.
- **`clock.ts`:** `Clock { now(): Date }`, injected everywhere time matters.
- **`app.ts`:** `createApp({ db, auth, clock, config })` returns the Hono app with chained routes and exports `type AppType` for `hc`. Middleware: `secureHeaders` with a CSP allowing self plus `avatars.githubusercontent.com` for images, then the pino request logger (ids, durations).
  - Mounted at `/api/auth/*`: Better Auth handler.
  - Every other `/api/*` route except `/api/health` sits behind `requireSession`.
  - In production, `serveStatic` serves `apps/web/dist` with SPA fallback. Cache headers: hashed assets `immutable`; `index.html`, `sw.js` and `manifest.webmanifest` `no-cache`.
- **`auth/auth.ts`:** Better Auth configuration.
  - Core: GitHub provider, Drizzle adapter (pg), `basePath /api/auth`, `baseURL = APP_URL`, `trustedOrigins [APP_URL]`, `advanced.database.generateId: uuidv7`.
  - Sessions: `expiresIn` 90 days, `updateAge` 1 day.
  - `user.additionalFields.githubId` (string, `input: false`), filled by `mapProfileToUser(profile) → { githubId: String(profile.id) }`.
  - Hooks:
    - `databaseHooks.user.create.before`: rejects when `githubId` isn't in `ALLOWED_GITHUB_IDS`, so no user row is written.
    - `user.create.after`: inserts `user_settings` with domain defaults (`DEFAULT_TIMEZONE`).
    - `session.create.before`: checks the allowlist again, so an id removed from it can't sign in.
  - Redirects: Better Auth sends every OAuth error to the client's `errorCallbackURL` (`/login`) as `?error=<code>`. The allowlist rejection uses code `not_allowlisted`, and `/login` forwards that code to `/access-denied`; other codes show a generic error on `/login`.
  - `githubId` has to be writable at sign-up (Better Auth drops `input: false` fields from the provider profile), so `user.update.before` rejects any update that includes it. Hook results are merged, not replaced, so the field can't simply be stripped.
  - `requireSession` also rechecks the allowlist on every request.
- **`auth/middleware.ts`:** `requireSession`, which calls `auth.api.getSession`, returns 401 `{ error: "unauthorized" }` without a session, and sets `c.var.user`.
- **`routes/health.ts`:** `{ status, db, worker }`.
  - `db` is checked with `select 1`.
  - `worker` is `ok` when `beat_at` is less than 3 minutes old, and `stale` when it's older or missing.
  - DB down → 503 `{ status: "error", db: "error", worker: "stale" }`. Stale worker → still 200.
- **`routes/me.ts`:** `GET /api/me`. **`routes/settings.ts`:** `PATCH /api/settings`.
- **`db/client.ts`:** a `pg` Pool (api max 5, worker max 3) plus drizzle. Schema in `db/schema/{auth,settings,system}.ts`.
- **`storage/r2.ts`:** S3Client (`region: auto`, R2 endpoint, `requestChecksumCalculation: "WHEN_REQUIRED"`), plus `presignPut`, `presignGet` (5 min), `head`, `del`, `list(prefix)` and `uploadStream` (lib-storage `Upload`, `queueSize: 1`, 5 MB parts). Key helpers: `backupKey(date)` now, and lesson file keys for 002.
- **`jobs/boss.ts`:** pg-boss with `max: 3`, `schema: pgboss`. Creates the queues `system.heartbeat` and `system.backup`.
- **`jobs/heartbeat.ts`:** scheduled `* * * * *`, upserts `worker_heartbeat (id=1, beat_at=now)`.
- **`jobs/backup.ts`:** scheduled `30 3 * * *` with `tz: America/Lima`, `retryLimit 3`, `retryBackoff true`.
  1. Inserts `backup_runs (running)`.
  2. Spawns `pg_dump -Fc` with connection data passed as `PG*` environment variables, never in argv.
  3. Pipes stdout into `uploadStream` at `db-backups/guitartracker-<Lima date>.dump`.
  4. Marks the row `succeeded` (with size) or `failed`.
  5. Lists `db-backups/` and deletes keys whose date is more than 30 days before the Lima date.

  Retry attempts log at warn level. The final failure logs at error level with run id and error code only. The `pg_dump` spawner and the storage client are injected, so tests can fake them.
- **`worker.ts`:** starts boss, registers the handlers and schedules, and handles SIGTERM with `boss.stop({ graceful })`.
- **`migrate.ts`:** drizzle `migrate()` (node-postgres migrator) against `apps/server/drizzle`.
- **`i18n/es.ts`:** stub for server-generated text, unused until 004.

**Web (`apps/web/src`).**
- **Stack:** Vite, React, Tailwind v4 (`@tailwindcss/vite`), shadcn/ui, TanStack Router (file-based plugin), TanStack Query.
- **Clients:** `lib/api.ts` = `hc<AppType>("/")` (type-only import from `@ds/server`). `lib/auth-client.ts` = Better Auth `createAuthClient` (`signIn.social`, `signOut`).
- **Routes:**
  - `__root`, plus `index` (redirects to `/today`), `login`, `access-denied`.
  - Pathless `_app` layout: `beforeLoad` fetches `/api/me` via Query. A 401 redirects to `/login`.
  - Children: `today`, `lessons`, `topics`, `history`, `settings`.
  - Paths are in English (code). Everything visible, including nav labels (Hoy, Clases, Temas, Historial, Ajustes), stays Spanish from `es.ts`.
  - A not-found route goes through the same guard.
- **Shell:**
  - `components/app-shell.tsx` with a `BottomNav` (`lg:hidden`, safe-area bottom padding, 44 px+ targets) and a `Sidebar` (`hidden lg:flex`).
  - Theme follows `prefers-color-scheme` via CSS variables. There's one accent token; proposed is a saturated orange, tuned for AA contrast in both themes.
  - Base font size is 16 px.
- **Strings:** all UI copy lives in `i18n/es.ts`.

**PWA.**
- `vite-plugin-pwa` with `registerType: "prompt"`, `workbox.globPatterns` for the app shell only, and `navigateFallbackDenylist: [/^\/api/]` (keeps the OAuth callback away from the SW).
- No runtime caching for `/api`. `useRegisterSW` drives a sonner toast: "Nueva versión disponible · Actualizar".
- Manifest: name and short_name "Daily Shed", `display: standalone`, `start_url: /today`, `lang: es-PE`, icons.
- Icons come from one original `public/icon.svg` via `@vite-pwa/assets-generator`.
- `index.html`: `apple-touch-icon`, `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style=default`, two `theme-color` metas (light and dark media), and `viewport-fit=cover`.

**Deploy.**
- **Dockerfile** (multi-stage):
  - `deps`: `pnpm fetch`.
  - `build`: `pnpm install --offline`, then build shared, web and server. The server is built with tsup (`noExternal @ds/shared`).
  - `runtime`: `node:24-alpine` + `postgresql16-client`, created with `pnpm deploy --prod` for the server. It contains `dist/`, the `drizzle/` migrations and `apps/web/dist`, and runs as non-root `node`.
- **`deploy/compose.prod.yml`:** the architecture sketch, finalized. `IMAGE_TAG` comes from `.env` (commit SHA), and `NODE_ENV`, `LOG_LEVEL` and `DEFAULT_TIMEZONE` are set there too. `db` has no published ports and stays off `edge`.
- **`.github/workflows/ci.yml`:** runs on `pull_request`, `push` and `workflow_call`. Steps: lint, typecheck, test with a `postgres:16-alpine` service and `postgresql-client-16`. No secrets.
- **`.github/workflows/deploy.yml`:** runs on `push: main` and `workflow_dispatch`, with `concurrency: deploy`. Jobs:
  1. `test` uses ci.yml.
  2. `build` needs `test`, has `packages: write`, uses buildx with GHA cache, and tags the SHA and `latest`.
  3. `deploy` needs `build` and has `packages: read`. Over ssh with a pinned `known_hosts` (`VPS_KNOWN_HOSTS`) it:
     1. copies the compose file;
     2. writes `.env` (chmod 600) from secrets, with `DATABASE_URL` built from `POSTGRES_PASSWORD` and `IMAGE_TAG=${{ github.sha }}`;
     3. logs in to GHCR with `GITHUB_TOKEN`, runs `pull`, then `docker logout ghcr.io`;
     4. runs `up -d --wait db`, then `run --rm api node apps/server/dist/migrate.js`, then `up -d`;
     5. curls `$APP_URL/api/health`, expecting 200, for up to 10 tries at 6 s intervals.

  No `pull_request_target` anywhere, and no third-party SSH action.

## Schema changes

Migration `0000_foundation`:

- **Better Auth tables** (`user`, `session`, `account`, `verification`) with `uuid` ids. `user.github_id text unique not null`.
- **`user_settings`:**

  | Column | Type | Default / notes |
  |---|---|---|
  | `user_id` | uuid | PK, FK → `user` on delete cascade |
  | `timezone` | text | `'America/Lima'` |
  | `daily_target_minutes` | smallint | 30, CHECK 10–240 and %5 = 0 |
  | `lesson_weekday` | smallint | 4, CHECK 1–7 |
  | `reminder_times` | text[] | `{11:00,16:00,18:00}` |
  | `telegram_chat_id` | bigint | null |
  | `created_at`, `updated_at` | timestamptz | |

  All five domain columns are created now, because AC-2 says "defaults from domain.md".
- **`worker_heartbeat`:** `id smallint PK CHECK (id = 1)`, `beat_at timestamptz`. System table (D-15).
- **`backup_runs`:** `id uuid` (v7), `started_at`, `finished_at`, `status` (`running|succeeded|failed`), `r2_key`, `size_bytes bigint`, `error text`. Index on `(status, finished_at desc)`. System table (D-15).
- pg-boss creates the `pgboss` schema itself.

## API changes

- `GET /api/health` (public) → `healthResponseSchema`, 200 or 503.
- `GET /api/me` (session) → `{ user: { id, name, image }, settings: { timezone, dailyTargetMinutes, lessonWeekday }, lastBackupAt: string | null }`.
- `PATCH /api/settings` (session), validated with `updateSettingsSchema` → `{ settings }`. Validation errors return 400 with the Zod issues.
- `/api/auth/*`: Better Auth.

## UI changes

- **`/login`:** app name, a one-line description, and a "Entrar con GitHub" button (shadcn Button). If already signed in, it redirects to `/today`.
- **`/access-denied`:** Spanish explanation and "Volver".
- **`/today`:** empty state "Aquí verás tu práctica de hoy". `/lessons`, `/topics`, `/history`: placeholders.
- **`/settings`** (Ajustes):
  - Account card (Avatar, name) and the timezone shown read-only.
  - Daily target form (React Hook Form + `zodResolver(dailyTargetMinutesSchema)`, Input type number step 5, Spanish errors).
  - Last backup ("Sin respaldos todavía" or the date and time in the user's timezone).
  - "Cerrar sesión".
- **shadcn components:** button, card, input, label, form, avatar, sonner.

## New dependencies

Only the ones `docs/architecture.md` doesn't already list.

| Package | Why |
|---|---|
| `pg` (+`@types/pg`) | Postgres driver for Drizzle; the same driver pg-boss uses, so there's one driver |
| `uuidv7` | App-generated UUIDv7 ids (PG16 has no `uuidv7()`) |
| `tsx` (dev) | Server hot reload in `pnpm dev` |
| `tsup` (dev) | Bundles server entries and inlines `@ds/shared` for the image |
| `yaml` (dev) | Config tests parse compose and workflow files (AC-9/11/12) |
| `msw` (dev) | Mocks GitHub OAuth endpoints for full sign-in flow tests (AC-2/3) |
| `@testing-library/react`, `@testing-library/user-event`, `jsdom` (dev) | Web component tests |
| `sonner` | Toast for the update prompt (shadcn's toast) |
| `lucide-react` | Nav icons (shadcn default icon set) |
| `@tanstack/router-plugin` (dev) | File-based route generation |
| `radix-ui`, `class-variance-authority`, `cn` | Pulled in by shadcn/ui components. `cn` is shadcn's own class-merge package (replaces clsx + tailwind-merge) |
| `shadcn`, `tw-animate-css` (dev) | CSS imported by the shadcn theme; build-time only |
| `workbox-window` | Required by vite-plugin-pwa's register module for the update prompt |
| `@testing-library/dom` (dev), `vite` (dev, root) | Peers of Testing Library and Vitest, declared because `autoInstallPeers` is off |

pnpm settings in `pnpm-workspace.yaml`: `autoInstallPeers: false`, `dedupePeerDependents: false` and `resolvePeersFromWorkspaceRoot: false`. Without them Better Auth's optional peers (vitest, react) pull the test toolchain into the server's production dependencies, which made the image 510 MB instead of 381 MB.

## Testing

| AC | Test |
|---|---|
| AC-1 | Web router test: no session → `/today`, `/settings` and an unknown route render `/login` with "Entrar con GitHub". |
| AC-2 | Integration test, full flow with msw: `/api/auth/sign-in/social` → callback → redirect `/today`, session cookie set, `user_settings` defaults. |
| AC-3 | Same flow with an id not on the allowlist: redirect `/access-denied`, 0 `user` rows, 0 sessions. Web test of the Spanish message. |
| AC-4 | Integration test: a session aged 89 days is valid and renews `expiresAt`; 91 days returns 401. Web test: "Cerrar sesión" calls signOut and lands on `/login`. |
| AC-5 | Iterates `app.routes`; every non-exempt `/api` route returns 401 without a cookie. |
| AC-6 | Component tests: both navs render 5 items with `es.ts` labels and the correct `lg:` classes. A static test walks the `.tsx` ASTs and fails on JSX text or user-facing attribute literals outside `i18n/es.ts`. Manual check at 390 px and desktop. |
| AC-7 | Config test on the exported PWA config and `index.html` metas (name, standalone, start_url, icons, apple-touch-icon, theme-color ×2, denylist `/api`). Manual check on iPhone. |
| AC-8 | Shared schema unit tests (9, 10, 33, 240, 245); integration `PATCH /api/settings` 200/400 and persistence; web form test shows the Spanish error. |
| AC-9 | Workflow config test: triggers are only push main and dispatch; `build` needs `test` and `deploy` needs `build`; tags SHA and latest; migrate runs before `up -d`; health curl has retries. Manual check after the first deploy. |
| AC-10 | Integration test: fresh beat → `ok`; 4 min old or missing → `stale`, still 200; DB down → 503. |
| AC-11 | Compose config test: `mem_limit`s, json-file logging 10m×3 on every service. Manual `docker stats` on the VPS. |
| AC-12 | Compose config test: only `api` is on `edge`, `db` has no `ports`. Manual check on the VPS. |
| AC-13 | Unit test with fake spawner and storage: key uses the Lima date, retention deletes only keys older than 30 days, schedule `30 3 * * *` with tz `America/Lima` and retry options. Integration test runs real `pg_dump` into in-memory storage (required in CI). |
| AC-14 | Integration `/api/me` `lastBackupAt` is null, then set from the latest succeeded run (ignoring failed ones). Web test: "Sin respaldos todavía". Log test: a failing backup logs at error level, and the captured output contains no `DATABASE_URL`, password or R2 secret. |
| AC-15 | Spawns the built `api`, `worker` and `migrate` with a missing or invalid variable: exit 1, stderr names the variable, no `at ` stack lines. |

Integration tests use `TEST_DATABASE_URL`: locally the `guitartracker_test` database in the `compose.dev.yml` Postgres (port 5433), in CI the service container. Global setup creates the database and migrates. Tests truncate between files. The session helper uses Better Auth's internal adapter to create a session and sign the cookie.

## Risks and mitigations

- **Better Auth turns a hook rejection into a generic error or JSON instead of a redirect.** Verify early in T6. Fallback: an `hooks.after` on `/callback/:id` that rewrites the redirect to `/access-denied`.
- **iOS status bar can't follow the system theme** with `default` plus `theme-color`. Verify on device in T15. Fallback: `black-translucent` with a themed safe-area header strip.
- **SW navigation fallback hijacking the OAuth callback** would break login. Denylist `/api` and test it.
- **Connection pool exhaustion** (`max_connections` 20). Pools capped at api 5, worker 3, pg-boss 3, migrate 1.
- **AWS SDK checksum headers break R2.** Use `requestChecksumCalculation: "WHEN_REQUIRED"` and test presigned PUT headers.
- **`pg_dump` version mismatch** in CI or the image. Pin `postgresql16-client` in the image and `postgresql-client-16` in CI.
- **Special characters in `POSTGRES_PASSWORD`** break `DATABASE_URL`. The workflow URL-encodes the password; setup docs say to generate it as hex.
- **Hono RPC type inference across workspaces.** Use chained routes, `import type` only, and `@ds/server` as a web devDependency.
- **Memory.** Node heap flags from `architecture.md`. Backup streams with a single 5 MB part in flight.
- **First deploy before infra-vps/001.** AC-9 to AC-12 can't be verified on the VPS until it's done. Local `docker compose` with a dummy `edge` network covers the build in the meantime.

## Deviations from the spec

Carlos approved these on 2026-09-30.

1. A new `backup_runs` table, because the spec's Data section omits where the last backup is stored.
2. `worker_heartbeat` and `backup_runs` are system tables with no `user_id` and non-UUIDv7 singleton ids where it fits. Recorded as D-15.
3. A new secret, `VPS_KNOWN_HOSTS`, plus a manual setup item, so deploy pins the VPS host key.
4. A `user.github_id` column on Better Auth's user table, for the allowlist check and per-session recheck.
5. `/api/health` returns 503 when the DB is down; the spec defines only the healthy shape.
6. The deploy job's token gets `packages: read`; only `build` has `packages: write`.
7. A `ci.yml` that also runs on `pull_request`, with tests only and no secrets. Deploy still runs only on push to `main` and manual dispatch.
8. Route paths are in English: `/login`, `/access-denied`, `/today`, `/lessons`, `/topics`, `/history`, `/settings`. They replace the spec's `/entrar`, `/acceso-denegado`, `/hoy`, `/clases`, `/temas`, `/historial`, `/ajustes`. UI labels stay Spanish. Recorded as D-16 and applied to the spec text of 001–003; 003's `/practicar/:id` becomes `/practice/:id`.
9. Visual and ops ACs (6, 7, 9, 11, 12) are covered by config tests named after the AC plus the manual checklist in T19. Playwright still waits until after 003.
