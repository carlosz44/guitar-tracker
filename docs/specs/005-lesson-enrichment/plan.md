# 005 Lesson enrichment with Claude: plan

**Spec:** ./spec.md · **Status:** Done

### Approach

**Flow** (architecture.md, "LLM features"):
1. The API checks the configuration, budget and running drafts, then inserts an `llm_drafts` row (`queued`) and queues a job.
2. The worker marks the draft `running`, builds the input, calls Claude with structured output, post-processes the result, and stores the payload (`pending`). Every call is logged in `llm_runs`.
3. The web polls `GET /api/drafts/:id` every 2 s while the draft is `queued` or `running`, then shows the review.
4. Each accept or discard is one API call that applies that section in a transaction. Nothing is written to lessons, topics or questions before then (AC-11).

**Server: `apps/server/src/llm/`**
- **`client.ts`**
  - An `LlmClient` interface: `generate({ feature, model, system, content, schema, maxTokens })` returns `{ output, usage, model, latencyMs }`.
  - The real client uses `@anthropic-ai/sdk` `client.messages.parse()` with `output_config: { format: zodOutputFormat(schema) }`, so output is guaranteed to be JSON matching the schema. The result is still re-parsed with the full shared Zod schema.
  - Tests use a scripted fake client and never call the network.
- **`pricing.ts`:** a per-model table of $/MTok (input, output, cache read) and `costUsd(model, usage)`. An unknown model is priced like the most expensive known one, so the budget can't be under-counted. The prices are checked against Anthropic's pricing page during T3.
- **`usage.ts`:**
  - `recordRun(...)`;
  - `monthSpend(db, userId, tz, now)` sums `cost_usd` over the current calendar month in America/Lima;
  - `assertCanCall` raises `llm.disabled` or `llm.budget`.
- **`attachments.ts`:** reads the lesson's files.
  - Guitar Pro and docx are sent as their extracted text, plus Guitar Pro meta.
  - PDFs go as `document` blocks and JPEG, PNG and WebP as `image` blocks, streamed from R2 into memory and base64-encoded.
  - **Limits:** 20 MB of binary files in total and 5 MB per image. The largest files are dropped first.
  - **Skipped and listed with a reason:** HEIC, `other`, extraction that's failed or still pending, and files over the limits.
- **`lesson-enrichment.ts`**
  - **Prompt:** a system prompt in English that asks for Spanish (es-PE) output. The user content holds the lesson, attachments, existing topics and open questions, plus the instruction when regenerating.
  - **Post-processing:**
    - drops existing-topic ids that aren't Carlos's;
    - turns a new topic whose title matches an existing one (case-insensitive) into that existing topic;
    - drops answers to questions that aren't open;
    - drops suggested questions that duplicate an open one.
  - **Failures:**
    - A validation failure is retried once in-process; the second failure marks the draft `failed` (AC-4).
    - Anthropic 429, 5xx, overloaded and connection errors are retried by the SDK (`maxRetries: 3`, honoring `retry-after`). The pg-boss job doesn't retry; when the SDK gives up the draft is marked `failed` with the error code. `messages.create` is used instead of `messages.parse`, so tokens are logged even when the output is invalid.
    - A deleted lesson marks the draft `discarded`.
- **`topic-improve.ts`:**
  - **Input:** the topic, its parent and children, its linked lessons' summary and practice points, and the last 10 blocks (clean BPM, rating, notes).
  - **Output:** description, practice points and success criteria.
- **`review.ts`:** `applySection(tx, userId, draft, section, action, value?)`.
  - `value` carries Carlos's edits and is validated with the section's shared schema.
  - **Sections:**

    | Section | What accepting does |
    |---|---|
    | `title`, `summary`, `practicePoints`, `homework` | Updates that field on the lesson |
    | `topics` | Creates the checked new topics, parents first (a parent may be another new topic in the draft), then upserts lesson links with their relation. Reuses the topic and link logic in `topics/routes.ts` and `lessons/routes.ts`, moved into shared functions. |
    | `answers` | Marks checked questions answered, unless they're no longer open |
    | `questions` | Creates the checked questions, linked to their topic |
    | Topic fields (`topic_improve`) | Updates `description`, `practicePoints`, `successCriteria` |

  - When no section is still `pending`, the draft becomes `accepted` (or `discarded` if nothing was accepted), and a `draft` lesson becomes `final`.
- **`routes.ts`:** mounted in `app.ts`, using the existing `idParam` and `validate` helpers.
  - The start routes for enrichment and "Mejorar tema"; start uses the shared `startDraft` in `drafts.ts`.
  - The draft routes: get one, accept or discard a section, accept all, discard.
  - `GET /api/llm/usage`.
- **Changes to existing code:**
  - `POST /api/lessons` accepts `enrich: true`. The lesson is created as `draft` and enrichment starts in the same transaction.
  - `GET /api/lessons/:id` and `GET /api/topics/:id` gain `draft: { id, status } | null`, the latest non-discarded draft.
  - `GET /api/me` gains `llm: { enabled }`, so the web can hide the buttons (AC-16).
