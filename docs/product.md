# Product: Daily Shed

## Why

Carlos takes one guitar lesson a week, usually on Thursday, and practices at least 30 minutes a day. Lessons build on each other. For example, he learns a mode, then its triads, then a new mode and its triads. After class the teacher sends files over WhatsApp: Guitar Pro, PDF or Word.

Practice covers more than the latest lesson: fingering exercises, chromatic scales, and two-string position drills for speed and precision. Not all of it fits in one day, so each day should focus on one or two topics.

Today all of this lives in memory and in scattered files. Daily Shed keeps the lesson history, turns lessons into practice topics, decides what to practice each day, times the practice, and sends a reminder when he hasn't played yet.

## User

There is one user.

- **At the stand:** he practices with an iPhone on the music stand. Sound and metronome come from a Sonicake Pocket Master, so the phone guides the session but never plays audio.
- **At the desk:** he uses a laptop to enter lessons and plan.
- **Practice times:** about 11:00, otherwise 16:00, otherwise 18:00 (Lima time).

## Core loop

1. **Capture** the lesson: notes, files and what's new. On the laptop at first, later by forwarding to Telegram.
2. **Organize** the lesson into topics that outlive it.
3. **Plan** the week so each day gets one or two focused topics plus a warm-up.
4. **Practice** with a guided timer, logging the clean BPM and a rating for each block.
5. **Review** progress before the next lesson, including questions for the teacher.

## Goals

- Starting practice takes one tap from the home screen, with the day's blocks already chosen.
- A lesson and its files can be captured in under five minutes.
- Every minute of practice is recorded against a topic.
- Progress is visible: minutes per topic, clean BPM over time, streaks.
- Reminders arrive only on days when practice hasn't happened yet.

## Non-goals (v1)

- Multiple users, sharing or social features.
- Metronome, audio playback, recording or audio analysis. The Pocket Master handles sound.
- A native iOS app. This is a PWA installed from Safari.
- SMS or email notifications. Telegram only, with web push as a possible later addition.
- Offline-first data. The app shell loads offline, but data needs a connection.
- Editing Guitar Pro files. The app only displays them.

## Principles

- **Fast capture, no friction at the stand.** Big touch targets, one-handed use, as few decisions as possible mid-practice.
- **AI drafts, Carlos decides.** Claude suggests lesson summaries and plans. Nothing it writes is final until he accepts it.
- **Respect the day's time.** Plans fit the minutes available instead of piling everything in.
- **Spanish everywhere the user looks.**

## Phases

See `docs/specs/000-roadmap.md`.
