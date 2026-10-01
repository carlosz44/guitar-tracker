# Roadmap

| # | Spec | Status | Depends on |
|---|---|---|---|
| infra-vps/001 | Shared edge on the VPS (in the `infra-vps` repo) | Approved | — |
| 001 | Foundation | In progress (T19 manual checks left) | Deploy step needs infra-vps/001 |
| 002 | Lessons, topics and files | In progress (T17 manual checks left) | 001 |
| 003 | Practice sessions | In progress (T16 iPhone checks left) | 002 |
| 004 | Telegram: reminders and quick log | Outline | 003 |
| 005 | Lesson enrichment with Claude | In progress (T13 real-key check left) | 002 |
| 006 | Weekly planner | Outline | 003, 005 |
| 007 | Telegram lesson inbox | Outline | 004, 005 |
| 008 | Stats and weekly review | Outline | 003 |

Specs 001–003 are written in full. Specs 004–008 are outlined below and get a full `spec.md` when their turn comes. Design earlier specs so these aren't blocked; `docs/domain.md` already lists their entities.

---

## 004 Telegram: reminders and quick log

- **Linking:** Settings shows a one-time code. Sending `/start <code>` to the bot links that chat. Only one chat can be linked, and every other chat gets a polite refusal.
- **Reminders:**
  - Sent at the times in `user_settings.reminder_times` (11:00, 16:00, 18:00 Lima), only while today's minutes are below the target and today hasn't been skipped.
  - The message includes today's suggested blocks and three buttons: "Empezar ahora" (opens the practice screen), "Posponer 1 h" and "Hoy no".
- **`/log 35 tríadas dórico a 90`:** records a manual session of 35 minutes. The first version uses simple parsing (minutes plus free text); 005 can add parsing with Haiku to match topics and BPM.
- **`/hoy`:** shows today's progress and suggested blocks.
- **Lesson nudge:** if no lesson exists for today by 20:00 on lesson day, a nudge is sent.
- **Alerts:** backup failures are sent to the linked chat.
- **Records:** every message is stored in `notifications`.
- **Manual step:** create the bot in BotFather and check the username (for example `@DailyShedBot`) is available.

## 005 Lesson enrichment with Claude

- **Input:** the lesson's raw notes, the files (PDFs sent directly, Guitar Pro and docx as extracted text, images as images), and the list of existing topics.
- **Output:** a Spanish draft validated with Zod, containing:
  - title, summary, practice points, homework
  - suggested topics: new ones with category, parent, success criteria and target BPM, or existing ones with a relation
  - answers to any open teacher questions mentioned in the notes
- **Review screen:** accept per section, edit before accepting, or regenerate.
- **Logging:** every call goes to `llm_runs` with token usage and cost. Settings shows spend this month.
- **"Mejorar tema":** a button on a topic that drafts a better description, practice points and success criteria.
- **Manual step:** create an Anthropic API key with a monthly spend limit.

## 006 Weekly planner

- **Cycle:** runs from lesson day to the day before the next lesson. The default is 30 minutes a day, with per-day overrides (for example 60 on Sunday).
- **How the plan is built:**
  1. A deterministic scorer ranks topics using priority, days since last practiced, a boost for topics from the new lesson, low recent ratings, and a low weight for maintenance topics.
  2. A slot builder fits them into each day: warm-up plus one or two topics.
  3. Claude adjusts the plan and writes a focus note for each day.
  4. The server validates the result: topic ids exist, minutes add up, and each day has no more than 3 topics.
- **Hoy screen:** uses the plan instead of the suggestion rule from 003.
- **Editing:** Carlos can drag items between days, regenerate one day or the whole week, and accept the plan.
- **Trigger:** accepting a lesson draft (005) offers to generate the plan.

## 007 Telegram lesson inbox

- **Collecting:** forward files from WhatsApp to the bot and type notes. Everything goes into a collecting batch.
- **`/listo`:**
  - The files are stored in R2. The Telegram Bot API only lets bots download files up to 20 MB, so bigger files get a reply asking to upload them from the laptop.
  - A draft lesson is created and enrichment (005) runs on it.
  - The bot replies with a short summary and a link to review.
- **`/cancelar`:** discards the batch.
- **Result:** after review, the lesson becomes `final` and the plan is offered.

## 008 Stats and weekly review

- **Charts:**
  - calendar heatmap of minutes per day
  - streak
  - minutes per topic per cycle
  - clean BPM over time for each topic, with the target line
- **Pre-class summary:** what was practiced this cycle, BPM changes, and open teacher questions, so Carlos can walk into Thursday prepared.
- **Weekly review:** Claude writes a short review of the cycle, with suggestions for the next plan.
- **Spend page:** from `llm_runs`.
