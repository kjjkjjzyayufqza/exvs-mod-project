# Character pack weapon HUD icons (`weapon_icon`)

**Date:** 2026-08-29, revised 2026-09-02
**Status:** E3 in-game 2026-09-02 (Rebellion bird slot 1). Folder child order is the art table. Which art a bound HUD cell draws is the bound armsparam row's `fieldBb93d195` (`0xBB93D195`), not the MSC slot index. Native loader name `imcWeaponIcon` / `imcWeaponArt` is string-pinned in OB `vsac27_Release.exe`. IDA HUD-widget read of that field is still not E2.
**Kind:** character `.fhm2d` layout / HUD presentation / armsparam

## One sentence

The art list is the **child order** of the dedicated nutexb Folder in the character pack `SubFileStructure`. MSC `sys_4F(0xB, slot, row)` only decides **which cell exists**. The picture in that cell is `row.fieldBb93d195` → `imcWeaponArt[index]`. Adding a `.nutexb` on disk is not enough; the structure tree must gain a new Item, then the pack must be repacked.

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

On-disk names are only for humans and for `fileUrl`. The game identity of “art N” is: **Nth Item under that Folder**. MSC slot index is a different number.

## How the engine uses them

OB strings:

```text
%s/imcWeaponIcon
%s/imcWeaponIcon/imcWeaponArt
```

(`vsac27_Release.exe.md` `.rdata` near `imcBulletBar` / `imcChargeBar`.)

Two independent indices:

| Index | Owner | Meaning |
|---|---|---|
| MSC HUD slot | `sys_4F(0xB, slot, row)` | Which right-hand **cell** exists (0=主射, 1=援护, …). Unbind with row `0`. Unbinding hides that cell; later cells do **not** compact. |
| Art index | armsparam `fieldBb93d195` (`0xBB93D195`) | Which Folder child to draw in that cell. JSON key `fieldBb93d195`. Pool name is still `field_bb93d195` (no E2 HUD-widget consumer yet). |

`command_mapping.md` called `0xBB93D195` `bullet_type` with range `{0..7}`. That is a historical claim, not current truth: TV Wing Zero uses values 0–10 against an 11-art Folder.

A new art at the **end** of the folder does not appear by itself. To show it on an existing cell, set that cell’s **row** `fieldBb93d195` to the new Folder index. To show it as a **new** cell, also bind a new MSC slot.

To **replace** the bytes of an already-referenced art, overwrite the nutexb of that Item (keep `fileIndex`). That changes every row that points at that index.

## Other units (E1)

TV Wing Zero `028gunwtv_001gunwtv_001`: Folder of 11. Ground slot 1 binds `0x44EA221C` MACHINE_CANNON with `fieldBb93d195=3` (machinecannon). Bird slot 1 still uses MSC slot 1 but binds `0xAEEE8724` with `fieldBb93d195=6` (twinbuster_ma_release). Same cell, different art.

Hambrabi `002zgundm_006hambrb_001`: Folder `beam`, `beamrifle`, `fedayeenrifle_laser`, `kumonosu`, `beamrifle_ma`. Ground rifle rows use `1`; MA rifle rows use `4`.

Zero System “two pictures on one bar” is two rows on the same MSC slot (`0x0D7FCDE2` index 4 loading, `0x9398CED9` index 5 ready on Rebellion), not one row with two icons.

## Rebellion (current pack)

`002chara/wing_gundam_zero_rebellion_model_structure.json` weapon_icon Folder (`folderCount=8`):

| Art index | fileIndex | Stem | Rows that point here |
|---:|---:|---|---|
| 0 | 16 | `016_001_001_busterrifle` | ground/flight 主射 `fieldBb93d195=0` |
| 1 | 18 | `016_001_001_tallgeese` | ground 援护 `0x11BE199D` |
| 2 | 19 | `016_001_001_twin_busterrifle` | 特射 |
| 3 | 5 | `016_001_001_jump` | 飛翔 |
| 4 | 17 | `016_001_001_zero_system_reload` | Zero System loading |
| 5 | 20 | `016_001_001_zero_system` | Zero System ready |
| 6 | 21 | `001_001_001_BEAMRIFLE` | unused extra |
| 7 | 120 | `wep_3_h_n_b_g` | flight slot 1 `0x04DC0DEE` |

