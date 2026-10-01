# Decisions

Short records of choices already made, so they don't get re-argued. Add a new entry when a decision changes, and mark the old one as superseded rather than editing it.

---

## D-01 Host on the existing VPS with Docker Compose
*2026-09-30*

**Decision:** Run on the existing 2 GB VPS next to the baby tracker, with Docker Compose, images on GHCR, and deploys over SSH from GitHub Actions.

**Why:**
- The VPS is already paid for, and the baby tracker has already proven the Docker, CI and backup pattern there.
- The 2026-09-30 audit showed about 1.25 GiB available.
- There's no per-request CPU limit, so Guitar Pro and Word files can be parsed on the server, and background jobs and schedules run natively.

**Instead of:** Cloudflare Workers free tier with Neon and Queues. Its 10 ms CPU limit per request rules out parsing files on the server, which the Telegram inbox (007) needs.

**Revisit if:** memory gets tight, or the home server is ready.

## D-02 TypeScript end to end

**Decision:** TypeScript for both web and server.

**Why:**
- alphaTab is the only mature parser for Guitar Pro 7/8 `.gp` files, and it's a JavaScript library. PyGuitarPro only reads GP3–GP5.
- One set of Zod schemas covers forms, the API and LLM output.
- One toolchain and one image.

**Instead of:** a FastAPI backend with a generated TypeScript client.

**Revisit if:** audio analysis becomes a goal, such as checking timing from recordings. Add a small Python service for that alone.

## D-03 PostgreSQL 16, one container per app

**Decision:** Postgres 16 in its own container for this app. `jsonb` holds the flexible data (file metadata, LLM drafts).

**Why:** the data is relational (lessons ↔ topics ↔ blocks ↔ plans) and the stats are aggregations. A separate container keeps the app independent, so it can move to the home server on its own.

**Instead of:** MongoDB Atlas, or one Postgres shared with the baby tracker. Sharing would save about 30–50 MB, which is the fallback if memory gets tight.

## D-04 Files on Cloudflare R2

**Decision:** R2 bucket `guitar-tracker`, accessed only through presigned URLs, with the browser uploading directly.

**Why:** cheap, already used by the baby tracker, and keeps upload bytes out of the 256 MiB API container.

**Revisit if:** the NAS is ready. Switch to S3-compatible storage there by changing configuration only.

## D-05 GitHub login with a numeric-id allowlist

**Decision:** Better Auth with GitHub as the only provider. Only GitHub user ids listed in `ALLOWED_GITHUB_IDS` can sign in. Sessions last 90 days and renew with use.

**Why:** a GitHub OAuth app doesn't go through Google's consent-screen verification, so there are no warning screens. Usernames can change, but numeric ids can't.

**Instead of:** Google OAuth (verification warnings) or Cloudflare Access.

## D-06 Telegram for notifications

**Decision:** A Telegram bot, run by the worker with long polling, handles reminders, quick logging and later the lesson inbox.

**Why:** reliable on iPhone, supports interactive buttons, and long polling needs no public webhook.

**Later:** web push (iOS supports it only for installed PWAs), SMS.

## D-07 pg-boss for jobs and schedules

**Decision:** pg-boss, backed by the app's own Postgres, for queued jobs and cron schedules in `America/Lima`.

**Why:** no Redis or extra service, and it's timezone-aware.

## D-08 Spanish UI, English code

**Decision:** The UI is in Spanish (es-PE), with strings kept in one file per app and no i18n library. Code, docs and specs are in English.

## D-09 No audio in the app

**Decision:** The app never plays sound: no metronome, no playback. The session timer relies on visual cues only, and elapsed time is computed from timestamps.

**Why:**
- The Pocket Master handles sound and metronome through headphones.
- iOS web apps can't vibrate.
- Timestamp-based timing survives the screen locking.

## D-10 Claude for drafts, never for final data

**Decision:**
- Claude Sonnet 5.5 is the default model and Haiku 4.5 handles small parsing jobs. The model is configurable per feature.
- Output is validated with Zod and stored as a draft that Carlos accepts.
- Every call is logged with its token usage and cost.

**Why:** at about 6 lessons a month, the estimated cost is around $1–3 a month. Carlos stays in control of his own notes.

## D-11 Practice week anchored on the lesson day

**Decision:** Plans, history and weekly summaries use a cycle that starts on the lesson weekday (Thursday by default) and runs 7 days.

**Why:** the natural unit of practice is from one lesson to the next.

## D-12 Backups run inside the app

**Decision:** The worker runs a nightly `pg_dump` to R2, keeps 30 days, and alerts through Telegram on failure.

**Why:** self-contained and moves with the app. Host cron would need root on each host.

**Instead of:** a host cron like the baby tracker's.

## D-13 Names

| Thing | Name |
|---|---|
| Product | Daily Shed |
| Repo | `carlosz44/guitar-tracker` |
| URL | `ds.<domain>`, on the same domain as the baby tracker |
| Image | `ghcr.io/carlosz44/guitar-tracker` |
| Compose project and server path | `guitar-tracker`, `/srv/guitar-tracker` |
| Database name and user | `guitartracker` |
| R2 bucket | `guitar-tracker` |

## D-14 Shared Caddy lives in the `infra-vps` repo

**Decision:** Caddy moves out of the baby tracker's compose into `carlosz44/infra-vps` (`/srv/edge`), with an external Docker network `edge`. Each app joins it with a network alias; databases stay off it.

**Why:** two apps can't each bind ports 80 and 443. See `infra-vps/docs/specs/001-shared-edge`.

## D-15 System tables have no owner
*2026-09-30*

**Decision:** Tables that belong to the app rather than to a user (`worker_heartbeat`, `backup_runs`) have no `user_id`. `worker_heartbeat` is a singleton row with a `smallint` key fixed at 1 instead of a UUIDv7. Every table with user data still has `user_id`, and every query on it filters by it.

**Why:** the worker writes these rows with no user in context, and they exist before anyone signs in. Attaching them to the single user would be artificial and would break on a fresh database.

## D-16 Route paths in English, labels in Spanish
*2026-09-30*

**Decision:** Web route paths are English (`/today`, `/lessons`, `/topics`, `/history`, `/settings`, `/login`, `/access-denied`, `/practice/:id`). Everything visible, including the navigation labels (Hoy, Clases, Temas, Historial, Ajustes), stays Spanish and comes from `apps/web/src/i18n/es.ts`. Telegram commands such as `/hoy` are typed by Carlos, so they stay Spanish.

**Why:** paths are code. They appear in route files, links and tests, which D-08 keeps in English.

**Instead of:** the Spanish paths first written in specs 001–003.
