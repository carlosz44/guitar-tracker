# 002 Lessons, topics and files: tasks

Small, ordered tasks. Each one ends with passing tests and can be committed on its own.

- [x] T1 Spike and parser: `parser-thread.ts` (alphaTab Guitar Pro → meta and compact text; mammoth docx), magic bytes, 40,000-character cap. Fixtures: a Guitar Pro file generated from alphaTex, a committed tiny docx, a corrupt file. (covers part of AC-6, AC-7)
- [x] T2 Shared: file kinds and `validateUpload`, lesson/topic/question schemas and constants, `todayIn`. (covers AC-4 rules, AC-11, AC-14 schema)
- [x] T3 Schema and migration `0001_lessons_topics_files`, plus `truncateAll` updated.
- [x] T4 App dependencies: `storage` and `queue` in `AppDeps`, send-only pg-boss in the api, `storage.getStream`, CSP for the R2 origin.
- [ ] T5 Lessons API: create, list, detail, patch, delete with R2. (covers AC-1, AC-2, AC-3)
- [ ] T6 Topics API: create, list with filters, detail, patch with cycle check, delete rule. (covers AC-11 to AC-14)
- [ ] T7 Lesson-topic links and questions API. (covers AC-15, AC-16, AC-17)
- [ ] T8 Files API: presign, confirm, url, open, retry, delete. (covers AC-4, AC-5, AC-9, AC-10)
- [ ] T9 Worker: `file.extract` (SHA-256, thread with limits and timeout, statuses, duplicate data) and `file.cleanup-stale`. (covers AC-6, AC-7)
- [ ] T10 Web foundations: shadcn components, `Markdown`, `ListEditor`, queries, new strings.
- [ ] T11 Web lessons: list, new and edit form (two columns on wide screens), read-first page, delete confirmation. (covers AC-1, AC-2, AC-3)
- [ ] T12 Web uploads: dropzone, validation, parallel XHR progress, confirm, status badges, retry, duplicate warning. (covers AC-4, AC-5, AC-7)
- [ ] T13 Web viewers: alphaTab Guitar Pro viewer, PDF, docx, image. (covers AC-8, AC-9, AC-10)
- [ ] T14 Web topics: grouped list with filter, form, page with parent, children and lessons, status change, delete or archive. (covers AC-11 to AC-14)
- [ ] T15 Web topic linking from a lesson: combobox with inline create and relation. (covers AC-15)
- [ ] T16 Web questions: "+ Pregunta" dialog, open list on the latest lesson, answer and dismiss. (covers AC-16, AC-17)
- [ ] T17 Manual checks and docs:
  - real R2 upload, view and delete from the laptop and the iPhone
  - Guitar Pro readable at 390 px without pinch-zoom (AC-8)
  - 390 px and desktop for every new screen
  - then spec status and roadmap.
