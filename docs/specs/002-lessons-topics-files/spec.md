# 002 Lessons, topics and files

**Status:** Approved
**Depends on:** 001

## Why

The lesson is the source of everything Carlos practices. This spec lets him record each Thursday lesson with the teacher's files and turn it into topics that outlive the lesson. Topics are what 003 practices and 006 plans. It also covers questions for the teacher, noted during practice and reviewed before class.

Everything here is manual. Claude drafting arrives in 005, but the data shapes here must already fit it.

## Scope

**In:**
- **Lessons:** create, list, view, edit, delete.
- **Files:** attach Guitar Pro, PDF, Word and image files to a lesson. Upload goes directly to R2, then the server extracts content in the background.
- **Viewers:** Guitar Pro files render in the browser (tab staff); PDFs open in Safari's viewer; Word shows the extracted text; images show inline.
- **Topics:** create, list, view, edit, change status, set parent, link to lessons.
- **Teacher questions:** create, list open ones, answer or dismiss.

**Out:** practice sessions and anything derived from them (003), Claude drafting (005), Telegram (007), search across files.

## User stories

- As Carlos, after Thursday's class I want to create the lesson on my laptop, paste my notes, drop in the teacher's files and link the topics it introduced or extended, in under five minutes.
- As Carlos, at the music stand I want to open the latest lesson on my iPhone and read the tab without downloading anything.
- As Carlos, I want topics like "Modo dórico" and "Tríadas de dórico" (a child of it) to exist independently of lessons, with practice points, success criteria and a target BPM.
- As Carlos, I want to note a question for the teacher whenever it comes up, and see the open ones before class.

## Acceptance criteria

**Lessons**
- **AC-1** I can create a lesson with date (default today, Lima), title (required), notes (markdown), summary, practice points (a list), and homework. It appears at the top of `/lessons`, which is ordered by date descending.
- **AC-2** The lesson page shows all fields, linked topics grouped by relation (introduced, extended, reviewed), files, and the open teacher questions count, with a link to them.
- **AC-3** I can edit any field. Deleting a lesson asks for confirmation, then deletes its file rows and their R2 objects, and unlinks its topics (topics are kept).

**Files**
- **AC-4** I can attach files by drag-and-drop or the file picker on the laptop, and with the file picker on the iPhone. Accepted extensions are `.gp .gpx .gp5 .gp4 .gp3 .pdf .docx .jpg .jpeg .png .webp .heic`, up to 25 MB each.
  - Other types or larger files are rejected before upload with a Spanish message naming the reason.
  - Several files can upload at once, each with its own progress bar.
- **AC-5** Upload goes browser → R2 through a presigned PUT URL. The API never receives the file bytes. After upload, the file row becomes `uploaded` only if the R2 object exists and its size matches.
- **AC-6** Within a minute of upload, Guitar Pro and docx files show `extraction_status` `done`, with `extracted_text` populated and, for Guitar Pro, `meta` (title, artist, tempo, time signatures, tunings, tracks, bar count). PDFs and images are `not_applicable`.
- **AC-7** A file that fails to parse (corrupt or unsupported) ends as `failed` with a short error. It stays downloadable, shows "No se pudo leer el contenido" with a "Reintentar" button, and never crashes the worker. The parser runs in a worker thread with a 60-second timeout and a 128 MB heap cap.
- **AC-8** A Guitar Pro file opens in an in-app viewer powered by alphaTab.
  - It shows only the tab staff by default, with a toggle to add standard notation.
  - Zoom is adjustable (− / +) and remembered per device.
  - On an iPhone (390 px wide) the tab is readable without pinch-zoom.
  - There is no audio player.
- **AC-9** A PDF opens in a new tab through a presigned GET URL valid for 5 minutes. Word files show the extracted text with a download button. Images show inline and open full-size on tap.
- **AC-10** File URLs are never public or permanent. Every view or download requests a fresh presigned URL from an authenticated endpoint.

**Topics**
- **AC-11** I can create a topic with:
  - title (required) and category (required, one of the eight in `docs/domain.md`)
  - description (markdown), practice points (list), success criteria, target BPM (20–400, optional)
  - priority (Baja, Normal, Alta), default block minutes (5–60), and parent topic (optional)

  New topics start as `new`.
