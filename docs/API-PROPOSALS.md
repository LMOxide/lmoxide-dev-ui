# Proposed API changes

> **Items 1 and 2 landed in lmoxide `2c668c5`** ("Test command catalog, command replies,
> !spawn"), together with `GET /v1/catalog/test-commands`, which the browser's Debug view and
> command completion use (scenarios, `!goto` targets, dialogues, loot kinds, spawnable names,
> looks). Each item says how. New proposals go under a new heading at the end.

Changes to `lmoxide-api` (and the test commands in `crates/lmoxide-server/src/devcmd.rs`) that
the effect browser needs or would benefit from. Found while building its first version
(2026-10-26), against `docs/openapi.json`, `docs/EFFECT-BROWSER.md` and
`data/effect_catalog.json` as of that day. The browser does not work around any of them; each
item says what it does today and what it would do once the change lands.

## 1. Command replies

`POST /v1/players/{account_id}/command` answers `{"affected": n}`. What the command said
("effect package 1748 (12 of 2518)", "usage: !skin <monster data id> | reset", the GM level
refusal) only reaches the game chat, so the browser can't tell a played effect from a typo or a
refused command: it only knows the request reached the player.

Proposed: the reply lines in the answer, e.g.

```json
{ "affected": 1, "replies": ["effect package 1748 (12 of 2518)"], "ran": true }
```

`ran: false` when the player's GM level is too low or the command is unknown (or a 403/422 with
the reason). A command whose result arrives later can leave `replies` empty.

**Done:** the answer is `{affected, replies}` (lines produced while the command is handled; a
dialogue's or a teleport's later lines aren't in it). The console shows the replies under each
command, and the status bar the latest.

## 2. Monster data catalog (for `!skin`)

`!skin <monster data id>` takes ids nobody can browse. Proposed: `GET /v1/catalog/monsters`
(scope read), `{monsters: [{id, name, mesh or look name, kind (npc, enemy, boss, smashable,
mount, ...), used_by: [{playfield, spawn or encounter name}]}]}`, from the client RDB like the
effect catalog.

**Done, in part:** `looks` in `GET /v1/catalog/test-commands` lists the monster data of every
character and smashable placed in the world, with their names (Debug → Looks & state, and `!skin`
completion). Monster data that nothing in the world uses (unused looks, other minifigures'
bodies) is still missing: a full list from the client RDB would add those.

## 3. BCCState names (for `!state`)

Only 1 (normal), 29 (Limbo, smashed) and 104 (building) are known to the browser, from the
devcmd help. Proposed: the names of every BCCState value the client knows, e.g.
`GET /v1/catalog/bcc-states` → `[{value, name}]` (or put them in the openapi schema as an enum
with descriptions).

Browser today: three preset buttons and a number box. Then: a full picker.

## 4. Animation catalog

Packages switch EMotionFX animations through `animation_attributes` (`limbostart`,
`chainattack`, ...), but there is no list of which motions an attribute selects or which
animations exist. Proposed: `GET /v1/catalog/animations` → `{attributes: [{name, motions:
[name], used_by_packages: [id]}]}`, and, if the game server can, a test command to play a motion
on the character (e.g. `!anim <name>`).

## 5. Code hooks

`code_hooks` is empty in all 2518 packages of the current `effect_catalog.json`, while
`!fx <id> <hook>` takes one ("e.g. limbostart"). Either the extractor misses them or the hook
names live elsewhere. Proposed: fill `code_hooks` per package (or a top-level `code_hooks:
[name]` list of every hook the client knows).

Browser today: shows a button per listed hook (none appear with the current data) and a free
"code hook" box suggesting the package's animation attributes and `limbostart`.

## 6. A schema for the effect catalog

`GET /v1/catalog/effects` is `type: object` in `docs/openapi.json`. Proposed: a real schema
(`EffectCatalog`, `EffectPackage`, `ParticleSystem`, `Timeline`, `UsedBy`) so clients can generate
types; this app keeps hand-written ones in `src/types.ts`. Worth stating in it:

- looping timeline parts use `duration: 86400` ("until stopped"); a `null` duration or a flag
  would be clearer;
- 132 timeline parts have `duration` 0 or less;
- `particles` mixes resource names and bare numeric ids (e.g. `"3429"`): resolving the ids to
  names, or splitting `{id, name}`, would make them searchable.

## 7. Caching the catalog

The catalog is about 2.2 MB, static for a given server build, and sent with `no-store` like
every non-game-data route. Proposed: `Cache-Control: private, max-age=3600` plus an `ETag`
(the file's hash), and gzip/br compression, so reloading the browser doesn't fetch it again.

## 8. Playing on a target

Many packages put parts on `target`, `ground` or `other` (981, 471 and 425 timeline parts);
`!fx` plays the package on the player's own character, so those parts may show nothing or
show at the character. Proposed: `!fx <id> [hook] [@target]`, where the target is the nearest
NPC/enemy (as `!smash` picks one) or the player's current target.

## 9. Listen to a sound

Packages are mostly recognised by sound. Proposed (low priority): `GET /v1/assets/sound?path=`
(scope read) serving a `.wav` from the client data, restricted to the paths that appear in
the catalog, so the browser can play it inline.

## 10. Names for every playfield

`GET /v1/playfields` lists the `!tp` destinations, so targets and spawns in playfields without
an arrival point show as bare numbers: 1300 (the tutorial) and 4610 appear in the test command
catalog. Proposed: a name for every playfield id the API can return (e.g. `GET /v1/playfields`
with a `teleport: bool` per entry), so tools never show a bare id.

## 11. Despawning test spawns

`!spawn` and `!test` spawns stay 15 minutes. Proposed: `!despawn` (every test spawn of the
player, or around them), so a crowded test area can be cleared at once.

