# Daily Shed

A personal guitar practice app: a lesson log with the teacher's files, practice topics, a guided practice timer, weekly plans, Telegram reminders and Claude-drafted lesson notes.

It runs at `ds.<domain>` as an installable PWA. The UI is in Spanish.

- Product and scope: `docs/product.md`
- Domain model: `docs/domain.md`
- Architecture and deployment: `docs/architecture.md`
- Decisions: `docs/decisions.md`
- Specs and roadmap: `docs/specs/`

## Local setup

1. Node 24 (`nvm use`), then `corepack enable` for pnpm, and Docker running.
2. `pnpm install`
3. `cp .env.example apps/server/.env` and fill in a development GitHub OAuth app (callback `http://localhost:5173/api/auth/callback/github`) and your numeric GitHub id.
4. `pnpm dev`, then open `http://localhost:5173`.

`pnpm test`, `pnpm lint` and `pnpm typecheck` must pass before pushing. The full command list is in `CLAUDE.md`.
