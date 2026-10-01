# Domain model

This covers the whole product, including entities that later specs will create, so that early schema choices don't block them. Each entity notes the spec that introduces it. Field lists describe intent; the spec's `plan.md` settles exact types and indexes.

## Glossary

| UI (Spanish) | Code | Meaning |
|---|---|---|
| Clase | `lesson` | One lesson with the teacher, on a date |
| Archivo | `lessonFile` | A file attached to a lesson (Guitar Pro, PDF, Word, image) |
| Tema | `topic` | Something to practice that outlives the lesson it came from, e.g. "Tríadas de dórico" |
| Categoría | `topic.category` | Technique, scales and modes, etc. (see below) |
| Pregunta para el profe | `teacherQuestion` | A doubt noted during practice, to ask at the next lesson |
| Sesión | `practiceSession` | One sitting of practice |
| Bloque | `sessionBlock` | A timed segment of a session, usually one topic |
| Calentamiento | warm-up block | A block with no topic, labelled "Calentamiento" |
| BPM limpio | `cleanBpm` | The fastest tempo at which the exercise was played three times in a row without mistakes |
| Semana de práctica / ciclo | `cycle` | The span from one lesson day to the day before the next (Thursday to Wednesday by default) |
| Plan semanal | `weeklyPlan` | Which topics to practice on which day of a cycle |
| Meta diaria | `dailyTargetMinutes` | Minimum minutes a day (default 30) |
| Racha | streak | Consecutive days that met the daily target |
| Borrador | `llmDraft` | Something Claude proposed that hasn't been accepted yet |

## Topic categories

| Code | UI label |
|---|---|
| `technique` | Técnica |
| `scales_modes` | Escalas y modos |
| `chords_arpeggios` | Acordes, tríadas y arpegios |
| `rhythm` | Ritmo |
| `repertoire` | Repertorio |
| `ear` | Oído |
| `theory` | Teoría |
| `other` | Otro |

## Entities

### User and settings (001)

Better Auth owns `user`, `session`, `account` and `verification`. App data hangs off `user.id`.

`user_settings`, one row per user:
- `timezone`, default `America/Lima`
- `daily_target_minutes`, default 30
- `day_targets`: optional per-weekday targets (Monday first); when set, Hoy, streaks and plans use the weekday's value (006)
- `lesson_weekday`, ISO day number, default 4 (Thursday). The cycle starts on this day.
- `reminder_times`, default `["11:00", "16:00", "18:00"]` (used from 004)
- `telegram_chat_id`, nullable (004)

### Lesson (002)

- `date` (date), `title`
- `raw_notes`: Carlos's notes as typed (markdown)
- `summary` (markdown), `practice_points` (string[]), `homework` (text). Filled by hand in 002 and drafted by Claude from 005.
- `status`: `draft` | `final`. Lessons entered by hand in 002 are `final`. Drafts come from 005 and 007.
- `source`: `web` | `telegram`

### Lesson file (002)

- `lesson_id`, `kind`: `guitar_pro` | `pdf` | `docx` | `image` | `other`
- `original_name`, `mime`, `size_bytes`, `r2_key`, `sha256`
- `upload_status`: `uploading` | `uploaded`
- `extraction_status`: `pending` | `done` | `failed` | `not_applicable`, plus `extraction_error`
- `extracted_text`: compact text for Claude and search. Guitar Pro and docx only.
- `meta` (jsonb): for Guitar Pro, title, artist, tempo, time signatures, tunings, track names and bar count

| Kind | Extensions | Extraction | Viewing |
|---|---|---|---|
| Guitar Pro | .gp, .gpx, .gp5, .gp4, .gp3 | alphaTab → compact text + meta | alphaTab in the browser (tab staff) |
| PDF | .pdf | none (Claude reads PDFs directly) | Safari's PDF viewer through a short-lived URL |
| Word | .docx | mammoth → plain text | extracted text, plus download |
| Image | .jpg, .jpeg, .png, .webp, .heic | none (Claude can read images) | inline |

### Topic (002)

- `title`, `description` (markdown), `category`
- `parent_id`, nullable. Builds-on relation, e.g. "Tríadas de dórico" → "Modo dórico".
- `status`: `new` | `active` | `maintenance` | `archived`
- `priority`: 1 (low), 2 (normal), 3 (high). Default 2.
- `practice_points` (string[]), `success_criteria` (text), e.g. "A dórico, tríadas en cuerdas 1–3, corcheas a 90 BPM, 3 veces limpias"
- `target_bpm`, nullable
- `default_block_minutes`, default 10

Derived rather than stored: last practiced at, latest clean BPM, best clean BPM, total minutes.

