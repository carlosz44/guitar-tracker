# 006 Weekly planner: plan

**Spec:** ./spec.md · **Status:** Approved

### Approach

**The plan itself is the draft.** A `weekly_plans` row starts as `draft`. Carlos edits it, then accepts it (`active`). Nothing Claude writes is final until he accepts, which keeps the guardrail. No `llm_drafts` row is needed: Claude's adjustment is applied to the draft plan, and its call is logged in `llm_runs` (feature `weekly_plan`).

**Flow**
1. `POST /api/plans` builds a deterministic plan synchronously and stores it as `draft`, with `source: rules`.
   - **With Claude available:** the plan gets `llm_status: queued` and a `llm.weekly-plan` job.
   - **Without Claude:** `llm_status` is `skipped`, with the reason (`llm.disabled`, `llm.budget`) shown on the page (AC-5).
2. **The worker job:**
   - sends the deterministic plan, the scores and the context to Claude;
   - validates the answer, and when valid replaces the targeted days' items and notes (`source: claude`);
   - when invalid, keeps the deterministic items and sets `llm_status: rejected`, so the page says Claude's version was discarded (AC-4).
3. The web polls the plan every 2 s while `llm_status` is `queued` or `running`. Editing is locked during that time, so Claude's result can't clobber edits.
4. **Scoped regeneration:** "Regenerar este día", "Regenerar la semana" and "Replanificar lo que queda" rebuild the targeted days deterministically and queue the same job, scoped to those dates. Edits to other days are kept (AC-8, AC-11).

**Server: `apps/server/src/planner/`**
- **`rules.ts`** (pure, time injected). It reuses `cycleStart`, `addDays`, `isoWeekday` and `splitMinutes` from `practice/rules.ts`.
  - **`dayTarget(settings, date)`:** `day_targets[weekday-1] ?? daily_target_minutes`.
  - **`scoreTopics(topics, context)`:**
    - priority weight;
    - maintenance ×0.3;
    - plus days since last practiced, capped at 14;
    - plus a lesson boost for topics *introduced* or *extended* in the cycle's lesson;
    - plus a low-rating boost when the average of the last 3 ratings is under 3.

    Archived topics are excluded.
  - **`buildDays(scores, days, constraints)`:**
    - each day gets a 5-minute warm-up, then 1 topic if the rest is 15 minutes or less, 2 up to 40, otherwise 3;
    - topics are picked greedily by score, with penalties for use already this week and for the previous day;
    - lesson topics are placed at least twice;
    - no topic on more than 5 days, none twice on the same day;
    - minutes are split with `splitMinutes`.
  - **`validatePlanDays(days, ownedTopicIds, targets)`:**
    - topic ids exist and aren't archived;
    - each day's minutes add up to its target;
    - at most 3 topics per day, in 5-minute steps (AC-4).
  - **`replanInput(...)`:** counts the topics actually practiced so far this cycle, so topics planned on missed days rank higher (AC-11).
- **`queries.ts`:**
  - recent ratings per topic (last 3 completed blocks);
  - the cycle's lesson and its *introduced* and *extended* links;
  - the plan with its days and items;
  - per-day progress: minutes from `dayTotals` (003), and each item marked practiced when a completed block for that topic falls on the day.
- **`service.ts`:**
  - `buildPlan`, `replaceDays`, `regenerate(scope)`, `accept`, `replanRest`;
  - one draft per cycle (a new build replaces the existing draft); one active plan per cycle (accepting marks the previous one `replaced`).
- **`routes.ts`** (mounted at `/plans`):
  - `POST /`, `GET /current`, `GET /:id`;
  - `PUT /:id/days`, taking changed days, so moving a block is a single call;
  - `POST /:id/days/:date/regenerate`, `POST /:id/regenerate`, `POST /:id/replan`, `POST /:id/accept`.
