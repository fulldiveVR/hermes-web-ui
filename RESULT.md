# Variant B — shared Hermes Web UI as a pure hub API client

The web-ui is reshaped into a **stateless hub-tier client**. It no longer reads a
tenant filesystem, spawns an agent, or runs a bridge/gateway. Every Hermes data
read/write flows through hub HTTP APIs via a single `HubClient`. "Profiles" are the
hub's tenants, login is hub-minted SSO, and chat rides the hub run API.

## What changed — web-ui side (`hermes-web-ui-variant-b`, branch `webui-variant-b`)

| Area | Change | Files |
|---|---|---|
| Hub seam | New `HubClient` — the only path to Hermes data (tenants, sessions, runs, SSE, SSO validate) | `packages/server/src/services/hub/hub-client.ts` |
| Config | Added `HUB_BASE_URL` + `HUB_API_TOKEN` (hub-tier service credential) | `packages/server/src/config.ts` |
| SSO auth | New `POST /api/auth/sso` exchanges a hub-minted token for a tenant-bound web-ui JWT; replaces `admin/123456`. `/sso` landing page (BFF-served, no SPA rebuild) stores the JWT + active tenant and redirects | `controllers/auth.ts`, `routes/auth.ts`, `routes/sso.ts`, `db/hermes/users-store.ts` (`upsertTenantUser`) |
| Profiles → tenants | `GET /api/hermes/profiles` now lists hub tenants, ACL-scoped to the logged-in tenant. No `~/.hermes/profiles` walking | `controllers/hermes/profiles.ts` |
| Sessions | `GET /api/hermes/sessions/hermes` + `/hermes/:id` now source from the hub, not local `state.db` | `controllers/hermes/sessions.ts` |
| Chat | New `handleHubRun` posts to the hub run API and translates the run's SSE into the existing Socket.IO chat events. Replaces the agent-bridge dispatch | `services/hermes/run-chat/handle-hub-run.ts`, `run-chat/index.ts` |
| Lifecycle | Bootstrap no longer starts gateway autostart or the agent-bridge manager | `packages/server/src/index.ts` |

