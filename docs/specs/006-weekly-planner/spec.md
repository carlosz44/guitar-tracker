# 006 Weekly planner

**Status:** Draft
**Depends on:** 003, 005

## Why

003 suggests each day's blocks with a simple rule, one day at a time. After a lesson, Carlos wants the whole week laid out: which topics on which day, how long, and why, so the new material gets enough time without dropping what's in progress. A deterministic scorer does the fair share of minutes; Claude adjusts it and writes a short focus note per day. Carlos reviews and accepts the plan, and Hoy follows it.

## Scope

**In:**
- **Weekly plan** for one practice cycle (D-11): days, minutes per day, topics per day, a focus note per day and for the week.
- **Daily targets per weekday** in Ajustes (for example 60 on Sunday), used by the plan and by today's target.
- **Building the plan:** deterministic scorer and slot builder, then Claude's adjustment, validated by the server. Works without Claude (deterministic plan, no notes).
- **Review and editing:** change minutes, move a topic to another day, add or remove topics, regenerate one day or the whole plan, accept, and replan the rest of the week after missed days.
- **Hoy** shows today's plan instead of the 003 rule while an accepted plan covers today; sessions started from it link to the plan day.
- **Progress:** each plan day shows minutes done against planned.
- **Trigger:** accepting a lesson draft (005) offers "Planificar la semana"; there's also a button on the plan page.

**Out:** Telegram (004), charts and weekly review (008), automatic replanning without Carlos asking, drag and drop, plans longer than one cycle.

## User stories

- As Carlos, right after accepting my lesson notes, I want one tap to get this week's plan.
- As Carlos, I want to see the week at a glance on my phone, move a topic from Tuesday to Wednesday, and accept it.
- As Carlos, at 11:00 I want Hoy to already show today's blocks from the plan, with the focus note.
- As Carlos, I want more minutes on Sunday without changing the other days.

## Acceptance criteria

**Targets**
- **AC-1** Ajustes lets me set the daily target per weekday (10–240 minutes, steps of 5), defaulting to the single daily target. Today's target in Hoy, streaks and Historial use the target for that weekday (snapshotted per day as in 003).

**Building**
- **AC-2** "Planificar la semana" creates a plan for the current cycle (or the next one when today is the last day of the cycle and the next lesson is tomorrow). Each day gets a target from AC-1 and blocks: a 5-minute warm-up plus one to three topics filling the rest in 5-minute steps.
- **AC-3** The scorer ranks non-archived topics by priority, days since last practiced, a boost for topics linked to the cycle's lesson (introduced or extended), a boost for low recent ratings (average under 3 in the last 3 blocks), and a low weight for maintenance topics. Each topic linked to the cycle's lesson appears at least twice in the week; no topic appears on more than 5 days.
- **AC-4** With Claude configured, the deterministic plan is sent to Claude with the scores and context (topics, the lesson summary and practice points, recent practice), and Claude returns an adjusted plan plus a focus note per day and a week note. The server accepts Claude's version only if every topic id exists, each day's minutes add up to its target, and no day has more than 3 topics; otherwise it keeps the deterministic plan and says so.
- **AC-5** Without Claude, or over budget, the deterministic plan is used without notes and the page says why.

**Review and editing**
- **AC-6** `/plan` shows the cycle day by day: date, target, blocks with minutes, focus note. On the iPhone each day is a card; on the laptop the week is a 7-column grid.
- **AC-7** While the plan is a draft I can change a block's minutes (±5), move a block to another day, remove a block and add a topic to a day. Totals update live; a day over or under its target is highlighted.
- **AC-8** "Regenerar este día" rebuilds one day's blocks with the scorer (and Claude's note when configured); "Regenerar la semana" rebuilds all days. Edits to other days are kept.
- **AC-9** "Aceptar plan" makes the plan active. Only one plan is active per cycle; accepting a new one for the same cycle replaces the old one, and the old one keeps its sessions' links.
- **AC-10** An accepted plan can still be edited for today and future days; past days are read-only.
- **AC-11** "Replanificar lo que queda" rebuilds today (if nothing was practiced yet) and the remaining days of an active plan. The scorer counts what was actually practiced this cycle, so topics from missed days get priority; Claude rewrites the notes for the rebuilt days. Past days and their progress are untouched.

