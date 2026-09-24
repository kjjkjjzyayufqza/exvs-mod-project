# Map editor ← mission script preview

**Date:** 2026-09-20
**Status:** preview shipped; editing deliberately out of scope for this stage.

## The problem

A Triad Battle stage is described by two unrelated files that nothing in the
tool used to connect:

* the **map** — a geometry pack in the OB dplcache, reachable only by a hash
  name such as `0x4D1F5138.fhm2d`;
* the **mission script** — `051mission/<scene>/<scene>.c`, which names the map,
  declares every unit slot with a spawn position and a facing angle, and drives
  the waves.

Before this change a modder opened the map editor, hunted for the right
`.fhm2d` among ~19 000 hash-named packs, unpacked it by hand, and then read the
spawn coordinates out of the `.c` in a text editor and imagined where they
landed. That is the part Unreal and Unity solve with a level blueprint you can
open and see.

## The link that makes it work

```
mission .c            stage_list.bin                 dplcache
─────────────         ────────────────               ────────────────────
sys_0(0x40e, H)  ──►  row where entryId == H
                      row.fileName == P        ──►   0x<P>.fhm2d
                                                      │
                                                      ▼
                                       <extractOutputPath>\001stage\<packName>
                                                      │
                                                      ▼
                                          map editor "open stage folder"
```

`entryId` is the param id-table value (the stage-list card "ID"). `fileName`
is the field at offset `0x1C`. `recordLookupId` at offset `0x00` is a separate
small key (ミンスリー `0x21`, サイド7 `0x1`) and is not the mission hash.
The identity `sys_0(0x40e, …) == stage_list.entryId` was checked against the
19 documented mission map hashes in `missionMaps.ts` against the extracted
`012list/stage_list` (2026-09-23; an earlier note named `recordLookupId` and
was wrong):

* **18/19** matched a stage list row by `entryId`, each landing on the
  stage whose name matches the hash's documented Japanese name (サイド7,
  ミンスリー, ギアナ高地, …). The miss is `0x5EE38886` (アーモリー・ワン),
  which has no row in this stage list at all.
* **17/18** of those rows' `fileName` packs exist in the OB dplcache. The one
  miss is `テスト用デフォルトステージ`, an in-house test stage that ships no
  geometry.

None of the 19 hashes appears as a `recordLookupId`, `fileName`, `vs_s_d`,
`vs_s_l` or `vs_sn` value anywhere in the list.

`packName` comes from `src/assets/fhm2d-name-map.generated.json`
(`stage.model` route → `001stage/<name>`), so Side 7's pack lands in
`001stage\201stage201` rather than `001stage\0x4D1F5138`.

## Layers

| Layer | File | Owns |
|---|---|---|
| Parse | `src-tauri/src/format/mission_preview.rs` | Read a `.c` or `.mismsexc` from disk, decompile the compiled form in process, hand the existing `MissionScript::parse` the source, return `StageScriptConfig` + source kind + config-function name + mtime. |
| Command | `src-tauri/src/triad_route_commands.rs` | `load_mission_script_preview`, `mission_script_modified_ms`. |
| Derive | `src/services/missionPreview/missionPreviewService.ts` | Turn the config into spawn markers and deployment phases. No I/O beyond the two invokes. |
| Resolve | `src/services/mapLibrary/mapLibraryService.ts` | Map hash → stage row → pack path → extracted folder; extraction. |
| State | `src/page/SceneEdit/components/mission-preview/useMissionPreview.ts` | The loaded script, the display switches, the hot-reload poll, unit-name lookup. |
| Panel | `.../MissionPreviewPanel.tsx` | Read-only inspector: rules, phases, slots, display controls. |
| Draw | `.../MissionSpawnMarkers.tsx` | The three.js overlay, mounted inside `MapViewport`'s canvas. |

The parse layer is deliberately thin: `MissionScript::parse` already exists and
already round-trips 342 of the 343 shipped scripts byte for byte, so the
preview reads exactly what the route editor writes. Nothing new interprets
bytecode.