- **`weekly-plan-job.ts`:** reuses `generate()`, `assertCanCall()` and `recordRun()` from `llm/`.
  - **Prompt:** in English, asking for Spanish (es-PE) notes. It contains the targeted days with their deterministic items and targets, the scores with short reasons, the topics (title, status, priority, target BPM, last clean BPM, rating trend), the cycle lesson's summary and practice points, and what's been practiced this cycle.
  - **Output schema:** flat, in `packages/shared/src/plans.ts`: `{ weekNote, days: [{ date, focusNote, items: [{ topicId | null, label | null, minutes }] }] }`.
  - **Registration:** in `jobs/llm-jobs.ts`, with `QUEUES.weeklyPlan` added in `jobs/boss.ts`.

**Changes to existing code**
- **Settings:**
  - `user_settings.day_targets smallint[]`, nullable, where null means "every day uses `daily_target_minutes`";
  - `updateSettingsSchema` gains an optional `dayTargets`, as 7 values or null;
  - `toSettings` returns `dayTargets`.
- **Today:**
  - `GET /api/today` uses the active plan's day when one covers today: its blocks and focus note replace `suggestion`, and its target becomes today's target. Otherwise the target is `dayTarget(settings, today)`. It also returns `plan: { id, dayId, focusNote } | null`.
  - `streak` and `isMet` use the per-day snapshots from 003, so nothing else changes.
- **Sessions:**
  - `startSessionSchema` gains an optional `planDayId`, validated as belonging to Carlos's active plan for today and stored on the session;
  - the session-start snapshot uses the same target as today;
  - manual logs (003) snapshot `dayTarget` for their date.
- **Lessons:** `GET /api/lessons/:id` gains `cyclePlan: { id, status } | null` for the cycle starting at that lesson's date. The web uses it to offer "Planificar la semana" (AC-14).

