# Gyan / Param / Tooling Session Handoff (2026-07-11)

**Kind:** Multi-topic session log (tooling + characterparam empirical + MSC flight camera/effect + package mapping)  
**Primary MSC tree:** `E:\XB\mod\040msc\001gundam_005gyan00_001_N2_rocket_mod\`  
**Primary unit id (user):** `900000003` → Param `0x35B195CC`  
**Status:** Analysis and tooling updates landed; camera move to ENTRY/RELEASE recommended but may still sit on `func_452`/`func_464` until user applies the move.

This file is the **session entry** for 2026-07-11. Prefer it over chat memory for topics listed below. Earlier Dodai aim/throw work remains in [gyan-dodai-session-2026-07-10-handoff.md](./gyan-dodai-session-2026-07-10-handoff.md).

---

## 0. Document index (what to open)

| Topic | Doc |
|-------|-----|
| This session (all topics) | **This file** |
| Dodai throw aim / RELEASE stuck / DRIVER | [gyan-dodai-session-2026-07-10-handoff.md](./gyan-dodai-session-2026-07-10-handoff.md) |
| characterparam 红锁 / HP empirical | [../characterparam-field-notes.md](../characterparam-field-notes.md) |
| Hyaku flight / Dodai mount | [units/2002001-hyaku-shiki/README.md](./units/2002001-hyaku-shiki/README.md) |
| Gyan↔Hyaku flight port design | [../superpowers/specs/2026-06-27-gyan-hyaku-shiki-flight-porting-notes.md](../superpowers/specs/2026-06-27-gyan-hyaku-shiki-flight-porting-notes.md) |
| Camera syscall | [../exvs-msc-syscall-53-notes.md](../exvs-msc-syscall-53-notes.md) |
| sys_47 bone/scale/umbrella | [../exvs-msc-syscall-47-notes.md](../exvs-msc-syscall-47-notes.md) |
| AI MSC edit markers | [msc-ai-edit-block-rule.md](./msc-ai-edit-block-rule.md) |
| Resource surface (boost/speed names) | [resource-control-surface-for-modders.md](./resource-control-surface-for-modders.md) |
| command_mapping (annotated) | [../command_mapping.md](../command_mapping.md) |
| LockDistance IDA note (provisional) | [../ida-dumps/sub_1405F8600_LockDistanceGetter.md](../ida-dumps/sub_1405F8600_LockDistanceGetter.md) |

---

## 1. Unit / package mapping (why edits “do nothing”)

### 1.1 Unit `900000003`

From `E:\XB\mod\012list\character_id_table\character_id_table.json`:

| Field | Value | Hex |
|-------|-------|-----|
| id | 900000003 | `0x35A4E903` |
| Model | 1188993948 | `0x46DE9B9C` |
| Effect | (signed) | `0xB0476F04` |
| Param | 900830668 | **`0x35B195CC`** |
| Msc | (signed) | `0xFEEA714A` |
| Motion | (signed) | `0xD1EA9D62` |

### 1.2 Two folders, same `HashName` (trap)

| Folder | Structure HashName | Notes (session snapshot) |
|--------|--------------------|---------------------------|
| `041cpm\001gundam_005gyan00_001_N2_rocket_mod\` | `0x35B195CC` | Often the **edited** copy (e.g. red_lock-like fields already 1000) |
| `041cpm\gundam_005gyan00_35b195cc\` | `0x35B195CC` | Name matches hash; often the pack actually used if structure points here |

**Rule:** Game loads Param by **hash `0x35B195CC`**. Which folder is packed depends on which `*_structure.json` you rebuild. Always edit + repack the folder your structure actually references.

### 1.3 characterparam active rows (Gyan)

| entryId | When (MSC) |
|---------|------------|
| `0x1B12AE7D` | Default / `func_999` / `func_1000` restore — `sys_1(0x60008, 0x1b12ae7d)` |
| `0x6C159EEB` | Special state `func_998` — `sys_1(0x60008, 0x6c159eeb)`, `global143 = 1` |

Edit **both** rows for HP / 红锁 if both states are used.

---

## 2. characterparam empirical field identity (user-verified)

**Canonical note:** [../characterparam-field-notes.md](../characterparam-field-notes.md)

| Pool / UI name | Hash | Old label | User-verified |
|----------------|------|-----------|---------------|
| `boostGaugeInitial` | `0xB7D5327E` | initial boost | **HP** |
| `lockOnDistanceMax` | `0xA223C183` | max lock distance | **红锁** (edit both) |
| `alertRangeDistance` | `0xBAE8C388` | alert range | **红锁** (edit both) |
| `red_lock_distance` | `0x08ECF0BE` | red lock (IDA a2=0) | **Not confirmed** as UI 红锁 |

**Mod checklist**

1. Correct Param pack (`0x35B195CC` structure).
2. Both characterparam entries if needed.
3. 红锁: `lockOnDistanceMax` **and** `alertRangeDistance`.
4. HP: `boostGaugeInitial` (name is wrong).

Pool renames deferred; code comments + command_mapping notes point here.

---

## 3. speedparam + flight + boost (MSC evidence)

### 3.1 `global142` rows on Gyan N2 rocket mod `2.c`

| Value | Role |
|-------|------|
| `0xC2B19D12` | Default init; restore paths; **common transform flight** (`global143 == 0` when transform actions bound) |
| `0xB7027DBE` | Only via **`func_998`** special state (`global143 = 1`) |

Assignment sites (approx): init `global142 = 0xc2b19d12`; `func_998` → `0xb7027dbe`; `func_999` / `func_1000` → `0xc2b19d12`.

**Important:** When `global143 == 1`, transform actions `0x9475130E` / `0x77B100FF` / `0xA02D57DC` are bound to `0` (disabled). So:

- **Transform flight (slots 0x23/24/25 + func_450/452)** → stays on **`0xC2B19D12`**.
- **func_998 special loadout** → **`0xB7027DBE`**.

Labels (kind-7 strings) on these rows (exvs2_json): e.g. C2 `SKL_MOVE`, B7 `SKL_MOVE_SHIELD`, resource `CHR_001GUNDAM_005GYAN00_001`.

### 3.2 Boost gauge “half rate” is **not** transform MSC `/2`

- Transform path (`func_450`/`452`/`464`, `GYAN_TRANSFORM_*` slots) has **no** `value / 0x2` on boost gauge.
- Only MSC `/ 0x2` on speed field `0x11FFDDB4` (`boost_dash_initial_speed`) is in **`func_407`** (BD ramp), not flight.
- Base gauge drain is primarily **engine + speedparam**; MSC mainly gates with `sys_0(0x60000)`.
- Both C2 and B7 rows had `boostConsumptionBase = 0` in one snapshot — zero may mean engine default path, not “half from MSC”.

### 3.3 Tunables for boost feel (data first)

Prefer `speedparam` row **`0xC2B19D12`** for transform flight: `boostConsumptionBase`, `boostConsumptionType`, efficiency fields. See [resource-control-surface-for-modders.md](./resource-control-surface-for-modders.md).

---

## 4. Flight camera (拉远镜头)

### 4.1 API

- Zoom candidate: **`sys_53(0x2, a, b, duration)`** ([exvs-msc-syscall-53-notes.md](../exvs-msc-syscall-53-notes.md)).
- Preset: `func_321` → `sys_53(0x4, hash, …)`; clear `sys_53(0x5)`.
- Working trial params (user success): `sys_53(0x2, 0x15e, 0x118, 0xbb8)`; restore `sys_53(0x2, 0x64, 0x64, 0xbb8)`.

### 4.2 Where code is / should be

| Layer | Functions | Verdict |
|-------|-----------|---------|
| Common controller | `func_452` pull / `func_464` restore | **Works**; dirty for porting |
| Gyan slots | `GYAN_TRANSFORM_ENTRY_SLOT` / `RELEASE_SLOT` first frame | **Recommended** |
| Mount helpers | `GYAN_TRANSFORM_MOUNT_SPAWN/RELEASE_RESERVED` | **Only if** camera = mount visual; also used by Dodai special shot |

**Recommended final shape**

```text
GYAN_TRANSFORM_CAMERA_PULL() / RESTORE()
ENTRY_SLOT (global226==0): PULL after mount spawn
RELEASE_SLOT (global226==0): RESTORE after mount release
Remove blocks from func_452 / func_464
Do NOT put camera in MOUNT_* unless Dodai throw should zoom too
```

Timing: ENTRY is slightly earlier than `func_452` (after `func_69(0x23)`).

### 4.3 Always pair enable + cleanup

Cancel / death / BD interrupt may need extra `RESTORE` if release slot is skipped.

---

## 5. Hyaku Dodai spawn “effect” vs Gyan N2 mount

### 5.1 Hyaku (reference `002zgundm_002hyaksk_001\2.c`)

| Call | Role |
|------|------|
| `sys_4B(0x2, 0x7AD84955, 0x8CCFAE67, 0x4094B0F4)` | Attach Dodai model + bone |
| `sys_47(0x25, 0x7AD84955)` | Model presentation on (`func_915(1)`) |
| `sys_47(0x26, 0x7AD84955)` | Pair off |
| `sys_4A(0, 0x58F6D3B6, 0x7AD84955, …)` | Attach aleo/effect to Dodai (entry timed) |
| `sys_47(0x12, 0x7AD84955, boneHash, …)` | **Bone scale** (not particle hash); bones `0x12BCD15F` / `0xE8B3EC3C` |
| `func_914` → `func_915(1)` | Re-assert mount while `global24 & 0x4000` |

Entry slot `func_874`: motions, `sys_58`, `func_1085(1)` loadout; timed `sys_4A(0, 0x58f6d3b6, …)`.

### 5.2 Gyan N2 mount (current)

```text
sys_4B(0x2, 0xA59612D5, 0x1, 0x4094B0F4)
sys_47(0x10 / 0x11, …)   // rotate/position only
// missing: 0x25/0x26, sys_4A aleo, bone scale, re-assert loop
```

### 5.3 Can Gyan use Hyaku effects?

| Item | Copy? |
|------|--------|
| Call shape `sys_47(0x25/0x26, model)` | Yes, with **Gyan model** `0xA59612D5` |
| Hyaku aleo `0x58F6D3B6` + model `0x7AD84955` | **No** without packaging those assets into Gyan |
| Hyaku bone hashes for `0x12` | **No** — use N2 jnttbl bones or 0 |
| Mount bone `0x8CCFAE67` | **No** — Gyan already learned this sticks model to floor |

**First experiment:** add `sys_47(0x25/0x26, 0xA59612D5)` on SPAWN/RELEASE. If no VFX, port or author aleo for N2, then `sys_4A(0, aleo, 0xA59612D5, …)`.

---

## 6. Param Editor / tooling (repo code)

### 6.1 List labels (action / resource)

- `readTypedEntryLabels(entry, fileBytes?)` in `paramEntryUtils.ts`.
- Prefers decoded strings (`actionLabel` / `resourceLabel`); else decodes kind-7 **absolute offsets** via reconstructed trailing pool (`trailingFileBytes`) — needed for **characterparam** `actionLabelOffset` / `resourceLabelOffset`.
- Shown under entry hash on left list (`ParamEntryListRow`), order action then resource, truncate + title.

### 6.2 Extract destination

- **Default:** Extract to **Workspace** (`projectRootDir` / Test Editor WS), e.g. `E:\XB\mod\041cpm\<Name>`.
- **Optional:** Extract to Output Folder when Config `extractOutputPath` is set and **≠** WS.
- **Extract All** → workspace only (not extract output path).
- Path is **not** hardcoded to `解包`; that was `extractOutputPath` config.

---

## 7. MSC path map (N2 rocket mod transform)

```text
0.c slots 0x17/0x18/0x19 → transform hashes
2.c registry (global143==0):
  0x9475130E → func_450 → func_69(0x23) → GYAN_TRANSFORM_ENTRY_SLOT
  0x77B100FF → func_452 → func_69(0x24) → GYAN_TRANSFORM_LOOP_SLOT
  0xA02D57DC → func_464 → func_69(0x25) → GYAN_TRANSFORM_RELEASE_SLOT