ACL note: an SSO login upserts a local web-ui user `tenant:<id>` scoped to exactly
that one tenant (this lives in the web-ui's own home — **not** a tenant filesystem),
so the existing per-profile ACL machinery transparently enforces isolation.

## What changed — hub side (`hermes-hub-variant-b`, branch `webui-variant-b`)

New endpoints in `internal/api/webui.go` (routes registered in `internal/api/server.go`):

- `POST /v1/tenant-runtime/{id}/ui-login-token` — runtime-key auth; used by the
  `/start-ui` hook to mint a single-use SSO token + UI URL.
- `POST /v1/tenants/{id}/ui-login-token` — control auth; same mint for ops/tests.
- `POST /v1/ui-login/validate` — control auth (the web-ui service); exchanges a
  token for its bound tenant. **Single-use**, 5-min TTL, in-memory store.
- `GET /v1/tenants/{id}/sessions` and `GET /v1/tenants/{id}/sessions/{sid}` —
  control auth; read the tenant's real `$HERMES_HOME/state.db` read-only
  (pure-Go `modernc.org/sqlite`) and return UI-friendly shapes. Missing db → empty.

New `/start-ui` command hook: `flavors/business/tenant/hooks/hub_start_ui/`
(`command:start-ui`) — mints a login link from the hub and replies with it through
the user's channel.

## Demoable status (local, mock hub on :8090, 2 tenants)

Verified end-to-end through the BFF (`/api/auth/sso` → JWT → profiles → sessions):

| §6 | Result |
|---|---|
| 1. SSO link → scoped to tenant A, no password | ✅ proven |
| 2. Session list shows tenant A's pre-existing (WhatsApp) session via hub API | ✅ proven (seeded `state.db`) |
| 4. Tenant B not visible to tenant A | ✅ proven (`403` + profiles list = `[tenant_alpha]`) |
| 3/5/6. Chat reaches agent via run API + streams; model proxy; hibernated wake | ⚠️ **plumbing wired, not proven here** |

The chat run path (`handleHubRun` → hub `POST /runs` + SSE) is fully wired, but the
hub's run API requires the **real** Hermes runtime (`HERMES_HUB_RUNTIME=real`); in
mock it returns 503/needs a credential by design. Proving 3/5/6 needs a real runtime
(`~/projects/hermes-agent` + hub Codex auth, per the hub README `make e2e`), which
wasn't run in this environment. The runtime SSE→socket event mapping in
`handle-hub-run.ts` is best-effort (matches the documented `{run_id}` create +
`run.completed`/`[DONE]` terminal contract) and may need field-name tuning against
the real runtime's event stream.

### Repro
```bash
# hub (this exact config was used)
HERMES_HUB_ADDR=:8090 HERMES_HUB_MODE=mock HERMES_HUB_RUNTIME=mock \
  HERMES_HUB_TENANT_ROOT=/tmp/hermeshub-tenants HERMES_HUB_WEBUI_URL=http://localhost:8648 \
  ./hermes-hub
# create tenant_alpha + tenant_beta via POST /v1/tenants; seed alpha's state.db
# web-ui
HUB_BASE_URL=http://localhost:8090 PORT=8648 HERMES_WEB_UI_HOME=/tmp/webui-home \
  node dist/server/index.js
# In prod, also set HUB_API_TOKEN=<hub control token> so run/SSE calls authenticate.
```

## Live validation on vm201 (real runtime)

Deployed the additive hub diff to the live hub (vm201, `0.3.0`, backup + auto-rollback;
existing 12 customer tenants untouched), created a throwaway tenant `test_webui_b`, and
ran the full flow with the local web-ui pointed at `https://web201.likeclaw.ai`:

- §6.1 SSO, §6.2 sessions via hub, §6.4 isolation, §6.7 no spawn — ✅
- §6.3/5/6 **chat now proven end-to-end**: browser → `/chat-run` socket → hub run API →
  real runtime → streamed deltas → `run.completed` with output + token usage; agent
  woke on first run (hub-managed); model calls via hub proxy, no tenant tokens.

Three fixes were required against the real runtime/DB (the mock couldn't surface them):
1. **SSE→socket mapping** keyed off the wrong field. Real runtime carries its event
   name in the JSON `event` field (not an SSE `event:` line or `type`), e.g.
   `{"event":"message.delta","delta":...}` / `{"event":"run.completed","output":...,"usage":...}`.
   Rewrote `handle-hub-run.ts` to route on `obj.event`, handle `reasoning.available`,
   and pull final `output`+`usage` from `run.completed` (previously `run.completed` was
   missed → UI hung "working"). 
2. **state.db reads returned 0 rows.** Hermes stores timestamps as REAL and runs WAL;
   the pure-Go driver missed WAL-pending rows under `mode=ro` and threw on scanning a
   float into int64 (silently skipped). Fixed by reading a temp **snapshot copy**
   (db + -wal, no side effects on the live tenant file) and `CAST(... AS INTEGER)` on
   integer columns; scan errors are now logged, not swallowed.
3. **Browser chats were hidden.** In Variant B all browser chat flows through the run
   API and lands as `source=api_server`; the legacy web-ui excluded that source. Dropped
   the exclusion in `listHermesSessions`/`getHermesSession`.

Rollback: `sudo install -m0755 /usr/local/bin/hermes-hub.bak.<ts> /usr/local/bin/hermes-hub && sudo systemctl restart hermes-hub.service`.

## Dropped / reshaped for hosted multi-tenant

- **Web terminal, raw file browser** — drop. No safe hub-API equivalent; would expose
  the tenant runtime filesystem/shell. (Routes still mounted but no longer backed by a
  tenant FS in this model; should be removed/hidden in the UI.)
- **Profile clone / export / import / create / rename / delete / switch-active** —
  drop. Tenants are hub-owned; their lifecycle is a hub control-plane concern, not a
  web-ui action. `controllers/hermes/profiles.ts` still contains the old FS handlers
  for those routes; only `list` was repurposed. They should be removed.
- **Direct channel-token & provider/model editing** — reshape/drop. Hub-owned
  (central LLM proxy, no tenant-held tokens). Config writes must become hub calls or
  be hidden.
- **Local `state.db` reads, `~/.hermes/profiles` walking, `hermes_bridge.py`,
  gateway autostart** — removed from the live paths (chat, sessions, profiles, login,
  bootstrap). Some now-unused bridge/FS helper modules remain in the tree and can be
  deleted in a cleanup pass.

## Rough size

Hub: +1 file (~330 lines) + ~6 route lines + 2 struct lines + 1 hook (2 files).
Web-ui: +3 files (HubClient, hub-run handler, SSO landing) + edits to config, auth
controller/routes, users-store, profiles controller, sessions controller, run-chat
dispatcher, bootstrap. Net: the larger, cleaner refactor — one source of truth (hub),
isolation/auth where they belong, no dual-ownership seams.