- **Jobs:**
  - `QUEUES.lessonEnrich` (`llm.lesson-enrich`) and `QUEUES.topicImprove` (`llm.topic-improve`) are added to `jobs/boss.ts` and `JobData`.
  - The worker registers them with `localConcurrency: 1`, and the api's `ensureQueue` creates them.
  - The worker builds the client only when `ANTHROPIC_API_KEY` is set.
- **Config** (`config.ts`, `.env.example`, `deploy.yml` secrets, `compose.prod.yml`, workflow tests):
  - `ANTHROPIC_API_KEY`, optional, for api and worker;
  - `LLM_MODEL_DEFAULT`, default `claude-sonnet-5-5`;
  - `LLM_MONTHLY_BUDGET_USD`, default 10, for api and worker.
  - `LLM_MODEL_FAST` is left for 004, when parsing the quick log is the first job to use it.

**Shared (`packages/shared/src/llm.ts`)**
- **Output schemas**, kept flat so they work with structured outputs: enums and nullable fields, no unions.
  - `lessonEnrichmentOutputSchema`:
    - `title`, `summary`, `practicePoints`, `homework`;
    - `topics`: `{ kind: existing|new, existingTopicId, title, category, parentRef, description, practicePoints, successCriteria, targetBpm, relation }`;
    - `answers`: `{ questionId, answer }`;
    - `questions`: `{ text, topicRef }`.
  - `topicImproveOutputSchema`.
- **Review schemas:** `draftSectionSchema` and per-section value schemas reusing `practicePointsSchema` and the topic and question field schemas.
- **Constants:** `LLM_DRAFT_STATUSES` and `llmErrors` (`llm.disabled`, `llm.budget`, `llm.running`, `draft.notPending`, `draft.resolved`), added to `ErrorKey` and to `es.validation`.

**Web**
- **`lib/queries.ts`:** `draftQuery(id)`, with `refetchInterval` 2 s while queued or running (following the existing `refetchInterval` use for file extraction), and `llmUsageQuery`.
- **`components/llm/`**
  - **`draft-status.tsx`:** waiting card, failed card with "Reintentar", and the budget and disabled messages.
  - **`section-card.tsx`:** current value and proposal side by side at 1024 px and up; stacked on the iPhone with "Ver actual" collapsed. The proposal is editable, with "Aceptar" and "Descartar".
  - **`lesson-review.tsx`:**
    - all sections;
    - topic and question lists with checkboxes and inline edit;
    - a sticky bar with "Aceptar todo" and "Regenerar", which opens a dialog for the optional instruction.
  - **`topic-review.tsx`:** the three fields.
- **Lesson page:** "Completar con Claude" next to Editar. The draft status or review appears above the sections, and a "Borrador" badge shows on draft lessons.
- **Lesson list and Hoy:** the "Borrador" badge.
- **New-lesson form:** "Guardar y completar con Claude". It needs only the date; an empty title becomes `es.lessons.defaultTitle(fecha)`.
- **Topic page:** "Mejorar con Claude" and the review.
- **Ajustes:** "Claude este mes: $X.XX de $Y · N llamadas", or "Claude no está configurado".

**Added after the first build (AC-17, AC-18)**
- `POST /api/lessons` takes `draft: boolean` to save a `draft` lesson without starting enrichment yet. The web uploads the files, then calls `POST /api/lessons/:id/enrich`.
- The enrichment job checks the lesson's files before claiming the draft. While any is `uploading`, or a Guitar Pro or Word file is still `pending` extraction, it re-queues itself 5 seconds later, up to 24 times (2 minutes), then runs with what's ready.
- The prompt includes the lesson's current summary, practice points and homework, with the rule to keep every fact and fix typing errors.
- `useUploads` takes the lesson id per call, and its upload list becomes a shared component used by the lesson page and the new-lesson form.

### Schema changes (migration `0003_llm`)

Every table has `user_id`, timestamps and UUIDv7 ids.

| Table | Columns | Constraints and indexes |
|---|---|---|
| `llm_runs` | `feature`, `model`, `input_tokens`, `output_tokens`, `cache_read_tokens`, `cost_usd numeric(10,6)`, `latency_ms`, `status` (ok/error), `error`, `subject_type`, `subject_id` | CHECKs on feature and status; index `(user_id, created_at)` |
| `llm_drafts` | `kind` (lesson_enrichment/topic_improve), `subject_type` (lesson/topic), `subject_id uuid`, `payload jsonb null`, `review jsonb` (section → `{ state, value? }`), `instruction`, `skipped_files jsonb` (`[{ name, reason }]`), `status` (queued/running/pending/accepted/discarded/failed), `error`, `llm_run_id` (set null) | CHECKs; index `(subject_type, subject_id, created_at desc)`; **one active draft per subject**: partial unique index on `(user_id, subject_type, subject_id)` where status is queued, running or pending |

