# 003 Practice sessions

**Status:** Approved
**Depends on:** 002

## Why

This is the screen Carlos uses every day, at the music stand, with the iPhone as the guide and the Pocket Master providing sound and metronome. It must start with one tap, keep time reliably even when the phone locks, and capture the clean BPM and a rating for each block with minimal fuss. Everything in 004, 006 and 008 builds on the data recorded here.

## Scope

**In:**
- **Hoy screen:** today's minutes against the target, streak, suggested blocks, a start button, resuming an active session, the latest lesson, and open questions.
- **Guided timer:** blocks, pause and resume, extend, skip, block-end cue, per-block log, summary.
- **Manual logging** for practice done without the timer.
- **Historial:** sessions grouped by day within the practice cycle, with edit and delete.
- **Automatic status changes:** a topic goes from `new` to `active` on its first practice; abandoned sessions are closed automatically.

**Out:** weekly plans (006; until then a simple rule suggests blocks), Telegram (004), charts (008), audio of any kind.

## User stories

- As Carlos, at 11:00 I want to open Daily Shed from my home screen, see today's blocks already chosen, adjust them if I want, and tap "Empezar".
- As Carlos, while playing I want to glance at the phone and see the current topic, time left and target BPM, without touching it.
- As Carlos, when a block ends I want an unmistakable visual cue, then a quick way to log the clean BPM and a rating before moving on.
- As Carlos, if I practiced without the app, I want to log it afterwards in a few seconds.

## Acceptance criteria

**Hoy**
- **AC-1** `/today` shows:
  - today's minutes against the daily target, as a progress ring or bar with "X de Y min"
  - the current streak
  - the latest lesson (title and date, linking to it)
  - the number of open teacher questions
  - the suggested blocks
  - an "Empezar" button
- **AC-2** Suggested blocks follow this rule, which 006 will replace:
  - a 5-minute "Calentamiento" block (no topic)
  - then up to 2 topics filling the rest of the daily target, split evenly and rounded to 5 minutes
  - topic order:
    1. topics linked to the latest lesson with status `new` or `active` that haven't been practiced since that lesson's date
    2. then `active` topics by priority (high first), then least recently practiced
    3. `maintenance` topics only if fewer than 2 topics were found
  - if there are no topics, only the warm-up block plus a prompt to create topics
- **AC-3** Before starting, I can remove, reorder or add blocks (any non-archived topic, or a free block with a label) and change each block's minutes in steps of 5. The total updates live.
- **AC-4** If a session is in progress, `/today` shows "Sesión en curso · Continuar" instead of the suggestions, and opening the app resumes it.

**Timer**
- **AC-5** Starting creates the session and its blocks on the server (`in_progress`) and opens `/practice/:id`. The screen shows, readable at arm's length:
  - the current block's topic (or label)
  - a large countdown
  - the topic's target BPM and last clean BPM
  - the next block's name
  - the session's total elapsed time
- **AC-6** Elapsed and remaining time are always computed from stored timestamps. Locking the phone, switching apps or reloading for any length of time, then returning, shows the correct time with no drift over one second.
- **AC-7** The screen requests a Screen Wake Lock while a block is running, and requests it again when the page becomes visible. If the Wake Lock API isn't available or is denied, a dismissible tip suggests turning off Auto-Lock during practice.
- **AC-8** Pause and resume: paused time doesn't count toward the block or the session, and the pause survives a reload.
- **AC-9** "+5 min" extends the current block, and "Saltar" ends it early; both still go through the block log (AC-11).
- **AC-10** When the countdown reaches zero:
  - the whole screen switches to the accent colour with "¡Tiempo!" and an overtime counter counting up
  - nothing advances automatically
  - there is no sound or vibration
  - a large "Registrar y seguir" button is shown
- **AC-11** The block log is a bottom sheet with:
  - clean BPM as a stepper (±5), pre-filled with the topic's last clean BPM, else its target BPM, else 60. It can be left empty.
  - rating as five large taps (1–5), optional
  - an optional note
  - "Guardar y seguir"

  Saving records the block's actual seconds (excluding pauses) and starts the next block.
