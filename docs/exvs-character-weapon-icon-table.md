# Character pack weapon HUD icons (`weapon_icon`)

**Date:** 2026-08-29
**Status:** E1 structure + extract layout; HUD index = folder child order is the working model (not filename sort). Native loader name `imcWeaponIcon` / `imcWeaponArt` is string-pinned in OB `vsac27_Release.exe`.
**Kind:** character `.fhm2d` layout / HUD presentation

## One sentence

The in-game weapon bar does **not** scan the `weapon_icon/` directory alphabetically. It uses the **child order of the dedicated nutexb Folder** in the character pack `SubFileStructure`. Adding a `.nutexb` on disk is not enough; the structure tree must gain a new Item, then the pack must be repacked.

## Where the files live

Extracted Unit Model layout:

```text
<unit>_model/
  models/...
  textures/          body/weapon PBR nutexb (numatb refs)
  weapon_icon/       HUD icon nutexb only — separate group
  ...
<unit>_model_structure.json
```

The extract classifier treats a root-level Folder whose descendants are **all** `.nutexb` as `weapon_icon` (`src-tauri/src/format/unit_model_extract.rs`). Those files are **not** merged into `textures/`.

On-disk names are only for humans and for `fileUrl`. The game identity of “icon N” is: **Nth Item under that Folder**.

## Rebellion (current pack)

`002chara/wing_gundam_zero_rebellion_model_structure.json` → package-root child 4, Folder of 7 Items:

| Structure index | fileIndex | Stem | HUD use (vanilla EW) |
|---:|---:|---|---|
| 0 | 16 | `016_001_001_busterrifle` | slot 0 主射 |
| 1 | 18 | `016_001_001_tallgeese` | slot 1 援护 |
| 2 | 19 | `016_001_001_twin_busterrifle` | slot 2 特射 |
| 3 | 5 | `016_001_001_jump` | slot 3 飛翔 |
| 4 | 17 | `016_001_001_zero_system_reload` | slot 4 Zero System loading |
| 5 | 20 | `016_001_001_zero_system` | slot 4 Zero System ready |
| 6 | 21 | `001_001_001_BEAMRIFLE` | **extra**; no HUD slot 6 unless MSC binds one |

Vanilla EW used six icons. Index 6 is already in the **tree**, not only on disk. Explorer sort puts `001_001_001_BEAMRIFLE` first; that is **not** HUD slot 0.

Vanilla six files are 41648 bytes each. `BEAMRIFLE` is 34924 bytes (different payload; unproven as a valid HUD art size).

## How the engine uses them

OB strings:

```text
%s/imcWeaponIcon
%s/imcWeaponIcon/imcWeaponArt
```

(`vsac27_Release.exe.md` `.rdata` near `imcBulletBar` / `imcChargeBar`.) This is the 2D HUD widget that consumes the folder as an ordered art list. Slot **N** on the right-hand bar draws `imcWeaponArt[N]` (and Zero System uses two consecutive arts for loading vs ready). Unbinding MSC slot 3 hides that cell; it does **not** compact later icons down.

A new icon at the **end** of the folder does not appear as a new bar by itself. A new bar also needs:

1. an `armsparam` row
2. MSC `sys_4F(0xB, slot, row)` so that HUD slot exists
3. an icon at **that slot index** in this table (and extra arts if the slot has loading/ready states)

To **change** an existing bar’s picture, replace the nutexb of the Item already at that index (keep `fileIndex`). Do not append.

## How to add a new icon (pack contract)

1. Author a HUD `.nutexb` (match the six vanilla ~41 KB icons unless you have evidence another size works).
2. Copy it into `weapon_icon/<stem>.nutexb`. Naming `016_001_001_<role>` is the EW convention, not a proven native hash lookup.
3. Edit `*_structure.json`:
   - append a `SubFileData` record with a new `fileIndex`, `fileType=".nutexb"`, `fileUrl` pointing at that file
   - in the weapon_icon Folder, append an `Item` with that `fileIndex` (place it at the HUD index you want; order = display index)
   - increment that Folder’s `folderCount`
   - increment `Fhm2dTotalCount`
4. Repack the character `.fhm2d` from this structure (Unit Model Repack). The loose folder is not what the exe reads.

Do **not** use the Textures panel “add nutexb”: `add_unit_model_nutexb` copies into `textures/` and only updates `SubFileData`. It never inserts into the weapon_icon Folder, so the HUD table does not grow. Use the Icons tab instead.

## Unit Model Editor

Dedicated left-tab **Icons** (not the Textures pool):

| Action | Behavior |
|--------|----------|
| List | `weapon_icon` Folder children in structure order, labeled `HUD 0…` |
| Add | Copies `.nutexb` into `weapon_icon/`, new `SubFileData`, new Item, `folderCount++`. Creates the Folder if the pack has none. |
| Replace | Overwrites bytes at the existing `fileIndex` (HUD index unchanged) |
| Reorder | Permutes Items in that Folder only |
| Remove | Drops the Item; last icon also drops the Folder; `SubFileData`/file only if nothing else references `fileIndex` |

Rust: `src-tauri/src/format/unit_model_weapon_icons.rs`. Commands: `list_unit_model_weapon_icons`, `add_unit_model_weapon_icon`, `reorder_unit_model_weapon_icons`, `remove_unit_model_weapon_icon`.

The Textures tab still lists icon nutexb as pool files. **Add texture** still writes `textures/` and does **not** grow this HUD table.

Add / replace model still does not touch weapon icons (`docs/agent-sessions/unit-model-editor/add-replace-model-design.md`).

## Do not

- Treat Explorer alphabetical order as HUD order.
- Assume appending a file to the folder is a pack edit.
- Put HUD icons in `textures/` or reference them from numatb.
- Expect a 7th icon to show without MSC/armsparam slot 6.
- Copy Gyan `sys_4F(0x16)` as a way to “pick another icon”; that flag seals FLYING HUD, it does not retarget art.
