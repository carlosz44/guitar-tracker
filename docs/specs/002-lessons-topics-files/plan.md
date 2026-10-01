# 002 Lessons, topics and files: plan

**Spec:** ./spec.md
**Status:** Approved

## Approach

**Shared (`packages/shared/src`).**
- `files.ts`:
  - `FILE_KINDS` and an extension → kind table (`.gp .gpx .gp5 .gp4 .gp3` → `guitar_pro`, `.pdf`, `.docx`, `.jpg .jpeg .png .webp .heic` → `image`).
  - `MAX_FILE_BYTES` = 25 MB.
  - `validateUpload({ name, size })` returns a kind or an error key (`file.extension`, `file.size`). Validation is by extension, because iOS reports `application/octet-stream` for `.gp`.
- `lessons.ts`, `topics.ts`, `questions.ts`: create, update and response schemas.
  - Constants: topic statuses, priorities (1–3), relations (`introduced | extended | reviewed`), question statuses.
  - Rules: `targetBpm` 20–400, `defaultBlockMinutes` 5–60, link list with no duplicate topic.
  - Every message is a key, translated in each app's `es.ts` (same pattern as 001).
- `dates.ts`: `todayIn(timezone, now)` with `@date-fns/tz`, used for the default lesson date.

**Server.**
- **Routers.** `routes/lessons.ts`, `topics.ts`, `questions.ts`, `files.ts` are mounted behind `requireSession` in `createApiRoutes`. Every query filters by `user_id`.
- **New app dependencies.**
  - `AppDeps` gains `storage: ObjectStorage` (R2 in prod, `test/memory-storage.ts` in tests) and `queue: JobQueue`.
  - `JobQueue` is a thin `send(name, data)` over a send-only pg-boss: `supervise: false`, `schedule: false`, `max: 2`. The api pool drops to 4, so the total stays within `max_connections` 20.
- **CSP.** The R2 origin (`https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com`) is added to `connect-src` (browser PUT, alphaTab fetch) and `img-src` (inline images). `worker-src` gets `blob:` for alphaTab.
- **Lesson delete.**
  1. Delete the lesson's R2 objects. If any fails, answer 502 and delete nothing.
  2. Delete the lesson. The cascade removes file rows and `lesson_topics`; `teacher_questions.answered_in_lesson_id` is set to null.
- **Topic parent cycles.** `topics/cycle.ts` has a pure `wouldCreateCycle(topicId, newParentId, parentOf)`. It loads the user's `(id, parent_id)` pairs, which is a small set. A cycle answers 400 `topic.cycle`.
- **Topic delete.** Answers 409 `topic.has_lessons` when any `lesson_topics` row exists.
- **File flow** (architecture "File upload"):
  1. `POST /lessons/:id/files` validates and creates the row (`uploading`, key `lessonFileKey(lessonId, fileId, name)`). It returns `{ fileId, uploadUrl, contentType }`; `presignPut` signs `ContentType` and `ContentLength`.
  2. The browser PUTs the file straight to R2 with XHR, for progress.
  3. `POST /files/:id/confirm` checks the object exists (`storage.head`) and the size matches, then sets `uploaded`. `extraction_status` becomes `pending` for Guitar Pro and docx, `not_applicable` for the rest. It queues `file.extract` for every kind, because the job always computes SHA-256.
  4. `GET /files/:id/url?disposition=` returns `{ url }` (5-minute presigned GET). It's used by alphaTab and images.
  5. `GET /files/:id/open?disposition=` answers 302 to a fresh presigned URL. It's used by PDF and download links, so iOS doesn't block a popup opened after an `await`.
- **Worker, `jobs/file-extract.ts`.**
  1. Streams the object from R2 (new `storage.getStream`) and computes SHA-256 while reading.
  2. For Guitar Pro and docx, buffers the bytes (25 MB at most) and parses them in a worker thread:
     - The thread is `jobs/parser-thread.ts`, a new tsup entry `parser-thread.js`.
     - Limits: `resourceLimits.maxOldGenerationSizeMb: 128`, killed with `terminate()` after 60 s.
     - It checks magic bytes first: zip for `.gp`/docx, `BCFZ`/`BCFS` for `.gpx`, `FICHIER GUITAR PRO` for gp3–5.
     - alphaTab's `ScoreLoader.loadScoreFromBytes` produces meta (title, artist, tempo, time signatures, tunings, tracks, bar count) and the compact text below. mammoth's `extractRawText` handles docx.
     - Text is capped at 40,000 characters plus `\n… (truncated)`.
  3. Sets `done` or `failed` with a short error code: `unsupported_format`, `parse_error`, `timeout` or `out_of_memory`. Parse failures complete the job, with no retry; R2 errors throw so pg-boss retries (2×). `POST /files/:id/retry` re-queues a `failed` file.
  4. Duplicate check: the detail response marks a file as `duplicateOf: <name>` when its SHA-256 matches another file on the same lesson.
