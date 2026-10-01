# 006 Weekly planner: tasks

- [x] T1 Day targets: migration `0004_day_targets`, shared schema, settings PATCH and `toSettings`, `dayTarget()`; today and the session and manual-log snapshots use it. (covers AC-1 server)
- [x] T2 Migration `0005_weekly_plans` (plans, days, items, session FK); shared plan schemas and error keys.
- [x] T3 Planner rules: scorer, slot builder, validator, replan input. (covers AC-3, AC-11 rules, AC-15)
- [x] T4 Plan service and API: build, current, put days, regenerate day and week, accept, replan; progress. (covers AC-2, AC-7 to AC-11, AC-13)
- [x] T5 Claude job `llm.weekly-plan`: prompt, validation, apply or keep, notes, scoped dates, skipped reasons. (covers AC-4, AC-5)
- [x] T6 Today and sessions: plan day in `/api/today`, `planDayId` on start, lesson `cyclePlan`. (covers AC-12, AC-14 server)
- [x] T7 Web Ajustes: daily target per weekday. (covers AC-1)
- [ ] T8 Web `/plan`: day cards and grid, editing with "Mover a…", regenerate, accept, replan, Claude waiting state, progress. (covers AC-6 to AC-11, AC-13)
- [ ] T9 Web Hoy and lesson page: plan blocks and focus note, "Semana" card, "Planificar la semana" card. (covers AC-12, AC-14)
- [ ] T10 Docs and manual checks:
  - D-19 and domain.md
  - a real plan with Claude after a real lesson
  - 390 px and desktop
  - then spec status and roadmap.
