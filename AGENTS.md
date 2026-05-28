# AGENTS.md

## Project Mission

Hermes Web UI is a self-hosted Vue/Koa dashboard for Hermes Agent. It manages
chat sessions, profiles, provider configuration, platform channels, scheduled
jobs, files, skills, memory, logs, group chat, and terminal access.

## Repository Map

- `packages/client/src`: Vue 3 client, views, stores, API modules, and shared
  UI components.
- `packages/server/src`: Koa server, controllers, services, Socket.IO chat
  runtime, auth, config, and persistence helpers.
- `packages/server/src/services/hermes/run-chat`: Socket.IO chat run runtime.
- `packages/website/src`: public website build.
- `packages/skills`: bundled Web UI skills.
- `tests`: Vitest and Playwright coverage.
- `scripts`: build and generation helpers.

## Engineering Rules

- Prefer existing local patterns over new abstractions.
- Keep changes scoped to the requested behavior.
- Do not mix unrelated refactors into feature or bugfix work.
- Use structured APIs and parsers for structured data instead of ad hoc string
  edits when possible.
- Add comments only where they explain non-obvious behavior or constraints.
- Do not overwrite or revert unrelated user changes.
- Avoid shell string construction for CLI calls; prefer `execFile` or `spawn`
  with argument arrays.
- Never log or print secret contents, tokens, provider API keys, or credential
  files.

## Frontend Rules

- Use Vue 3 Composition API with `<script setup lang="ts">`.
- Use Pinia setup stores.
- Use the shared API request helper in `packages/client/src/api/client.ts`.
- Add user-facing strings to all locale files.
- Keep component styles scoped with SCSS unless the style is intentionally
  global.
- Match existing Naive UI patterns and do not add a new UI library without a
  clear product need.

## Server Rules

- Register local API routes before proxy catch-all routes.
- Keep auth behavior centralized in `packages/server/src/services/auth.ts`.
- Use `config.appHome` for Web UI state paths.
- Keep Hermes home paths separate from Web UI home paths.
- Use `getActiveProfileDir()` or related profile helpers for Hermes profile
  files.
- Keep server routes thin; put request handling in controllers and reusable
  behavior in services.

## Verification

Run the narrowest relevant check first, then broader checks:

```bash
npm run test
npm run test:e2e
npm run build
```

For broad changes, run:

```bash
npm run test:coverage
npm run test:e2e
npm run build
```

## Documentation Rules

- Keep contributor workflow and command guidance in `DEVELOPMENT.md`.
- Keep operator/user-facing usage in `README.md` and `README_zh.md`.
- Keep test plans and manual proof notes in `TODAY_TEST_CASES.md` or
  `RESULT.md` when those files are the active project record.