- **AC-12** "Anotar pregunta" is available at any time during a session. It creates a teacher question linked to the current block's topic without leaving the session.
- **AC-13** After the last block, a summary shows total minutes, minutes per topic, BPMs logged, and whether the daily target was met. It includes an optional note for the whole session and a "Terminar" button that sets the session to `completed`.
- **AC-14** The first time a `new` topic is included in a saved block, the topic becomes `active`.

**Reliability**
- **AC-15** If saving a block fails (offline or a server error), the UI shows "Sin conexión, se guardará al reconectar". It keeps the entry, retries automatically, and doesn't block moving to the next block. Nothing logged is lost if the app is reloaded while offline, because pending writes are persisted locally.
- **AC-16** An hourly worker job marks as `abandoned` any session that has been `in_progress` for more than 3 hours since its last activity. It sets `ended_at` to the last activity and keeps the blocks already logged.

**Manual log**
- **AC-17** "Registrar práctica" (from Hoy and Historial) takes:
  - date (default today)
  - duration in minutes
  - one or more topics or a free label, with optional minutes and clean BPM per topic
  - notes

  It creates a `completed` session with `source: manual`. When per-topic minutes are omitted, the duration is split evenly across the topics.

**Historial**
- **AC-18** `/history` groups sessions by practice cycle (starting on the lesson weekday), then by day. Each day shows total minutes and a check when the target was met. Each cycle shows total minutes and days practiced.
- **AC-19** I can open a session to edit block minutes, BPM, ratings and notes, or delete it (with confirmation). Today's totals and the streak update right away.

**Rules**
- **AC-20** Unit tests cover the rules in `docs/domain.md`:
  - practice day in `America/Lima`, including a session started at 23:50 that ends after midnight and counts for the day it started
  - today's minutes
  - the streak, including the case where today's target isn't met yet
  - cycle boundaries
  - the suggestion rule in AC-2

## UX notes

- **Session screen:** designed for a phone on a stand, 60–80 cm away.
  - Countdown about 96 px, topic name about 28 px, target BPM prominent.
  - Controls sit at the bottom within thumb reach: Pausa, +5 min, Saltar, Anotar pregunta.
  - The app is always dark (D-17), which also keeps glare down at the stand.
- **Block end:** the colour change must be obvious in peripheral vision.
- **Start experience:** Hoy is the default route, so opening from the home screen lands on the "Empezar" button.
- **Historial:** compact on phone. On laptop, a table with columns for date, minutes, topics and average rating.

## Data

Per `docs/domain.md`: `practice_sessions`, `session_blocks` and `practice_days`.
- `practice_sessions.practice_date` is set when the session starts, in the user's timezone.
- The API computes derived topic values (last practiced, latest and best clean BPM, total minutes) with SQL. It adds them to topic and Hoy responses and shows them on the topic page.
- Indexes: sessions on `(user_id, practice_date desc)`, blocks on `(topic_id, ended_at desc)`.

## API sketch

- `GET /api/today` → minutes, target, streak, suggestion, active session, latest lesson, open questions count
- `POST /api/sessions` `{ blocks: [{ topicId?, label?, plannedSeconds }] }` → session with blocks, first block started
- `POST /api/sessions/:id/pause`, `POST /api/sessions/:id/resume`
- `PATCH /api/sessions/:id/blocks/:blockId` `{ action: "extend" | "complete" | "skip", cleanBpm?, rating?, notes?, clientTimestamp }`
- `POST /api/sessions/:id/finish` `{ notes? }`
- `POST /api/sessions/manual`
- `GET /api/sessions?from=&to=`, `GET|PATCH|DELETE /api/sessions/:id`

The server is the source of truth for timestamps. The client sends its own timestamp only so the server can apply offline writes in order when they arrive late.

Worker job: `session.close-stale`, hourly.

## Edge cases

- **Two devices at once** (laptop and phone): the second one sees the same active session. There is still only one active session per user; starting a new one while one is active asks to finish or discard the old one first.
- **Blocks longer than planned:** overtime counts toward actual seconds. Carlos kept playing, so it's practice.
- **Deleting a topic used in blocks:** blocked by 002's rule; archive it instead.
- **Daily target changed mid-day:** today's progress uses the new target immediately. Past days keep using the target that was in effect when they happened, so store a `target_minutes` snapshot per day, computed when the first session of the day starts.

## Open questions

- None.