- **Worker, `jobs/file-cleanup.ts`.** Hourly. Rows still `uploading` after 1 h are deleted together with any object left in R2.
- **Guitar Pro compact text:**
  ```
  Title: … | Artist: … | Tempo: 90 | Time: 4/4 | Bars: 16
  Track 1 "Guitarra" tuning E2 A2 D3 G3 B3 E4
  Section A
  Bar 1: 8th [s3:7 s2:6 s1:5] [s3:9 s2:7 s1:7] …
  ```
  It has one line per bar, with the duration printed when it changes and beats as `[string:fret …]`, `r` for rests.

**Web.**
- **Routes:** `/lessons`, `/lessons/new`, `/lessons/$lessonId`, `/lessons/$lessonId/edit`, `/lessons/$lessonId/files/$fileId`, `/topics`, `/topics/new`, `/topics/$topicId`, `/topics/$topicId/edit`.
- **Data:** `lib/queries.ts` holds the query options and mutations over `hc`. A lesson's query refetches every 2 s while any file is `pending` or `uploading`.
- **Components:**
  - `Markdown` (react-markdown, no raw HTML, Tailwind element styles).
  - `ListEditor` for practice points.
  - `FileDropzone` and `UploadQueue`: drag-and-drop plus picker, client validation with Spanish reasons, parallel XHR uploads with one progress bar each, then confirm.
  - `FileRow` with a status badge ("Procesando…", "Listo", "No se pudo leer" with "Reintentar") and a duplicate warning.
  - `TopicCombobox`: shadcn Command + Popover, with "Crear tema «…»" as the last option. Creating inline asks only for the category.
  - `QuestionDialog`: "+ Pregunta" in the sidebar and in the page header on phones, and on lesson and topic pages.
  - `OpenQuestions`, shown on the latest lesson under "Para la próxima clase": answer (text plus an optional lesson) or dismiss.
- **Lesson page.** Read-first on the phone: title and summary, then "Archivos" as large rows, then practice points and topics. On wide screens the form puts notes on the left and fields on the right.
- **Viewers.**
  - Guitar Pro: `GuitarProViewer` lazy-loads `@coderline/alphatab`. Tab staff only by default, with a toggle to add standard notation; zoom −/+ kept in `localStorage`; page layout fitted to the width; player off.
  - Vite gets alphaTab's plugin for fonts and workers. Workbox `maximumFileSizeToCacheInBytes` goes up to 4 MB so the viewer is precached.
  - PDF: link to `/open` in a new tab. docx: extracted text plus "Descargar". Images: inline, full size on tap; HEIC falls back to a download link where the browser can't show it.
- **Strings:** all new text goes in `apps/web/src/i18n/es.ts`.

## Schema changes (migration `0001_lessons_topics_files`)

Every table has `user_id` (FK `user`, cascade) and timestamps; ids are UUIDv7.

| Table | Columns (beyond id, user_id, timestamps) | Constraints and indexes |
|---|---|---|
| `lessons` | `date date`, `title`, `raw_notes`, `summary`, `practice_points text[]`, `homework`, `status` (default `final`), `source` (default `web`) | CHECKs on status and source; index `(user_id, date desc)` |
| `lesson_files` | `lesson_id` (cascade), `kind`, `original_name`, `mime`, `size_bytes bigint`, `r2_key` (unique), `sha256`, `upload_status`, `extraction_status`, `extraction_error`, `extracted_text`, `meta jsonb` | CHECKs on kind and statuses; index `(lesson_id)`, `(upload_status, created_at)` |
| `topics` | `title`, `description`, `category`, `parent_id` (set null), `status` (default `new`), `priority smallint` (default 2), `practice_points text[]`, `success_criteria`, `target_bpm smallint`, `default_block_minutes smallint` (default 10) | CHECKs: category in the eight, priority 1–3, bpm 20–400, minutes 5–60, `parent_id <> id`; index `(user_id, status)` |
| `lesson_topics` | `lesson_id` (cascade), `topic_id` (restrict), `relation` | PK `(lesson_id, topic_id)`; CHECK on relation |
| `teacher_questions` | `text`, `topic_id` (set null), `status` (default `open`), `answer`, `answered_in_lesson_id` (set null) | CHECK on status; index `(user_id, status)` |

## API changes

All routes need a session, and the AC-5 test of 001 covers the new ones automatically.

- **Lessons**
  - `GET /api/lessons` lists lessons with file and topic counts.
  - `POST /api/lessons` creates one. `GET`, `PATCH` and `DELETE /api/lessons/:id` act on one lesson.
  - The `GET` returns the lesson, topics grouped by relation, files, `openQuestionsCount`, `isLatest`, and the open questions when it's the latest lesson.
  - `PUT /api/lessons/:id/topics` replaces the links with `[{ topicId, relation }]`.
- **Files**
  - `POST /api/lessons/:id/files` with `{ name, mime, size }` returns `{ fileId, uploadUrl, contentType }`.
  - `POST /api/files/:id/confirm`, `POST /api/files/:id/retry`, `GET /api/files/:id` (row, meta, extracted text) and `DELETE /api/files/:id`.
  - `GET /api/files/:id/url?disposition=inline|attachment` returns `{ url }`; `GET /api/files/:id/open?disposition=` answers 302.
