# 003 Practice sessions: tasks

Small, ordered tasks. Each one ends with passing tests and can be committed on its own.

- [x] T1 Schema and migration `0002_practice_sessions` (sessions, blocks, practice_days, one in-progress session per user); shared session schemas.
- [x] T2 Rules: practice date, cycle start, days met, streak, suggestions with the new-topic fallback, manual split. (covers AC-2, AC-17 split, AC-20)
- [x] T3 `GET /api/today`. (covers AC-1, AC-2, AC-4)
- [x] T4 Sessions API: start (409 when active), pause and resume, extend, complete, skip with clamped client timestamps, finish, abandon; new→active topics; practice_days snapshot; last activity. (covers AC-5, AC-6, AC-8, AC-9, AC-11, AC-13, AC-14)
- [x] T5 Manual log, history by cycle, session detail, edit, delete. (covers AC-17, AC-18, AC-19)
- [x] T6 Topic stats in topic responses, and the delete rule for topics used in blocks.
- [x] T7 Worker `session.close-stale`, hourly. (covers AC-16)
- [x] T8 Web: practice store with the corrected clock, and the outbox (ordered, retried, persisted). (covers AC-6, AC-15)
- [x] T9 Web: Hoy, with progress ring, streak, lesson, questions, editable suggestions, Empezar, active-session card and resume on launch. (covers AC-1, AC-3, AC-4)
- [x] T10 Web: practice screen with countdown, next block, elapsed, pause, +5, Saltar, time-up screen, wake lock and tip. (covers AC-5 to AC-10)
- [x] T11 Web: block log sheet, Anotar pregunta, summary and Terminar. (covers AC-11 to AC-14)
- [ ] T12 Web: manual log at `/log`. (covers AC-17)
- [ ] T13 Web: Historial and the session edit page. (covers AC-18, AC-19)
- [ ] T14 Web: topic stats on the topic page.
- [ ] T15 Playwright e2e smoke tests plus the CI job. (covers AC-1, AC-5, AC-6, AC-8, AC-11, AC-13, AC-18)
- [ ] T16 Manual checks and docs:
  - iPhone at the stand: lock the screen mid-block, wake lock or tip, airplane mode during a block
  - 390 px and desktop for every new screen
  - then spec status and roadmap.