`lesson_topics` links lessons and topics: `lesson_id`, `topic_id`, `relation`: `introduced` | `extended` | `reviewed`.

### Teacher question (002)

- `text`, `topic_id` (nullable), `status`: `open` | `answered` | `dismissed`
- `answer` (text), `answered_in_lesson_id` (nullable)

### Practice session (003)

- `started_at`, `ended_at`, `paused_seconds`
- `status`: `in_progress` | `completed` | `abandoned`
- `source`: `timer` | `manual` | `telegram`
- `notes`, `plan_day_id` (nullable, 006)
- `practice_date` (date): the local date in the user's timezone when the session started. It is fixed at start, so a session that crosses midnight counts for the day it began.

### Session block (003)

- `session_id`, `position`
- `topic_id` (nullable), `label`. A block without a topic needs a label, such as "Calentamiento".
- `planned_seconds`, `started_at`, `ended_at`, `paused_seconds`, `actual_seconds`
- `clean_bpm` (nullable), `rating` 1–5 (nullable), `notes`

### Practice day (003)

- `practice_days`: `user_id`, `date`, `target_minutes`. This is a snapshot of the daily target, taken when the first session of that day is created, so changing the target later doesn't rewrite past days.

### Weekly plan (006)

- `weekly_plans`: `cycle_start` (date, the lesson day), `cycle_end`, `status`: `draft` | `active` | `replaced` (ended plans are derived from `cycle_end`), `week_note`, `rationale`, `source` (`rules` | `claude`), `llm_status`, `llm_error`, `llm_run_id` (D-19)
- `plan_days`: `plan_id`, `date`, `target_minutes`, `focus_note`
- `plan_items`: `plan_day_id`, `topic_id` (nullable, for the warm-up), `label`, `minutes`, `position`

### Notification (004)

- `kind`: `practice_reminder` | `lesson_nudge` | `backup_failed` | `weekly_summary`
- `scheduled_for`, `sent_at`, `telegram_message_id`
- `action`: `none` | `started` | `snoozed` | `skipped_today`
- `payload` (jsonb)

### LLM run and draft (005)

- `llm_runs`: `feature` (`lesson_enrichment` | `weekly_plan` | `weekly_review` | `topic_improve` | `log_parse`), `model`, `input_tokens`, `output_tokens`, `cache_read_tokens`, `cost_usd`, `latency_ms`, `status`, `error`, `subject_type`, `subject_id`
- `llm_drafts`: `kind` (`lesson_enrichment` | `topic_improve`), `subject_type` (`lesson` | `topic`), `subject_id`, `payload` (jsonb, validated with a Zod schema from `packages/shared`), `review` (jsonb, each section's state and accepted value), `instruction`, `skipped_files`, `status`: `queued` | `running` | `pending` | `accepted` | `discarded` | `failed`, `error`, `llm_run_id` (D-18)

### Telegram inbox (007)

- `inbox_batches`: `status`: `collecting` | `processing` | `done` | `failed`, `lesson_id`
- `inbox_items`: `batch_id`, `telegram_message_id`, `kind`: `text` | `document` | `photo`, `text`, `r2_key`, `received_at`

## Lifecycles

**Topic:**
- `new`: created, never practiced.
- `active`: in rotation. A topic becomes active automatically the first time it's practiced, or by hand.
- `maintenance`: mostly mastered; practiced occasionally, with low planner weight.
- `archived`: out of planning, history kept.

Carlos can move a topic between any two states.

**Lesson:** `draft` → `final` when he accepts it. Lessons entered by hand start as `final`.

**Practice session:**
- `in_progress` → `completed` when he ends it.
- `in_progress` → `abandoned` when there's been no activity for 3 hours. The blocks logged so far are kept, and `ended_at` is set to the last activity.

**LLM draft:** `queued` → `running` → `pending` → `accepted` | `discarded`, or `failed`. A draft can be accepted in parts, for example keeping the summary but not the suggested topics; it settles when no section is pending.

**Teacher question:** `open` → `answered` (with an answer and lesson) | `dismissed`.

## Rules

- **Practice day:** the local date in the user's timezone when a session starts.
- **Today's minutes:** the sum of `actual_seconds` of blocks in today's sessions, excluding paused time.
- **Daily target met:** a day's minutes ≥ that day's `practice_days.target_minutes`. For today, the current `daily_target_minutes` is used, so a change applies right away.
- **Streak:** consecutive days, ending today if today's target is already met, otherwise ending yesterday, where the daily target was met.
- **Cycle:** starts on `lesson_weekday` and runs 7 days. The cycle containing a date begins on the most recent lesson weekday on or before that date.
- **Clean BPM:** recorded per block. A topic's "current" clean BPM is the most recent value and its "best" is the maximum. Both are shown, because regressions matter.
