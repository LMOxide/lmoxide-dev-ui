# LMOxide dev UI

Static web pages for working on an LMOxide server from the browser, through its REST API
(`lmoxide-api`). Two tools:

- **Debugger** (`/debugger/`): browse the game client's effect packages and play them on a
  character in the running game, and drive every in-game test command (teleport, test
  scenarios, go to bosses and other targets, spawn enemies, loot, looks, achievements, ...)
  with search and completion instead of typing them in the game chat. Background: LMOxide's
  `docs/EFFECT-BROWSER.md`.
- **World editor** (`/editor/`): place and fix the enemies, NPCs, smashables and trigger walls
  of each world on a survey server, and mark scripts and areas for review (LMOxide's
  `docs/SURVEY.md`).

The front page (`/`) signs in to both tools' servers at once (they share accounts) and opens the
one you choose; the switch at the top left of each tool goes to the other, greyed out when you
aren't signed in to its server (not running, or the account can't use it). Log out ends both.

## Debugger

**Effects** (the effect browser)

- lists `GET /v1/catalog/effects` (~2500 entries) with free-text search over ids, item and spell
  names, sounds, particles, Lua and timeline names (`"quoted words"`, `-exclude`), completing
  the word you type from the catalog's vocabulary; filters (kind, has / hasn't sound, particle,
  animation attribute or Lua, looping, used or unused, any timeline type, notes and tags), sort
  by id, and each package's timeline as a small bar chart;
- plays on the chosen player: `!fx <id>`, from each code hook (`onhit`, `charge`, ...), on the
  player, the nearest enemy (`@near`) or the ground (`@ground`), `!fx stop`, and keyboard stepping
  through the *filtered* list (each step sends `!fx <id>` for the neighbour); the chart labels
  parts by the hook that starts them, ♪ plays a package's sounds in the browser, and the
  animation attributes play with `!anim`;
- notes: tags ("smash effect", "not it", your own) and free text per entry, kept in
  localStorage, exported as JSON or Markdown (and imported back from JSON).

**Debug** (every test command, from `GET /v1/catalog/test-commands`)

| Section | Sends |
|---|---|
| Quick | `!where`, `!revive`, `!smashme`, `!smash`, `!xp`, `!stars`, `!ach`, puzzles (`!mirrors`, `!plates`) |
| Teleport | `!tp <playfield>` (marks where the player is) |
| Test scenarios | `!test <n>` (what each sets up: place, team, spawns) |
| Go to | `!goto <kind> <n>`: bosses, champions, enemies, NPCs, smashables, pads, collectibles, arenas, ... by name or playfield, or only where you are |
| Spawn & loot | `!spawn <count> <name>` (enemies and smashables, 15 minutes), `!despawn [all]`, `!loot <kind>` |
| Looks & state | `!skin <monster data>` (every look in the client, with what uses it), `!skin reset`, `!state <n>` by name (Idle, Fighting, Limbo, Building, ...) |
| Animations | `!anim <attribute>` (limbostart, chainattack, get_hit, ...), with the packages and looks that use each |
| Minifigures | `!own <name>`, `!aura <0-4>`, `!collection limit\|all` |
| Progress | `!count kills\|smashes\|builds [n] [name]`, `!defeat <boss>`, `!ach` |
| Dialogues | `!dialog <n>` |
| All commands | every command with its usage |

**Console** (right of the Debug view, a tab in the Effects view): a command box that completes
the command and then its arguments (`!tp yarr` → Isle of Yarr, `!goto boss mino` → Minotaur,
`!spawn 3 cra` → Crate, `!skin`, `!own`, `!test`, `!fx`, ...), with history, and a log of what was
sent and the server's chat answers to it.

**Search all** (`Ctrl K`): one search over effects, playfields, scenarios, every target,
spawnable names, looks, minifigures, dialogues, loot kinds and commands; Enter runs the command
or shows the effect, Shift+Enter puts the command in the console to edit (or plays the effect).

API gaps found along the way are in [`docs/API-PROPOSALS.md`](docs/API-PROPOSALS.md).

## World editor

For a survey server (`--mode survey`, LMOxide's `tools/survey-server.sh`): place enemies, NPCs
and smashables where they stood on live, confirm, edit or delete the guessed content, place
trigger walls, and mark areas, scripts and waves for review. You edit as a character online on
the survey server (*Editing as*): its position and facing place things.

- **Place**: pick something, *Wear it* (or *Show ghost* for buildies and interactables), walk to
  where it stood facing its way, *Place here*, optionally into a script's wave.
- **In this playfield**: everything spawned, nearest first, by category (guessed, surveyed,
  live, demo, client), distance and wave; hide (only for you, never saved), *Hide listed*,
  *Unhide all*, *Select nearest*. Attacking something in game selects it too.
- **Selection**: x/y/z and heading with nudges, *Move to me*, *Face my way*; changes show in game
  as you type. *Change into…* makes it any other spawn. Enemies and NPCs can get a patrol route
  (optional): walk it and *Add a point here* at each turn; it loops. Guesses: *Confirm*, edit
  (both make them surveyed) or *Delete*; live, demo and client objects can only be hidden.
- **Scripts**: waves with a name, what starts them (time, an enemy's health, a player walking
  in, another wave defeated, or a comment), *Preview*. Of a script with several waves only one
  is shown at a time, wave 1 at first: step with ◀ ▶ (or *all*) in *Waves shown*, nearest
  scripts first (by their placements). Placing into a wave shows that wave.
- **Trigger walls**: *Trigger wall* in Place: a wall (width, height, depth; red, green, shield
  or forcefield look) placed across your way that does something when a player walks through
  it: starts a script's wave, discovers a location, opens a dialogue, shows a message (or a
  comment says what), optionally only once. Resize, recolour, move and turn it like the rest; it
  changes in game as you edit.