Explorer sort puts `001_001_001_BEAMRIFLE` first; that is **not** art 0. Vanilla six files are 41648 bytes each. `BEAMRIFLE` is 34924 bytes.

Flight MSC (`rebellion_install_bird_weapon_bar`) already binds slot 1 to `0x04DC0DEE`. It does **not** pick the file. 2026-09-02: `0x04DC0DEE` `fieldBb93d195` 1 → 7. Ground `0x11BE199D` stays 1.

In-game H / P / F (E3, 2026-09-02, user):

- H: `fieldBb93d195` on the bound row selects `weapon_icon` Folder child.
- P: bird HUD cell 1 shows `wep_3_h_n_b_g`; ground 援护 still tallgeese.
- Result: P held. One-variable change; ground cell 1 unchanged.

## How to add a new icon (pack contract)

1. Author a HUD `.nutexb`, or a PNG/DDS/TGA that the Icons tab converts with the Textures DDS-format picker. Match the six vanilla ~41 KB icons unless you have evidence another size works.
2. Copy/convert into `weapon_icon/<stem>.nutexb`. Naming `016_001_001_<role>` is the EW convention, not a proven native hash lookup. Do not put HUD icons in `textures/`.
3. Edit `*_structure.json`:
   - append a `SubFileData` record with a new `fileIndex`, `fileType=".nutexb"`, `fileUrl` pointing at that file
   - in the weapon_icon Folder, append an `Item` with that `fileIndex` (place it at the HUD index you want; order = display index)
   - increment that Folder’s `folderCount`
   - increment `Fhm2dTotalCount`
4. Repack the character `.fhm2d` from this structure (Unit Model Repack). The loose folder is not what the exe reads.
5. Point an armsparam row at that art index (`fieldBb93d195`). Existing cells: change that row only. New cells: also `sys_4F(0xB, slot, row)`.

Do **not** use the Textures panel “add nutexb”: `add_unit_model_nutexb` copies into `textures/` and only updates `SubFileData`. It never inserts into the weapon_icon Folder, so the HUD table does not grow. Use the Icons tab instead.

## Unit Model Editor

Dedicated left-tab **Icons** (not the Textures pool):

| Action | Behavior |
|--------|----------|
| List | `weapon_icon` Folder children in structure order, labeled `HUD 0…` |
| Add | PNG/DDS/TGA convert through the same nutexb pipeline as Textures, or copy an existing `.nutexb`, into `weapon_icon/` (never `textures/`). New `SubFileData`, new Item, `folderCount++`. Creates the Folder if the pack has none. Same-name conflict: check the row to replace in place (HUD index / `fileIndex` unchanged). |
| Replace | Overwrites bytes at the existing `fileIndex` (HUD index unchanged). Accepts `.nutexb` / `.png` / `.dds` / `.tga`. |
| Reorder | Permutes Items in that Folder only |
| Remove | Drops the Item; last icon also drops the Folder; `SubFileData`/file only if nothing else references `fileIndex` |

Rust: `src-tauri/src/format/unit_model_weapon_icons.rs`. Commands: `list_unit_model_weapon_icons`, `add_unit_model_weapon_icon`, `reorder_unit_model_weapon_icons`, `remove_unit_model_weapon_icon`.

The Textures tab still lists icon nutexb as pool files. **Add texture** still writes `textures/` and does **not** grow this HUD table.

Add / replace model still does not touch weapon icons (`docs/agent-sessions/unit-model-editor/add-replace-model-design.md`).

## Do not

- Treat Explorer alphabetical order as HUD order.
- Treat MSC slot index as the art index. TV ground slot 1 draws art 3; bird slot 1 draws art 6.
- Assume appending a file to the folder is a pack edit.
- Put HUD icons in `textures/` or reference them from numatb.
- Expect a new Folder child to show without a row `fieldBb93d195` pointing at it.
- Bind a new MSC slot just to change a picture on an existing cell.
- Copy Gyan `sys_4F(0x16)` as a way to “pick another icon”; that flag seals FLYING HUD, it does not retarget art.
- Treat `command_mapping.md` `bullet_type` as the identity of `0xBB93D195`.
- Rename the armsparam pool key from `field_bb93d195` until an E2 HUD-widget consumer exists.
