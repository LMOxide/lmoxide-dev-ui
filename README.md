# LMOxide effect browser

A static single-page app for browsing the game client's effect packages and playing them on a
character in the running game, through the LMOxide REST API (`lmoxide-api`). The point is to find
the exact effect you remember ("the puff when a minifigure is smashed"), tag it, and hand the
notes back to the LMOxide developer. Background: LMOxide's `docs/EFFECT-BROWSER.md`.

What it does:

- lists `GET /v1/catalog/effects` (~2500 entries) with free-text search over ids, item and spell
  names, sounds, particles, Lua and timeline names (`"quoted words"`, `-exclude`), filters
  (kind, has sound / particle / animation attribute / Lua, looping, used or unused, any
  timeline type, notes and tags), sort by id, and each package's timeline as a small bar chart;
- previews on an online player you pick (`GET /v1/players`, remembered): `!fx <id>`,
  `!fx <id> <hook>`, `!fx stop`, and keyboard stepping through the *filtered* list
  (each step sends `!fx <id>` for the neighbour);
- other previews through the same endpoint: `!skin <id>` / `!skin reset`, `!state <n>` (1 normal,
  29 Limbo = smashed, 104 building) and a free command box with history;
- notes: tags ("smash effect", "not it", your own) and free text per entry, kept in
  localStorage, exported as JSON or Markdown (and imported back from JSON).

Gaps in the API are written down in [`docs/API-PROPOSALS.md`](docs/API-PROPOSALS.md), not
worked around.

## Requirements

- An `lmoxide-api` with `GET /v1/catalog/effects` and `POST /v1/players/{id}/command`.
- An admin account (log in with it) or an API key with the admin scope. Read scope is enough to
  browse; commands need admin.
- For previews: a running game server with a logged-in client whose account has GM level 1 or
  more (test commands are refused otherwise).

## Develop

```sh
pnpm install
pnpm dev            # http://localhost:5173, /api proxied to http://127.0.0.1:8090
```

In development the default API base is `/api`, which Vite forwards to `LMOXIDE_API`
(default `http://127.0.0.1:8090`), so no CORS setup is needed. For a backend with demo accounts
run `tools/web-dev-backend.sh` in the LMOxide repo (`admin` / `admin-password`); nobody is
online there unless a game client connects, so for previews use a real server such as
`tools/lan-server.sh`.

```sh
LMOXIDE_API=http://192.168.1.20:8090 pnpm dev
```

## Build and deploy

```sh
pnpm build          # static files in dist/
```

`dist/` uses relative paths, so it can be served from any directory (or opened from a static
host next to the admin web UI). The API base URL is set on the login screen and kept in
localStorage; without one it defaults to port 8090 of the page's host. The API has to allow the
app's origin (`LMOXIDE_API_CORS_ORIGINS=https://...`) unless both are served from one origin
behind a reverse proxy (then set the base URL to e.g. `/api`).

If the API is not reachable, the catalog can also be opened from a file
(`data/effect_catalog.json` in the LMOxide repo) to browse without previews.

## Keys

| Key | |
|---|---|
| `j` / `↓`, `k` / `↑` | next / previous entry in the filtered list (plays it when "play on step" is on) |
| `PageDown` / `PageUp` | 10 entries |
| `Enter` or `p` | play the selected entry |
| `s` | `!fx stop` |
| `1`–`9` | toggle the quick tags on the selected entry |
| `/` | search |
| double-click | play an entry |

## Storage

| Where | Key | What |
|---|---|---|
| sessionStorage | `lmofx.session` | the session token or API key (this tab only, as LMOxide's `docs/WEB-UI.md` asks) |
| localStorage | `lmofx.apiBase` | API base URL |
| localStorage | `lmofx.player` | the player chosen to preview on |
| localStorage | `lmofx.filters`, `lmofx.autoplay` | the last filters, "play on step" |
| localStorage | `lmofx.notes`, `lmofx.tags` | notes by id; tags you added |

Notes live only in this browser: export them before clearing site data.