## What a slot means

`sys_0(0x400, slot, …)` takes 51 parameters. The ones with proven meaning, from
`format::mission_script_config::slot_param`:

| Param index | Field | Preview use |
|---|---|---|
| 0 | slot number | marker id, wave lookup |
| 2 | unit id (Character List `entryId`) | marker label |
| 3 | team — 0 player side, 1 enemy | marker colour |
| 5 | CPU partner flag | marker colour |
| 34, 35, 36 | X, Y, Z | marker position, used as raw world units |
| 37 | intro action — 0 still, 1 run, 2 fly, 3 hop, 4 roll | listed, not animated |
| 38 | facing, whole degrees | marker yaw |
| 39 | intro action frames | listed |
| 20 | AI level | listed |

**Coordinate space.** The positions are the same world units the map editor
already uses for placement rows (`PlacementRow.posX/posY/posZ` go straight into
a three.js `position`), so the overlay passes them through unchanged. Facing is
applied as `rotation.y = degToRad(facingDegrees)` on a marker modelled pointing
`+Z`. The shipped data corroborates the convention: in
`000triad_battle_a001_001` the player side sits at `z = -40` facing `0°` and
every enemy sits at `z = +350…+600` facing `180°`, i.e. the two sides face each
other. Quarter angles are not independently confirmed — a script that uses
`90°` will draw, but the handedness at 90/270 has not been checked against the
game.

**Y is an altitude, not a ground offset.** Slot 0 of `a001_001` spawns at
`y = 200`. The marker therefore draws its ring at the spawn point itself rather
than projecting a footprint onto the terrain.

## Deployment phases

Three kinds, derived in `buildMissionSpawnMarkers`:

* **initial** — the slot appears in no opening call and no wave. It is on the
  field from the first frame. In every shipped script this is the player and
  the CPU partner.
* **opening** — listed in `StageScriptConfig.openingSlots`, deployed by the
  opening function right after the battle-start signal.
* **wave N** — listed in `waves[N].deploySlots`. The phase function's branch
  shape is `if (global20 == N)`: wait until at most `enemiesAliveAtMost` enemies
  remain, count `delaySeconds` down, optionally show a cut-in, deploy.

The panel shows the gate verbatim ("when at most 1 enemy remains, after 1s")
rather than a wall-clock timeline, because the gate is conditional — there is no
honest way to put wave 3 at "t = 47s".

Roughly half the shipped scripts drive later waves with shapes the parser does
not model (mid-wave BGM changes, revive toggles, elapsed-frame gates). Those
report `wavesReadable: false` and an empty wave list instead of a guessed one;
their slots then all show as *initial*, which is visibly wrong rather than
quietly wrong.

## Hot reload

`mission_script_modified_ms` is a `stat`, not a parse. The hook polls it every
1.5 s while hot reload is on and only re-reads the file when the timestamp
actually moves. A modder can keep the `.c` open in another editor, save, and
watch the markers move — which is the whole point of a preview.

Reload never touches the loaded map: the geometry and the overlay are separate
state, so a script edit costs a parse, not a stage load.

## Why preview only

The route editor (`TestEditor → Triad Route`) already owns writing scripts, and
it round-trips them byte for byte. Adding a second writer that moves markers
with a gizmo would mean two things that can write the same 51-parameter call,
and the 11 parameters nobody has decoded would be at risk from whichever one
was less careful. The overlay therefore reads only. The extension point, when
editing is wanted, is a commit callback on the marker's drag that funnels into
the route editor's existing `ScriptSlot` writer — not a second script writer.

## Known limits

* Unit names come from `012list/character_list/character_list.bin` under the
  configured extract output path. When that file is missing the panel says so
  and shows raw ids; it does not silently hide the failure.
* `sys_0(0x355, …)` cut-in message hashes are carried through as hashes. No
  table in the repo resolves them to text.
* The overlay draws markers, not models. Loading the actual suit model per slot
  would need the unit model pipeline and is a separate piece of work.
