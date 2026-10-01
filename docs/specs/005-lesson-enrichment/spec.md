# 005 Lesson enrichment with Claude

**Status:** Approved
**Depends on:** 002

## Why

After a lesson Carlos has rough notes and a handful of files from the teacher. Turning those into a clean summary, practice points, homework and well-defined topics is the slow part of capture. Claude can draft all of it from the notes and files in under a minute; Carlos reviews, edits and accepts what he wants. 006 (weekly planner) and 007 (Telegram inbox) reuse the same draft, review and cost-logging machinery.

## Scope

**In:**
- **Lesson enrichment:** from a lesson's notes, files and the existing topics, Claude drafts the title, summary, practice points, homework, suggested topics (new or existing, with a relation), answers to open teacher questions, and new questions for the teacher spotted in the notes.
- **Review screen:** accept per section, edit before accepting, discard, or regenerate with an optional instruction.
- **"Mejorar tema":** drafts a better description, practice points and success criteria for one topic.
- **Draft lessons:** a quick capture path ("Guardar y completar con Claude") that saves the lesson as `draft` until its review is accepted.
- **Cost control:** every call logged in `llm_runs`; spend this month in Ajustes; a monthly budget that blocks new calls once reached.

**Out:** weekly plans (006), Telegram capture (007), weekly reviews (008), chat or free-form prompting, audio or video files, automatic acceptance of anything.

## User stories

- As Carlos, after a lesson I want to type my rough notes, attach the teacher's files and tap one button, so a clean lesson write-up is ready to review a minute later.
- As Carlos, I want Claude to propose the topics the lesson introduced or extended, matched against the ones I already have, so I don't create duplicates.
- As Carlos, I want to accept the summary but rewrite the homework, or drop one suggested topic, without losing the rest.
- As Carlos, I want to know what this costs each month and never be surprised by a bill.

## Acceptance criteria

**Starting a draft**
- **AC-1** The lesson page has "Completar con Claude". It queues an enrichment job and shows a waiting state ("Claude está leyendo la clase…") that survives a reload. Only one enrichment can be pending per lesson; the button is disabled while one runs.
- **AC-2** The new-lesson form has "Guardar y completar con Claude" next to "Guardar clase". It saves the lesson with status `draft` (only the date is required, title defaults to "Clase del {fecha}") and starts enrichment. Draft lessons show a "Borrador" badge in lists and on their page.
- **AC-3** The input to Claude contains: the lesson date, title and raw notes; Guitar Pro and docx files as their extracted text (with Guitar Pro meta); PDFs as documents; JPEG, PNG and WebP images as images; the list of existing non-archived topics (id, title, category, status, parent); and the open teacher questions. Files that can't be sent (HEIC, `other`, failed extraction, still extracting, or over the size limits) are skipped and listed in the draft as "No se incluyó: {nombre}".
- **AC-4** Claude's output is parsed with a shared Zod schema. Output that fails validation is retried once; if it fails again the draft ends as `failed` with "No se pudo generar el borrador. Inténtalo de nuevo." and a "Reintentar" button.

**Review**
- **AC-5** When the draft is ready, the lesson page shows the review with sections: Título, Resumen, Puntos de práctica, Tarea, Temas sugeridos, Respuestas a preguntas, Preguntas sugeridas. Each section shows the proposal and, when the lesson already has a value, the current value, with "Aceptar" and "Descartar". Proposals are editable before accepting.
- **AC-6** Suggested topics are a list. Each item is either an existing topic (title, proposed relation) or a new topic (title, category, optional parent, description, practice points, success criteria, target BPM, relation). Each item can be edited, checked or unchecked. Accepting creates the checked new topics and links all checked topics to the lesson with their relation. Suggested ids that don't belong to an existing topic of Carlos's are dropped before review.
- **AC-7** Suggested answers are only for questions that were open when the draft was made. Accepting an answer marks the question `answered` with that text and this lesson. A question answered or dismissed in the meantime is shown as already resolved and can't be accepted.
- **AC-8** "Preguntas sugeridas" lists questions for the teacher that Claude spotted in the notes (doubts, "preguntar al profe…"), each optionally tied to a topic from the draft. Each can be edited, checked or unchecked. Accepting creates the checked ones as open questions, linked to their topic when it exists or was created from this draft. A suggestion that duplicates an open question (case-insensitive) is dropped.
- **AC-9** "Aceptar todo" accepts every section still pending. When no section is pending, the draft becomes `accepted` (or `discarded` if nothing was accepted) and a `draft` lesson becomes `final`.
- **AC-10** "Regenerar" takes an optional instruction ("más breve", "enfócate en el ritmo"), discards the pending draft and starts a new one. Sections already accepted stay accepted.
- **AC-11** Nothing Claude writes reaches the lesson, topics or questions until Carlos accepts it. Discarding a draft leaves the lesson exactly as it was.