- **Notes**: mission areas, achievements, dialogues, scripts and comments, at a spot, in a
  circle or in an area walked out corner by corner; naming the thing is optional.
- **Undo / redo** (top right, `Ctrl Z` / `Ctrl Shift Z` or `Ctrl Y` outside text boxes): placing,
  editing (moves and turns typed in quick succession are one step), confirming, deleting and
  resetting, for this page's session. **Reset** on the selection: an edited or confirmed guess
  back to the guess; anything else back to how it was when the page was opened.
- **Import / export**: one file per set or playfield; importing previews duplicates,
  near-duplicates (within a distance and angle you set, each can be taken anyway) and conflicts.

`/editor/?mock` runs it against an in-memory server, without signing in. `survey.html` (its old
address) forwards to `/editor/`.

## Requirements

- `lmoxide-api` with the game data catalogs (lmoxide after `2c668c5`: monsters, animations,
  character states, sounds) and started with `--client-dir` for the ♪ buttons. Older ones work
  with less: without the catalogs the pickers fall back to number boxes, before `2c668c5`
  without the Debug pickers and command replies.
- An admin account (log in with it) or an API key with the admin scope. Read scope is enough to
  browse; commands need admin.
- A running game server with a logged-in client whose account has GM level 1 or more (test
  commands are refused otherwise; the answer says so).

## Develop

```sh
pnpm install
pnpm dev            # http://localhost:5173: /api to http://127.0.0.1:8090, /editor-api to :8091
```

In development the debugger's API base is `/api`, which Vite forwards to `LMOXIDE_API`
(default `http://127.0.0.1:8090`, the play server's API), and the world editor's is
`/editor-api`, forwarded to `LMOXIDE_EDITOR_API` (default `http://127.0.0.1:8091`, a survey
server's), so no CORS setup is needed. For a backend with demo accounts
run `tools/web-dev-backend.sh` in the LMOxide repo (`admin` / `admin-password`); nobody is
online there unless a game client connects, so for commands use a real server such as
`tools/lan-server.sh`.

```sh
LMOXIDE_API=http://192.168.1.20:8090 pnpm dev
```

## Build and deploy

```sh
pnpm build          # static files in dist/
```

`dist/` uses relative paths, so it can be served from any directory. The API base URLs are set on
the sign-in page (*Servers…*) and kept in localStorage; without them the debugger uses port 8090
of the page's host and the world editor port 8091. The API has to allow the app's origin (`LMOXIDE_API_CORS_ORIGINS=https://...`) unless both
are served from one origin behind a reverse proxy (then set the base URL to e.g. `/api`).

If the API is not reachable, the effect catalog can also be opened from a file
(`data/effect_catalog.json` in the LMOxide repo) to browse without previews.

## Keys

| Key | |
|---|---|
| `Ctrl K` / `⌘ K` | search everything |
| `:` | the command box |
| `↓` `↑` `Tab` `Enter` | in a box with suggestions: pick, complete, run |
| **Effects view** | |
| `j` / `↓`, `k` / `↑` | next / previous entry in the filtered list (plays it when "play on step" is on) |
| `PageDown` / `PageUp` | 10 entries |
| `Enter` or `p` | play the selected entry |
| `s` | `!fx stop` |
| `1`–`9` | toggle the quick tags on the selected entry |
| `/` | search effects |
| double-click | play an entry |

## Storage

| Where | Key | What |
|---|---|---|
| sessionStorage | `lmofx.session` | the debugger's session token or API key (this tab only, as LMOxide's `docs/WEB-UI.md` asks) |
| localStorage | `lmofx.apiBase` | API base URL |
| localStorage | `lmofx.player` | the player chosen to run commands as |
| localStorage | `lmofx.view`, `lmofx.debugSection`, `lmofx.filters`, `lmofx.autoplay` | where you were, the last filters, "play on step" |
| localStorage | `lmofx.history` | the command box history |
| localStorage | `lmofx.fxAt` | where effects play (on me, `@near`, `@ground`) |
| localStorage | `lmofx.notes`, `lmofx.tags` | notes by effect id; tags you added |
| localStorage | `lmofx.survey.account` | the character the world editor edits as |
| localStorage, sessionStorage | `lmofx.editor.apiBase`, `lmofx.editor.session` | the world editor's API base and session |
| localStorage | `lmofx.tool` | the tool opened last |

Notes live only in this browser: export them before clearing site data.