**Hoy and progress**
- **AC-12** While an active plan covers today, Hoy shows today's plan blocks (editable as in 003 AC-3) and the day's focus note instead of the 003 suggestion. Starting a session stores the plan day on it.
- **AC-13** Each plan day shows minutes practiced against its target and marks each block practiced when a session on that day has a completed block for that topic. Past days that were missed stay visible as missed.
- **AC-14** Accepting a lesson draft in 005 (or settling it with at least one accepted section) shows "Planificar la semana" with a link to build the plan for the cycle that starts on that lesson's date.

**Rules**
- **AC-15** Unit tests cover the scorer, the slot builder and the validator, including a cycle with no lesson, a topic list smaller than the days, and targets that don't divide evenly.

## UX notes

- **Where:** `/plan`, reached from a "Semana" card on Hoy and from the lesson page after accepting a draft. No new item in the bottom nav.
- **iPhone:** a vertical list of day cards, today first and expanded, past days collapsed. Moving a block is a "Mover a…" menu with the cycle's days, not drag and drop. Big ±5 buttons as in Hoy.
- **Laptop:** a 7-column grid; the same "Mover a…" menu (drag and drop is out for v1).
- **Building:** a waiting state like 005 while Claude works ("Claude está armando la semana…").
- **States:** no plan (button "Planificar la semana"), draft (editing, "Aceptar plan"), active, cycle ended (read-only).
- All copy in Spanish.

## Data

See `docs/domain.md` → Weekly plan.
- New `weekly_plans`: `cycle_start`, `cycle_end`, `status` (`draft` | `active` | `done` | `replaced`), `focus_note`, `rationale`, `source` (`rules` | `claude`), `llm_run_id`.
- New `plan_days`: `plan_id`, `date`, `target_minutes`, `focus_note`.
- New `plan_items`: `plan_day_id`, `topic_id` (nullable for warm-up), `label`, `minutes`, `position`.
- `user_settings.day_targets`: per-weekday minutes (jsonb or 7 columns; the plan decides).
- `practice_sessions.plan_day_id` already exists (003).

## API sketch

- `PATCH /api/settings` gains `dayTargets`.
- `POST /api/plans` `{ cycleStart? }` → builds a draft plan (202 while Claude works, then the plan).
- `GET /api/plans/current`, `GET /api/plans/:id`.
- `PATCH /api/plans/:id/days/:date` `{ items }` → replaces a day's blocks (validated).
- `POST /api/plans/:id/days/:date/regenerate`, `POST /api/plans/:id/regenerate`.
- `POST /api/plans/:id/accept`.
- `GET /api/today` returns the plan day when one is active.

## Edge cases

- No lesson in the cycle yet: the scorer runs without the lesson boost.
- Fewer topics than needed: topics repeat (still at most once per day); with no topics, days get only the warm-up.
- A topic is archived or deleted after the plan was made: its blocks are dropped from future days and the day is marked as needing a regenerate.
- The lesson weekday changes in Ajustes: the current plan stays; the next plan uses the new cycle.
- Sessions started from the 003 suggestion before the plan was accepted still count for the day's progress.

## Decisions (Carlos, 2026-10-01)

- **Cycle:** 7 days starting on the lesson weekday, per D-11, not "until the next lesson" as the roadmap outline said.
- **Targets:** recurring per weekday in Ajustes, still editable per plan day.
- **Moving blocks:** a "Mover a…" menu on the iPhone and the laptop; no drag and drop.
- **Missed days:** a "Replanificar lo que queda" button (AC-11).