**Mejorar tema**
- **AC-12** The topic page has "Mejorar con Claude". It drafts description, practice points and success criteria from the topic, its parent and children, the lessons linked to it (summary and practice points) and its recent practice (last clean BPM, ratings, notes). The review accepts each field separately, with the same editing as AC-5.

**Cost**
- **AC-13** Every call is logged in `llm_runs` with feature, model, input, output and cache-read tokens, cost in USD, latency, status and error code. Prompts, responses and file contents are never logged.
- **AC-14** Ajustes shows "Claude este mes: $X.XX de $Y" (calendar month in Lima) and the number of calls.
- **AC-15** When this month's spend has reached `LLM_MONTHLY_BUDGET_USD`, starting a draft answers with "Se alcanzó el presupuesto de Claude de este mes." and no call is made.
- **AC-16** When `ANTHROPIC_API_KEY` isn't set, the app runs normally, Claude buttons are hidden, and Ajustes says "Claude no está configurado".

## UX notes

- **Waiting:** a calm card in place of the review with a spinner and "Claude está leyendo la clase…", polling every 2 seconds. Typical wait 20–60 seconds. Leaving and coming back keeps the state.
- **Review on the laptop:** two columns per section (actual / propuesta) at 1024 px and up. On the iPhone, stacked, proposal first, current value collapsed under "Ver actual".
- **Review on the iPhone:** big "Aceptar" and "Descartar" per section, a sticky bottom bar with "Aceptar todo" and "Regenerar".
- **Draft lessons:** "Borrador" badge in the lesson list and on Hoy's latest lesson. A draft lesson still counts as the latest lesson for Hoy and practice cycles.
- **Errors:** failed drafts show the Spanish message and "Reintentar". Budget and configuration messages are shown in place of the button.
- **Cost:** shown only in Ajustes, never on the lesson page.
- All copy in Spanish; Claude is instructed to write in Spanish (es-PE) with musical terms as Carlos uses them.

## Data

See `docs/domain.md` → LLM run and draft.
- New `llm_runs`: `feature`, `model`, `input_tokens`, `output_tokens`, `cache_read_tokens`, `cost_usd`, `latency_ms`, `status` (`ok` | `error`), `error`, `subject_type`, `subject_id`.
- New `llm_drafts`: `kind` (`lesson_enrichment` | `topic_improve`), `subject_type`, `subject_id`, `payload` (jsonb, Zod-validated), `review` (jsonb: per-section state `pending` | `accepted` | `discarded`, plus Carlos's edits), `instruction`, `skipped_files`, `status` (`queued` | `running` | `pending` | `accepted` | `discarded` | `failed`), `llm_run_id`.
  - `queued` and `running` extend the domain's `pending` | `accepted` | `discarded` | `failed` so the waiting state survives reloads.
- `lessons.status` already exists (`draft` | `final`).

## API sketch

- `POST /api/lessons/:id/enrich` `{ instruction? }` → 202 `{ draftId }`; 409 `llm.running` if one is running; 409 `llm.budget` when over budget; 503 `llm.disabled` when unconfigured.
- `POST /api/lessons` gains `enrich: true` (creates a `draft` lesson and queues enrichment).
- `POST /api/topics/:id/improve` → 202 `{ draftId }`.
- `GET /api/drafts/:id` → status, payload, review state, skipped files.
- `GET /api/lessons/:id` and `GET /api/topics/:id` include the latest draft id and status.
- `POST /api/drafts/:id/sections/:section` `{ action: accept | discard, value? }` → applies or discards one section; `value` carries Carlos's edits.
- `POST /api/drafts/:id/accept-all`, `POST /api/drafts/:id/discard`.
- `GET /api/settings` gains `llm: { enabled, monthSpendUsd, monthCalls, budgetUsd }`.
- Worker queues: `llm.lesson-enrich`, `llm.topic-improve`.

## Edge cases

- The lesson is edited while a draft is pending: accepting a section overwrites only that field; the review shows the current value at review time, not at draft time.
- A topic suggested as existing is archived or deleted before review: archived stays linkable, deleted is dropped.
- A new topic's suggested parent is another new topic in the same draft: allowed, created in order.
- A new topic's title matches an existing topic (case-insensitive): shown as the existing topic instead.
- Total attachments over the limit (planned: 20 MB and 100 PDF pages per call): the largest files are skipped first and listed.
- Anthropic rate limit or 5xx: retried by pg-boss with backoff (3 attempts); the run is logged each time.
- The lesson is deleted while its draft runs: the job finds no lesson and ends the draft as `discarded`.
- Month boundary: spend resets on the 1st in America/Lima.

## Decisions (Carlos, 2026-10-01)

- **Draft lessons from the web:** keep the quick-capture path (AC-2).
- **Monthly budget:** `LLM_MONTHLY_BUDGET_USD` defaults to 10, on top of the spend limit on the Anthropic API key.
- **Models:** Sonnet 5.5 for lesson enrichment and "Mejorar tema" (D-10). Both configurable through `LLM_MODEL_DEFAULT`.
- **Suggested questions:** Claude also proposes new teacher questions (AC-8).
