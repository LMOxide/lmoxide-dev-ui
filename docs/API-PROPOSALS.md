# Proposed API changes

> **All eleven landed in lmoxide**: 1–2 in `2c668c5` ("Test command catalog, command replies,
> !spawn"), 3–11 in `f1925b7` ("Game data catalogs, !fx on targets, !anim, !despawn"). Each item says how; the
> file is kept as a record. New proposals go under a new heading at the end.

Changes to `lmoxide-api` (and the test commands in `crates/lmoxide-server/src/devcmd.rs`) that
the browser needed, found while building it (2026-10-26).

## 1. Command replies (done)

The command answer only said how many players it reached; what the command said went to the
game chat. **Done:** `{affected, replies}`: the chat lines produced while the command is handled
(a dialogue's or a teleport's later lines aren't in it). The console shows them under each
command.

## 2. Monster data catalog, for `!skin` (done)

**Done:** `GET /v1/catalog/monsters`: every monster data in the client (672, RDB 1010514,
binary XML), with the designers' name, motion set, anim graph, death effect package, and what
uses it (world characters and smashables by name, minifigures by template). Debug → Looks &
state lists them, used ones first, with Wear and Death fx; `!skin` completes them.

## 3. BCCState names, for `!state` (done)

**Done:** `GET /v1/catalog/bcc-states`: the six states the client's behaviour tree defines (1 Idle,
4 Fighting, 7 Flying, 29 Limbo, 69 Evade, 104 Building) with their action groups, and the
substates. Debug → Looks & state shows a button per state; `!state` completes them.

## 4. Animation catalog (done)

**Done:** `GET /v1/catalog/animations`: every animation attribute effect packages set (67), with
the anim graphs that have it and the packages that set it, plus the client's 559 motion sets
(4908 motions) and 33 anim graphs. The test command `!anim <attribute>` plays the package that
sets it (one that sets only that attribute where there is one). Debug → Animations, the effect
view's attribute buttons, and `!anim` completion use it.

## 5. Code hooks (done)

They were in the data as `<trigger type="code_hook" value="onhit">` on each timeline; the
extractor looked for another form. **Done:** `code_hooks` lists them (onhit, charge, execute,
on_projectile_fired, ...) and each timeline part has the `hook` that starts it. The effect view
shows a button per hook and labels the chart's lanes with them.

## 6. A schema for the effect catalog (done)

**Done:** `EffectCatalog` in `docs/openapi.json` (`Effect` = `EffectPackage` | `ParticleSystem`,
`Timeline`, `Particle`, `Sound`, `UsedBy`). Parts that last until the package stops have
`until_stopped: true` and `duration: null`; parts without a duration of their own
(use_duration="False") have `duration: null`; 0 is an instant. Particles are `{id, name}` and
sounds `{path, id}`, resolved through the client's resource name index (RDB 1020004,
tools/re/rdb_names.py): 2208 of 2224 particle references get an id and 2218 a name (packages
name most particles only by id). The browser still reads the old format from older servers.

## 7. Caching the catalog (done)

**Done:** the catalogs send `Cache-Control: private, max-age=3600` and an `ETag` (304 on
`If-None-Match`), and the API compresses answers (gzip, brotli).

## 8. Playing on a target (done)

**Done:** `!fx <id> [hook] [@near|@ground]`: `@near` plays the package with the nearest enemy or
smashable (15 m) as its named target, `@ground` at the player's feet. The effect view's "play
on" choice applies to Play, the hook buttons and stepping.

## 9. Listen to a sound (done)

**Done:** `GET /v1/catalog/sounds/{id}` (scope read) serves a sound effect packages play, as Ogg
Vorbis from the client's RDB (only ids in the catalog; needs the API's `--client-dir`). The
effect view has a ♪ button per sound. 4381 of the 4432 sound references resolve, by the client's
own lookup; the rest are music (another index), paths with a wrong prefix or folder, and files
that aren't in the client at all, which the game can't play either.

## 10. Names for every playfield (done)

**Done:** `GET /v1/playfields` lists every playfield (247, from the playfield descriptions) with
`teleport: true` for `!tp` destinations. Teleport lists only those; every other place shows a
name.

## 11. Despawning test spawns (done)

**Done:** `!despawn` removes the test spawns (`!spawn`, `!test`) within 30 m, `!despawn all` every
one on the playfield. Debug → Spawn & loot has both.