`subject_id` has no foreign key, since it points to either a lesson or a topic. Deleting a lesson or topic deletes its drafts in the same route.

### API changes

All routes need a session.

| Route | Payload | Answers |
|---|---|---|
| `POST /api/lessons/:id/enrich` | `{ instruction? }` | 202 `{ draftId }`; 409 `llm.running`; 409 `llm.budget`; 503 `llm.disabled`. Regenerating discards the pending draft first. |
| `POST /api/topics/:id/improve` | — | 202 `{ draftId }`, same errors |
| `POST /api/lessons` | adds `enrich?: boolean` | 201 `{ lesson, draftId? }` |
| `GET /api/drafts/:id` | — | `{ id, kind, status, error, payload, review, skippedFiles, current }`. `current` holds the subject's current values for the review. |
| `POST /api/drafts/:id/sections/:section` | `{ action: accept \| discard, value? }` | the updated draft; 409 `draft.notPending`, 409 `draft.resolved` |
| `POST /api/drafts/:id/accept-all`, `POST /api/drafts/:id/discard` | — | the updated draft |
| `GET /api/llm/usage` | — | `{ enabled, monthSpendUsd, monthCalls, budgetUsd }` |

### New dependencies

| Package | Why |
|---|---|
| `@anthropic-ai/sdk` (server) | Claude API with Zod structured output (`messages.parse`, `zodOutputFormat`). Already listed in architecture.md. |

### Testing

| AC | Tests |
|---|---|
| AC-1 | Integration: enrich queues a job, 409 while one runs; web: button, waiting state that survives a reload |
| AC-2 | Integration: `enrich: true` creates a draft lesson and a draft; web: second button, default title, badge |
| AC-3 | Unit: attachments (text, PDF, image, HEIC and over-limit skipped); integration: the job's input built from the fake client's captured request |
| AC-4 | Integration: invalid output, then a retry, then `failed`; web: "Reintentar" |
| AC-5 | Web: sections, current against proposal, edit before accepting |
| AC-6 | Integration: new and existing topics, unknown ids dropped, a parent among new topics, duplicate titles matched |
| AC-7 | Integration: answers apply; a question resolved in the meantime is rejected |
| AC-8 | Integration: suggested questions created with their topic; duplicates dropped |
| AC-9 | Integration: accept-all, draft and lesson become final; discarded when nothing was accepted |
| AC-10 | Integration: regenerate discards the pending draft and keeps accepted values |
| AC-11 | Integration: the lesson, topics and questions are unchanged until accepted, and after a discard |
| AC-12 | Integration: topic-improve input and per-field accept; web review |
| AC-13 | Unit: pricing; integration: a run is logged per call, nothing leaks into the logs (logger spy) |
| AC-14 | Integration: monthly spend in Lima across a month boundary; web Ajustes |
| AC-15 | Integration: over budget answers 409, makes no call, and the worker also refuses |
| AC-16 | Config test: no key; integration: 503 `llm.disabled`; web: buttons hidden, Ajustes message |

No e2e for 005: the production api would need a fake Claude, and test hooks don't belong in production code. A manual run with a real key covers the end to end.

### Risks and mitigations

- **Worker memory (384 MiB):** at most 20 MB of attachments, about 27 MB in base64, and one job at a time.
- **Structured-output schema limits:** the output schema stays flat, and constraints Claude can't enforce (lengths, ranges) are checked by the full Zod schema after parsing, with one retry.
- **PDF page limits:** an API 400 for too many pages ends as `failed` with a clear error code. The size cap makes this rare.
- **Prices change:** the table lives in one file, and an unknown model is priced at the most expensive known rate.
- **Data leaving the VPS:** only to Anthropic's API. Nothing is logged except ids, sizes, tokens and durations.

### Deviations from the spec and domain

1. `llm_drafts.status` gains `queued` and `running`, plus `review`, `instruction`, `skipped_files` and `error` columns (recorded as D-18 and in domain.md).
2. `LLM_MODEL_FAST` is deferred to 004.
3. No Playwright coverage for 005.

### Verification

1. `pnpm test`, `pnpm typecheck`, `pnpm lint` and `pnpm e2e` (unchanged) all pass; every AC-1 to AC-16 is named in a test.
2. Local run with a real `ANTHROPIC_API_KEY` in `apps/server/.env`:
   - Create a lesson with notes, one PDF, one Guitar Pro file and one photo. Tap "Completar con Claude" and wait for the review.
   - Accept some sections, edit one, discard one, then regenerate with an instruction.
   - Check that topics and questions are created and linked, and that the lesson becomes final.
   - Use "Mejorar con Claude" on a topic.
   - Ajustes shows the month's spend; the `llm_runs` row matches the Anthropic console usage.
   - Worker logs show no prompt or file content.
3. Set `LLM_MONTHLY_BUDGET_USD=0.01`: starting a draft is refused. Remove the key: the buttons are hidden.
4. 390 px and desktop screenshots of the waiting state, review and Ajustes.
