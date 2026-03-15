# AGENTS.md

## Cursor Cloud specific instructions

### Overview

Reading List is a self-hosted reading list manager built with **Bun**, **Hono**, and **SQLite**. It is a single-service app (no external databases or services needed).

### Running the app

- **Dev server**: `bun run dev` — starts on port 3000 with `--watch` for hot reload.
- SQLite database is created automatically at `data/reading-list.db` on first run.
- The `data/` directory is gitignored and created automatically.

### Key notes

- **Runtime**: Bun (not Node.js). All commands use `bun`, not `npm`/`node`.
- **No test suite or linter configured** — `package.json` has no `test` or `lint` scripts. TypeScript checking can be done with `bunx tsc --noEmit` (no `tsconfig.json` exists, so Bun's defaults apply).
- **No pre-commit hooks** or CI pipeline configured.
- **Frontend**: Vanilla HTML/CSS/JS in `public/` — no build step required.
- API and static files are served from the same Hono server on port 3000.
- See `README.md` for standard dev commands and API usage examples.