**Web**
- **Ajustes:** under "Meta diaria", a collapsible "Meta por día" with 7 steppers (L M X J V S D), ±5 each, and "Usar la misma meta todos los días" to reset.
- **`/plan`** (`routes/_app/plan.tsx`, with an optional `?cycle=` search param):
  - **No plan yet:** a "Planificar la semana" button.
  - **Draft:**
    - day cards (stacked on the iPhone, a 7-column grid at 1024 px and up);
    - each day reuses `BlockPlanner` from Hoy, extended with an optional "Mover a…" menu per block (a `moveTargets` prop);
    - per day: target, live total (highlighted when it's over or under), focus note, "Regenerar este día";
    - top bar: week note, "Regenerar la semana", "Aceptar plan".
  - **Active:** today and future days stay editable (AC-10); past days are read-only with progress (AC-13); there's also "Replanificar lo que queda".
  - **While Claude runs:** a waiting banner like 005's, with editing disabled.
- **Hoy:**
  - when a plan covers today, the initial blocks come from it and the focus note shows above them; "Empezar" sends `planDayId`;
  - a "Semana" card links to `/plan`, saying "Sin plan" or showing today's progress against the plan.
- **Lesson page:** a "Planificar la semana" card when `cyclePlan` is null and the cycle hasn't ended (AC-14).

### Schema changes

**Migration `0004_day_targets`**

| Table | Change |
|---|---|
| `user_settings` | `day_targets smallint[]` nullable; CHECK that, when set, it has 7 values, each 10–240 and a multiple of 5 |

**Migration `0005_weekly_plans`.** Every table has `user_id`, timestamps and UUIDv7 ids.

| Table | Columns | Constraints and indexes |
|---|---|---|
| `weekly_plans` | `cycle_start date`, `cycle_end date`, `status` (draft/active/replaced), `week_note`, `rationale`, `source` (rules/claude), `llm_status` (queued/running/done/rejected/failed/skipped), `llm_error`, `llm_run_id` (set null) | CHECKs; partial unique index `(user_id, cycle_start)` where status is draft; partial unique index `(user_id, cycle_start)` where status is active |
| `plan_days` | `plan_id` (cascade), `date`, `target_minutes`, `focus_note` | unique `(plan_id, date)` |
| `plan_items` | `plan_day_id` (cascade), `position`, `topic_id` (null, no action), `label`, `minutes` | CHECK topic or label present; minutes ≥ 5 and a multiple of 5; unique `(plan_day_id, position)` |

`practice_sessions.plan_day_id` gains an FK to `plan_days` (set null).

### API changes

| Route | Payload | Answers |
|---|---|---|
| `PATCH /api/settings` | `{ dailyTargetMinutes?, dayTargets?: number[7] \| null }` | the settings |
| `POST /api/plans` | `{ cycleStart? }` | 201 with the plan |
| `GET /api/plans/current` | `?cycle=` optional | the plan or null, with days, items, progress and `llmStatus` |
| `PUT /api/plans/:id/days` | `{ days: [{ date, items: [{ topicId?, label?, minutes }] }] }` | the plan; 409 `plan.locked` while Claude runs, 409 `plan.pastDay` for past days of an active plan |
| `POST /api/plans/:id/days/:date/regenerate` | — | the plan |
| `POST /api/plans/:id/regenerate` | — | the plan |
| `POST /api/plans/:id/replan` | — | the plan |
| `POST /api/plans/:id/accept` | — | the plan |
| `GET /api/today` | adds `plan` | — |
| `POST /api/sessions` | adds `planDayId?` | — |

### New dependencies

None.

### Testing

| AC | Tests |
|---|---|
| AC-1 | Shared and config: day targets validation; integration: PATCH settings, today's target and the session snapshot use the weekday target; web: Ajustes per-day steppers |
| AC-2 | Integration: build for the current cycle, days and targets, warm-up plus 1–3 topics in 5-minute steps |
| AC-3 | Unit: scorer ordering for each factor; slot builder places lesson topics twice, at most 5 days per topic, never twice on the same day |
| AC-4 | Integration with the fake Claude client: a valid answer is applied with notes; an invalid one (unknown id, wrong sum, 4 topics) is rejected and the deterministic plan kept |
| AC-5 | Integration: disabled and over budget give `skipped` with the reason, and no call is made |
| AC-6 | Web: day cards with target, blocks and note |
| AC-7 | Web: ±5, move, remove, add, live totals and over/under highlight; integration: `PUT days` validation |
| AC-8 | Integration: regenerate one day keeps the other days' edits |
| AC-9 | Integration: accept makes the plan active and the previous one `replaced`, keeping session links |
| AC-10 | Integration: 409 `plan.pastDay` for past days of an active plan |
| AC-11 | Unit: replan ranks topics from missed days higher; integration: past days untouched |
| AC-12 | Integration: today returns plan blocks and note, and the session stores `planDayId`; web: Hoy uses them |
| AC-13 | Integration: progress minutes and practiced flags, missed days |
| AC-14 | Integration: `cyclePlan` on the lesson; web: the card shows and links to `/plan?cycle=` |
| AC-15 | Unit: no lesson, fewer topics than slots, uneven targets, an empty topic list |

### Risks and mitigations

- **Claude's plan doesn't add up:** the strict validator keeps the deterministic plan and says so.
- **Concurrent edits while Claude runs:** editing is locked while `llm_status` is queued or running. A job stuck for 15 minutes is marked failed, the same rule as D-18.
- **Hoy behaviour change:** the 003 suggestion stays as the fallback, and the existing Hoy tests keep passing without a plan.
- **Target changes mid-cycle:** day snapshots (003) keep history correct; the plan's day targets stay as built.

### Deviations from the spec and domain

1. `weekly_plans.status` is draft/active/replaced, and "done" is derived from `cycle_end` instead of stored. New `llm_status`, `llm_error`, `week_note` (domain's `focus_note`) and `source` columns. Recorded as D-19 and in domain.md.
2. `plan_items.label` and nullable `topic_id`, for the warm-up.
3. `practice_sessions.plan_day_id` gains its FK now.

### Verification

1. `pnpm test`, `pnpm typecheck`, `pnpm lint` and `pnpm e2e` all pass; AC-1 to AC-15 are each named in a test.
2. Locally, with `pnpm dev` and the real key:
   - set Sunday to 60 in Ajustes;
   - accept a lesson draft and tap "Planificar la semana";
   - see the deterministic plan, then Claude's notes;
   - move a block with "Mover a…", regenerate a day, accept;
   - Hoy shows today's plan blocks and note; start and finish a session; the plan shows progress;
   - "Replanificar lo que queda" after skipping a day.
3. Without a key: the plan builds without notes and the page says why.
4. Screenshots at 390 px and on desktop of `/plan` (draft, active, waiting), Hoy with a plan, and Ajustes.
