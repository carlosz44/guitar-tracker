# 005 Lesson enrichment with Claude: tasks

- [x] T1 Config and deploy: `ANTHROPIC_API_KEY` (optional), `LLM_MODEL_DEFAULT`, `LLM_MONTHLY_BUDGET_USD`; `.env.example`, deploy secrets, compose, workflow tests; add `@anthropic-ai/sdk`. (covers AC-16 config)
- [x] T2 Migration `0003_llm` (`llm_runs`, `llm_drafts`, one active draft per subject); shared LLM schemas and error keys.
- [x] T3 LLM client (real and fake), pricing checked against Anthropic's page, run logging, monthly spend, budget check. (covers AC-13, AC-14, AC-15 server)
- [x] T4 Attachments: files to content blocks with limits and skipped reasons. (covers AC-3)
- [x] T5 Lesson enrichment job: prompt, structured call, validation retry, post-processing, failure and retry states. (covers AC-3, AC-4, AC-6 to AC-8 filtering)
- [x] T6 API: start enrichment (plus regenerate), `POST /api/lessons` with `enrich`, `GET /api/drafts/:id`, `me.llm`, `/api/llm/usage`; drafts deleted with their lesson or topic. (covers AC-1, AC-2, AC-10, AC-14 to AC-16)
- [x] T7 Review API: per-section accept and discard with edits, accept-all, discard, completion, draft lesson to final. (covers AC-5 to AC-11)
- [x] T8 Topic improve job and API. (covers AC-12)
- [x] T9 Web: "Completar con Claude", waiting and failed states, polling, quick capture in the new-lesson form, "Borrador" badges. (covers AC-1, AC-2, AC-4, AC-16)
- [x] T10 Web: lesson review, with section cards, topic and question lists, "Aceptar todo" and "Regenerar". (covers AC-5 to AC-11)
- [x] T11 Web: "Mejorar con Claude" review on the topic page. (covers AC-12)
- [ ] T12 Web: Claude spend in Ajustes, or "no configurado". (covers AC-14, AC-16)
- [ ] T13 Docs and manual checks:
  - D-17, domain.md (draft statuses and columns), architecture.md env
  - a real key on a real lesson with PDF, Guitar Pro and image; check cost and logs
  - 390 px and desktop
  - then spec status and roadmap.
