# 003 Practice sessions: plan

**Spec:** ./spec.md
**Status:** Approved

## Approach

**Timekeeping.** Every duration is computed from stored instants, never counted in memory.
- **Session columns:** `started_at`, `paused_at` (set while paused), `paused_seconds` and `last_activity_at`.
- **Block columns:** `started_at`, `ended_at`, `paused_seconds` and `actual_seconds`. When a block ends, `actual_seconds = ended_at − started_at − paused_seconds`.
- **Pause:** sets `paused_at`. Resume adds the paused span to the session and to the running block.
- **Client timestamps:** writes carry the phone's timestamps (`endedAt`, `nextStartsAt`), so late writes after a lost connection keep their real times. The server accepts a client timestamp only between the block's start and its own current time, and otherwise uses its own clock.
- **Clock offset:** responses include `serverNow`, so the client can correct its clock before computing countdowns. This keeps drift under a second (AC-6).

**Server (`apps/server/src/practice/`).**
- **`rules.ts`**, pure and with time injected:
  - `practiceDate(instant, tz)`, `cycleStart(date, lessonWeekday)`.
  - `daysMet(days, todayTarget)` and `streak(daysMet, today)`.
  - `suggestBlocks(...)`: the AC-2 order plus Carlos's fallback to `new` topics. Minutes are split in 5-minute steps, with the extra step going to the first topic, so 25 becomes 15 + 10.
  - `splitManual(totalSeconds, topics)`: the remainder goes to the first topic.
- **`queries.ts`:** today's minutes, which sums the logged blocks of every session on that practice date (abandoned sessions keep their blocks), history by cycle, and topic stats. The stats are last practiced, current and best clean BPM, and total minutes, computed with SQL over `session_blocks`.
- **`routes.ts` (sessions)**
  - **Starting:** creates the session, its blocks and the `practice_days` snapshot in one transaction. The first block starts at once. Starting while a session is in progress answers 409 `session.active` with the active id.
  - **Block actions:**
    - `extend` adds 300 seconds to the planned time.
    - `complete` and `skip` end the block and record its BPM, rating and notes.
    - Both also start the next block at `nextStartsAt`.
    - A topic in a completed block moves from `new` to `active` (AC-14).
  - **Idempotent writes:** completing an ended block, pausing a paused session or resuming a running one returns the current state, so the client's retries are safe.
  - **Every write** bumps `last_activity_at`.
- **`today.ts`:** `GET /api/today`.
- **Worker:** `jobs/session-close.ts` runs hourly. It marks sessions abandoned after 3 hours without activity, with `ended_at = last_activity_at` (AC-16).
- **Topics:** list and detail responses gain the stats. Deleting a topic used in any block answers 409, telling Carlos to archive it.

**Web.**
- **Routes:**
  - `/today` (rewritten);
  - `/practice/$sessionId`, under a new guarded `_focus` layout with no nav bar, so a stray tap at the stand can't navigate away;
  - `/log` for manual logging;
  - `/history` and `/history/$sessionId`.
  - Opening the app from the home screen with a session in progress goes straight to `/practice/$sessionId` (AC-4). Inside the app, Hoy shows a "Sesión en curso · Continuar" card instead.
- **`lib/practice-store.ts`:** a small store (`useSyncExternalStore`, no new dependency) holding the active session snapshot, persisted to `localStorage`. The UI reads elapsed and remaining time from it using the corrected clock.
- **`lib/outbox.ts`:** session writes are queued in `localStorage` and sent one at a time, in order, retrying with backoff. While anything is pending, the screen shows "Sin conexión, se guardará al reconectar" (AC-15). After a reload the queue resumes, and the local snapshot keeps the session going.
- **Practice screen:**
  - **Display:** the topic or label (~28 px), a ~96 px countdown, target and last clean BPM, the next block's name and total elapsed time.
  - **Controls** at the bottom, within thumb reach: Pausa, +5 min, Saltar, Anotar pregunta. The question reuses `QuestionDialog` with the current topic.
  - **Time up:** the whole screen turns the accent colour, shows "¡Tiempo!" and an overtime counter, and offers "Registrar y seguir". Nothing advances on its own and there's no sound.
  - **Wake lock:** requested while a block runs and again when the page becomes visible. If it's unavailable, a dismissible tip suggests turning off Auto-Lock.
- **Block log sheet** (shadcn Sheet): BPM stepper ±5, prefilled with the last clean BPM, else the target, else 60, and clearable. Five large rating taps, a note, "Guardar y seguir".
- **Summary:** total minutes, minutes per topic, the BPMs logged, whether the target was met, a session note and "Terminar".
- **Hoy:**
  - A progress ring with "X de Y min", the streak, the latest lesson and the open-question count.
  - The suggested blocks are editable before starting: remove, reorder (up and down buttons), add a topic or a labelled free block, and change minutes in steps of 5. The total updates live. Then "Empezar".
- **Historial:** cycles, then days with total minutes and a check when the target was met. Phones get a compact list, laptops a table (date, minutes, topics, average rating). A session page edits block minutes, BPM, rating and notes, or deletes the session with confirmation.
- **Topic page:** shows last practiced, current and best BPM, and total minutes.

**End to end (Playwright).**
- `e2e/` at the repo root, using `@playwright/test`. The api runs in production mode against a fresh `guitartracker_e2e` database, serving the built web app.
- A setup step creates a user and session with the existing test helpers and stores the cookie. GitHub OAuth itself can't run in CI.
- **Tests:**
  - signed out, the app redirects to `/login`;
  - a non-allowlisted account sees `/access-denied`;
  - a full session: Hoy → Empezar → pause and resume → log a block → summary → Terminar → Historial.