Mount: GYAN_TRANSFORM_MOUNT_SPAWN/RELEASE_RESERVED (model 0xA59612D5)
Also called from GYAN_DODAI_SPECIAL_SHOT_START/RELEASE
Special state: func_998/999/1000 (global143, global142 B7↔C2, sys_1 0x60008)
```

---

## 8. Open follow-ups

1. Apply camera move to ENTRY/RELEASE + remove `func_452`/`func_464` blocks if still present.
2. Optional: `sys_47(0x25/0x26)` on Gyan mount; then own aleo if needed.
3. Reconcile IDA `0x08ECF0BE` with empirical 红锁 pair (`0xA223C183` + `0xBAE8C388`).
4. Reconcile `boost_gauge_initial` vs `max_hp` HP roles.
5. Confirm which `0x35B195CC` structure is the live mod pipeline; collapse duplicate folders if possible.
6. Boost drain while flying: engine probe if speedparam zeros still drain.

---

## 9. Verification commands (when editing MSC)

```powershell
python .\tools\check_msc_ai_blocks.py "E:\XB\mod\040msc\001gundam_005gyan00_001_N2_rocket_mod\2.c"
python tools/tests/test_gyan_dodai_throw_aim_analysis.py
```

Param labels / entry utils:

```powershell
npx vitest run src/page/TestEditor/components/param-editor/paramEntryUtils.test.ts
```