- **Topics**
  - `GET /api/topics?status=&category=` lists them, with parent titles.
  - `POST /api/topics` creates one. `GET`, `PATCH` and `DELETE /api/topics/:id` act on one topic.
  - The `GET` returns the topic with parent, children, linked lessons with relation, and open questions.
- **Questions**
  - `GET /api/questions?status=&topicId=`, `POST /api/questions` (`{ text, topicId? }`), `PATCH /api/questions/:id` (`text`, `status`, `answer`, `answeredInLessonId`).
- **Worker jobs:** `file.extract { fileId }`, and `file.cleanup-stale` on a schedule every hour.

## UI changes

The routes and components are listed above. New shadcn components: textarea, select, dialog, alert-dialog, popover, command, badge, progress.

## New dependencies

| Package | Why |
|---|---|
| `@coderline/alphatab` | Parse Guitar Pro (worker) and render the tab staff (web), per architecture |
| `mammoth` | docx to plain text, per architecture |
| `react-markdown` | Render markdown notes safely (Carlos chose rendering) |
| `cmdk` | Behind shadcn Command, for the topic combobox |
| `date-fns`, `@date-fns/tz` in `@ds/shared` | `todayIn()` for the default lesson date |

## Testing

| AC | Tests |
|---|---|
| AC-1 | Integration: create and list ordered by date desc; default date is Lima's today. Web: form defaults and validation |
| AC-2 | Integration: detail with grouped topics, files, open count. Web: lesson page renders each section |
| AC-3 | Integration: patch any field; delete removes rows and R2 objects, keeps topics; R2 failure deletes nothing. Web: confirm names the file count |
| AC-4 | Shared: `validateUpload` per extension and size. Integration: API rejects too. Web: Spanish rejection message, one progress bar per file |
| AC-5 | Integration: presign returns an R2 URL; confirm fails when the object is missing or its size differs; no route accepts file bytes |
| AC-6 | Integration: a generated Guitar Pro fixture (alphaTex → alphaTab's GP7 exporter) and a committed tiny docx end `done` with text and meta; PDF and image end `not_applicable` with SHA-256 |
| AC-7 | Integration: a corrupt file ends `failed`; a parser thread that loops ends `timeout`; one that over-allocates ends `out_of_memory`; the worker keeps processing; retry re-queues. Web: "No se pudo leer el contenido" and "Reintentar" |
| AC-8 | Web, with alphaTab mocked: Tab-only default, notation toggle, zoom saved per device, no player. Manual check on the iPhone |
| AC-9 | Integration: `/open` redirects with the right disposition and a 300 s expiry. Web: PDF opens in a new tab, docx text plus download, image inline |
| AC-10 | Integration: each call returns a new URL; both routes need a session |
| AC-11 to AC-14 | Shared schema units. Integration: create, list with filters, detail, any status change, cycle rejected. Unit: `wouldCreateCycle`. Web: grouped list with Archivados collapsed, form, status change, cycle message |
| AC-15 | Integration: link replace, duplicate rejected, foreign topic rejected. Web: combobox links an existing topic or creates one inline |
| AC-16, AC-17 | Integration: create from a lesson, a topic or globally; answer and dismiss. Web: dialog and the latest-lesson list |

## Risks and mitigations

- **alphaTab may not parse in Node.** T1 is a spike that proves it in the worker thread before anything depends on it. Fallback: meta only from alphaTab's lighter importer, and a smaller text format.
- **alphaTab bundle and fonts are large.** The viewer route is lazy-loaded; precache raised to 4 MB.
- **R2 CORS must allow PUT with `content-type`, from both origins.** Covered by 001's manual setup; I'll verify it with real R2 in T17.
- **Parser memory.** It's bounded by the 128 MB thread limit, plus 25 MB of buffered bytes in the worker (heap 160 MB).
- **HEIC.** Stored as-is; non-Safari browsers get a download link.

## Deviations from the spec

1. `GET /api/files/:id/open` (302) next to `/url`, because iOS blocks `window.open` after an `await`.
2. Confirm sets `not_applicable` right away for PDF and images. The job still computes SHA-256.
3. CSP adds the R2 origin and `blob:` workers.
4. The api gets a send-only pg-boss to queue jobs, and its pool drops from 5 to 4.
5. `lesson_topics` uses a composite primary key, not a UUID.
6. Topics can be deleted only without lesson links (Carlos).
7. Markdown is rendered with `react-markdown` (Carlos).
8. Native `<select>` elements instead of Radix Select: the iPhone shows its wheel picker, which is quicker one-handed at the stand.
9. An optional `R2_ENDPOINT` setting, for an EU-jurisdiction bucket or a local S3-compatible server (MinIO was used to check uploads, extraction and the tab viewer end to end in a real browser).
10. The tab viewer draws in light colours on the dark card and hides the tuning label; alphaTab's "rendered by alphaTab" attribution stays.
11. Missing files (paths with an extension) now answer 404 instead of the app's `index.html`, so a wrong asset path fails loudly.