- **CI:** a new `e2e` job runs after the tests, installing Chromium. The deploy waits for it.

## Schema changes (migration `0002_practice_sessions`)

Every table has `user_id`, timestamps and UUIDv7 ids.

| Table | Columns | Constraints and indexes |
|---|---|---|
| `practice_sessions` | `started_at`, `ended_at`, `paused_at`, `paused_seconds int`, `last_activity_at`, `status` (in_progress/completed/abandoned), `source` (timer/manual/telegram), `notes`, `plan_day_id uuid null` (006), `practice_date date` | CHECKs; index `(user_id, practice_date desc)`; **one in-progress session per user** (partial unique index on `user_id` where in progress) |
| `session_blocks` | `session_id` (cascade), `position smallint`, `topic_id` (no action, null), `label`, `planned_seconds`, `started_at`, `ended_at`, `paused_seconds`, `actual_seconds`, `clean_bpm smallint`, `rating smallint`, `notes` | CHECK topic or label present; rating 1–5; BPM 20–400; unique `(session_id, position)`; index `(topic_id, ended_at desc)` |
| `practice_days` | `date`, `target_minutes smallint` | PK `(user_id, date)` |

## API changes

All routes need a session.
- `GET /api/today` returns:
  - `{ date, minutes, targetMinutes, met, streak, latestLesson, openQuestionsCount }`;
  - `activeSession`, as `{ id }` or null;
  - `suggestion`, a list of `{ topicId, label, title, minutes, targetBpm, lastCleanBpm }`.
- **Starting:** `POST /api/sessions` with `{ blocks: [{ topicId?, label?, plannedSeconds }] }` answers 201 with the session, or 409 `session.active`.
- **Pausing:** `POST /api/sessions/:id/pause` and `/resume`, each with `{ at }`.
- **Blocks:** `PATCH /api/sessions/:id/blocks/:blockId` with `{ action: extend|complete|skip, endedAt?, nextStartsAt?, cleanBpm?, rating?, notes? }`.
- **Ending:** `POST /api/sessions/:id/finish` with `{ notes? }`, and `POST /api/sessions/:id/abandon`.
- **Manual log:** `POST /api/sessions/manual` with `{ date, minutes, items: [{ topicId?, label?, minutes?, cleanBpm? }], notes }`.
- **History:** `GET /api/sessions?before=&cycles=` returns cycles, then days with sessions.
- **One session:** `GET`, `PATCH` (notes and blocks) and `DELETE /api/sessions/:id`.
- Session responses include `serverNow`. Shared Zod schemas live in `packages/shared/src/sessions.ts`.

## New dependencies

| Package | Why |
|---|---|
| `@playwright/test` (dev, root) | End-to-end smoke tests, as architecture.md planned for after 003 |

shadcn Sheet uses the existing `radix-ui`.

## Testing

| AC | Tests |
|---|---|
| AC-1 | Integration `/api/today` shape; web Hoy renders ring, streak, lesson, questions, blocks, Empezar |
| AC-2 | Unit `suggestBlocks`, including Carlos's fallback and the 15 + 10 split; integration through `/api/today` |
| AC-3 | Web: remove, reorder, add a topic or a free block, minutes ±5, total updates |
| AC-4 | Integration `activeSession`; web card plus resume on launch |
| AC-5 | Integration start creates blocks with the first one started; web practice screen shows every element |
| AC-6 | Unit elapsed and remaining with a fake clock and offset; web: reload mid-block keeps the time; e2e |
| AC-7 | Web with a mocked `navigator.wakeLock`: requested, re-requested when visible, tip when missing |
| AC-8 | Integration pause and resume arithmetic, idempotent; web: pause survives a reload |
| AC-9 | Integration extend adds 300 s; web: Saltar opens the log |
| AC-10 | Web, fake timers: accent screen, overtime counter, no auto-advance |
| AC-11 | Web sheet prefill order and empty BPM; integration actual seconds exclude pauses, overtime counts |
| AC-12 | Web: question during a session carries the current topic |
| AC-13 | Web summary; integration finish sets completed |
| AC-14 | Integration: new becomes active on the first completed block |
| AC-15 | Unit outbox order, retry and persistence; web offline message, entry kept, reload while offline |
| AC-16 | Integration worker job |
| AC-17 | Unit `splitManual`; integration manual session; web form |
| AC-18 | Unit cycle grouping; integration history; web grouping, checks, laptop table |
| AC-19 | Integration edit and delete; web edit page, today and streak refresh |
| AC-20 | Unit tests for every rule, including a session at 23:50 crossing midnight, the streak before today's target is met, and cycle edges |

## Risks and mitigations

- **iOS suspends JavaScript when the phone locks.** Time is computed from timestamps, so nothing drifts; the e2e and manual checks reload mid-block.
- **Wake Lock in standalone PWAs** was unreliable on older iOS. The tip is the fallback; checked on the iPhone.
- **Phone clock skew** is corrected with `serverNow`, and server-side clamping keeps bad client timestamps from inflating minutes.
- **Two devices at once:** the unique index allows one active session; the second device sees the same session through `/api/today`.
- **CI time:** the e2e job installs only Chromium and reuses the build.

## Deviations from the spec

1. New-topic fallback in suggestions (Carlos).
2. `paused_at` and `last_activity_at` columns, not listed in `docs/domain.md`.
3. Writes carry client timestamps for when blocks end and start, clamped by the server.
4. Every session write goes through the outbox, not only block saves, so pause and resume also survive offline.
5. The practice screen has no nav bar (`_focus` layout).
6. Playwright e2e in CI (Carlos).