- **AC-12** `/topics` lists topics grouped by status (Nuevos, Activos, Mantenimiento; Archivados collapsed), filterable by category. Each row shows category, priority and parent.
- **AC-13** The topic page shows all fields, its parent and children, the lessons linked to it (with relation), and its open questions. I can change the status to any other status from there.
- **AC-14** A topic can't be its own ancestor. Setting a parent that would create a cycle is rejected with a Spanish message.
- **AC-15** From a lesson, I can link existing topics or create a new topic inline without leaving the page, choosing the relation (Introducido, Ampliado, Repasado). The same topic can't be linked twice to the same lesson.

**Teacher questions**
- **AC-16** I can add a question from a lesson page, a topic page, or a global "+ Pregunta" action. It's linked to the topic when created from a topic.
- **AC-17** Open questions are listed on the most recent lesson's page, under "Para la próxima clase". I can mark each one answered (with the answer text and an optional link to a lesson) or dismissed.

## UX notes

- **Laptop:** the lesson form is a single page. Notes sit on the left and fields on the right on wide screens. The file drop zone is always visible. Topic linking is a combobox with "Crear tema «…»" as the last option.
- **iPhone:** the lesson page is read-first. The title and summary are at the top, then "Archivos" as large tappable rows, then practice points and topics. Editing is possible but not the focus.
- **Extraction status:** a small badge on each file: "Procesando…", "Listo", "No se pudo leer". No page reload needed; TanStack Query refetches while any file is `pending`.
- **Empty states:** "Aún no hay clases. Registra la del jueves." and "Aún no hay temas."
- **Deletes:** confirmation dialogs name what will be deleted ("Se eliminarán 3 archivos").

## Data

Per `docs/domain.md`: `lessons`, `lesson_files`, `topics`, `lesson_topics`, `teacher_questions`.
- Indexes on `(user_id, date desc)` for lessons and `(user_id, status)` for topics.
- `lesson_topics` is unique on `(lesson_id, topic_id)`.

## API sketch

- `GET /api/lessons`, `POST /api/lessons`, `GET|PATCH|DELETE /api/lessons/:id`
- `PUT /api/lessons/:id/topics` `[{ topicId, relation }]`
- `POST /api/lessons/:id/files` `{ name, mime, size }` → `{ fileId, uploadUrl }` (row created as `uploading`)
- `POST /api/files/:id/confirm` → the row, with extraction queued
- `GET /api/files/:id/url?disposition=inline|attachment` → `{ url }`
- `POST /api/files/:id/retry`, `DELETE /api/files/:id`
- `GET /api/topics?status=&category=`, `POST /api/topics`, `GET|PATCH /api/topics/:id`
- `GET /api/questions?status=open`, `POST /api/questions`, `PATCH /api/questions/:id`

Worker jobs:
- `file.extract` `{ fileId }`
- `file.cleanup-stale`, hourly: deletes rows stuck in `uploading` for more than 1 hour, along with any R2 object they left behind

## Guitar Pro extraction format

The text sent to Claude later should be compact and readable. For example:

```
Title: Tríadas dórico | Artist: — | Tempo: 90 | Time: 4/4 | Bars: 16
Track 1 "Guitarra" tuning E2 A2 D2 G3 B3 E4
Section A
Bar 1: 8th [s3:7 s2:6 s1:5] [s3:9 s2:7 s1:7] …
```

The plan settles the exact format. Cap `extracted_text` at 40,000 characters and note when it's truncated.

## Edge cases

- **Generic MIME types:** iOS may report `application/octet-stream` for `.gp` files. Validate by extension at upload and by content (alphaTab load or magic bytes) during extraction.
- **HEIC images:** accepted and stored as-is. Safari displays them natively; browsers that can't show a download link instead.
- **Duplicate files:** the same file uploaded twice to one lesson is allowed, but the UI warns if the SHA-256 matches an existing file on that lesson. The SHA-256 is computed during extraction; for PDFs and images it's computed by the same job without parsing.
- **Deleting a topic:** not allowed once it's linked to practice blocks (from 003). Archive it instead. Before 003, topics with no links can be deleted.
- **Lesson date:** it's a `date` column. Changing it doesn't touch files.

## Open questions

- None.
