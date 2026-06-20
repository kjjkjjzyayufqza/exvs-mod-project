# 42001001 G-Self MSC 研究

生成日期：2026-06-20

本页只使用真实 `.c`、raw Param 和源 FHM2D 作为证据。旧
`docs/msc-research/generated` / `overlays` / `resolved` 工作流已经废弃；本机体没有生成
JSON 中间物。

上级入口：

- [MSC Research 入口](../../README.md)
- [跨机体 MSC 研究总览](../../cross-unit-msc-research-overview.md)
- [MSC 代际与 Param Action Bridge 对比](../../msc-generation-param-bridge-comparison.md)

身份由 Character ID Table 与 `character_list.json` 交叉确认：`42001001` 是
G-Self（Bellri Zenam），不是 Gundam Aerial。玩家语义候选参考
[EXVS2OB wiki G-Self](https://w.atwiki.jp/exvs2ob/pages/345.html)。wiki 证明本机由
Space Pack、Reflector Pack（stored/deployed）和 Assault Pack 组成，后者包含密集的
missile 武装；它不单独证明任何 `func_N` 或 hash 语义。

## Source map

Character ID Table:

```text
E:\XB\解包\com\file\012list\0x036B9E67\character_id_table.json
```

Row evidence:

| Field | Value |
|---|---:|
| `id` | `42001001` |
| `Param` signed | `590761575` |
| `Param` hex | `0x23364E67` |
| `Msc` signed | `1926067327` |
| `Msc` hex | `0x72CD747F` |

同一 Character ID row 的完整资源主键：

```text
Model  0xFCA6D36E    Effect 0x07FD46A9    Sound  0x3CE26EF7
Param  0x23364E67    Msc    0x72CD747F    Motion 0xD260FBED
```

Source FHM2D:

| Kind | Source | Size | SHA-256 |
|---|---|---:|---|
| MSC | `E:\OBHK0.3_v27\data\x64\dplcache_release\0x72CD747F.fhm2d` | `110742` | `506DF13DF1D7A26D9C09A5A2FB7EF04C9F699D18B1256A31814237AE81667A81` |
| Param | `E:\OBHK0.3_v27\data\x64\dplcache_release\0x23364E67.fhm2d` | `11931` | `E097D777BDF4227C946525B7AB5AD6700A752E8825A7974926B2B03393BDF1C8` |

Workspace:

```text
E:\XB\解包\com\file\040msc\0x72CD747F
E:\XB\解包\com\file\041cpm\0x23364E67
```

Decompiled scripts:

| Part | File | Lines | Functions | SHA-256 |
|---|---|---:|---:|---|
| `0` | `0.c` | `3706` | `main + func_0..func_144` | `8D01BD1202BEF1126105A4EA4D4567A29FFB6B4A695FE876072731FDEB45CDD9` |
| `1` | `1.c` | `34` | `main + func_1..func_5` | `24FF3EEB5235F34AE9B99918B1C59CC5D5D8972CEE09121DBAF3135F35E6452F` |
| `2` | `2.c` | `32709` | `main + func_1..func_1169` | `CF48C54997B7D50CE0798B7292AB08C92FAFF759E2545862CED60C0E5D6A4760` |

`1.c` is the same small glue shape as the other classic samples:

```c
void main(){ func_1(); callFunc3(func_2); }
void func_1(){ func_3(); }
void func_2(){ func_4(); func_5(); }
```

## Classification

G-Self is a classic local selector sample, not an external Param action-table sample.

Evidence:

- `0.c:256` reads `global39 = sys_0(0x10000, 0, 0x17)`.
- `0.c:3374-3683` uses `global39` as the local action selector state.
- `0.c:3685-3705` registers the fixed 17 input callbacks with `sys_1(0x10002, 0x1, hash, func_N)`.
- `2.c:31465-31638` writes state through `global143`, mirrors it into `global770`, selects
  `characterparam` row with `sys_1(0x60008, ...)`, and selects speed row through `global142`.
- `chrsysparam.csyspm` is 68 bytes with two `1 x 1` empty tables.
- `0.c` / `2.c` contain no `0x700000`, `0x700001`, `0x700002`, `sys_2C`, or `sys_2D`.

This makes G-Self structurally closer to Unicorn / Sinanju / Delta Plus / RX-78-2 than to
NEXA-N / AGE-FX.

## 0.c selector

`0.c func_143` is the main input-to-action selector. It switches on `global39`:

| `global39` | Selector evidence | Candidate role |
|---:|---|---|
| `0` | `0.c:3376-3456` | Space Pack candidate |
| `1` | `0.c:3458-3549` | Reflector Pack stored/deployed candidate A |
| `2` | `0.c:3551-3615` | Reflector Pack stored/deployed candidate B |
| `3` | `0.c:3617-3681` | Assault Pack / transformed loadout candidate |

Representative action hashes selected by `0.c`:

| State | Input gate | Action hash | `2.c` callback | Evidence |
|---:|---|---|---|---|
| `0` | `global48 & 0x1` | `0x66D33DAF` | `func_904` | `0.c:3453-3455`, `2.c:32331` |
| `0` | `global48 & 0x800` | `0x7CECBD11` | `func_908` | `0.c:3393-3395`, `2.c:32332` |
| `0` | `global48 & 0x80` and slot 1 ammo | `0x79E03E81` | `func_924` | `0.c:3382-3387`, `2.c:32333` |
| `0` | `global48 & 0x200` and slot 2 ammo | `0x243B31E4` | `func_916` | `0.c:3397-3404`, `2.c:32334` |
| `0` | `global48 & 0x100` | `0x24ADE100` / `0xD02BB74F` | `func_937` / `func_934` | `0.c:3411-3423`, `2.c:32347-32348` |
| `1/2` | `global48 & 0x1` | `0xEDAC1AA9` | `func_996` | `0.c:3546-3548`, `0.c:3612-3614`, `2.c:32349` |
| `1/2` | `global48 & 0x80` | `0xD1B0621B` / `0xC7C23444` | `func_1006` / `func_913` | `0.c:3480-3502`, `0.c:3561-3579`, `2.c:32352`, `2.c:32370` |
| `3` | `global48 & 0x1` | `0x3FB42C5D` | `func_1057` | `0.c:3678-3680`, `2.c:32363` |
| `3` | `global48 & 0x800` | `0xD33B48AE` | `func_1063` | `0.c:3619-3623`, `2.c:32364` |
| `3` | `global48 & 0x80` | `0x7D7AC30E` | `func_1068` | `0.c:3626-3630`, `2.c:32365` |
| `3` | `global48 & 0x100` | `0x387E5458` / `0x13EF79A7` | `func_1073` / `func_1079` | `0.c:3637-3656`, `2.c:32366-32367` |
| `3` | `global48 & 0x200` | `0x1953F3BF` | `func_1084` | `0.c:3663-3667`, `2.c:32368` |

## State and loadout bridge

The state bridge is explicit in `2.c`:

| State | Writer | `global143/global770` | Character row | Speed row | Slot rows |
|---:|---|---|---|---|---|
| `0` | `func_1125` | `0 / 0` | `0x1B12AE7D` | `0xC2B19D12` | `0:0x773015FD`, `1:0x3ED34AF9`, `2:0x95AAB560`, `3:0x1A1BB601`, `4:0x97B7D7D0` |
| `1` | `func_1128` | `1 / 1` | `0xF51CCF51` | `0x3767F2E5` | `0:0xB065185E`, `1:0x3816D59F`, `2:0x1DC3E42A`, `3:0x63BBE08E`, `4:0xDF2AB04B` |
| `2` | `func_1127` | `2 / 2` | `0x6C159EEB` | `0x76A00477` | `0:0xB065185E`, `1:0x5DDB6CA3`, `2:0x1DC3E42A`, `3:0x63BBE08E`, `4:0x97B7D7D0` |
| `3` | `func_1130` | `3 / previous` | `0x821BFFC7` | `0xC2B19D12` | `0:0x9CA9CD60`, `1:0x6895F764`, `2:0x52542E26`, `3:0x4B9779D0`, `4:0x2C4AD0C2` |

Line evidence:

- `func_1125`: `2.c:31465-31504`.
- `func_1127`: `2.c:31520-31549`.
- `func_1128`: `2.c:31585-31619`.
- `func_1130`: `2.c:31621-31638`.

`func_1126` also swaps state-1/state-2 slot 1 rows when crossing those states
(`2.c:31506-31518`). `func_1163` controls slot 2 display/availability for states 1/2
(`2.c:31552-31573`).

## Raw Param rows

`armsparam.bin` has `18` entries, `48` commands, entry size `200`, trailing size `1274`.
Key rows used by the state bridge:

| Row | Ammo | Reload type | Reload per shot | Cooldown | Damage | Count/interval |
|---|---:|---:|---:|---:|---:|---|
| `0x773015FD` | `8` | `1` | `180` | `120` | `180` | `120 / 90` |
| `0xB065185E` | `8` | `1` | `180` | `120` | `180` | `120 / 90` |
| `0x9CA9CD60` | `12` | `1` | `300` | `180` | `300` | `60 / 30` |
| `0x3ED34AF9` | `1` | `2` | `360` | `240` | `720` | `0 / 0` |
| `0x5DDB6CA3` | `1` | `1` | `720` | `480` | `1320` | `0 / 0` |
| `0x3816D59F` | `1` | `1` | `720` | `480` | `1320` | `0 / 0` |
| `0x95AAB560` | `2` | `0` | `780` | `600` | `1560` | `0 / 0` |
| `0x1DC3E42A` | `2` | `0` | `900` | `600` | `900` | `0 / 0` |
| `0x63BBE08E` | `1` | `2` | `1200` | `900` | `1800` | `0 / 0` |
| `0x97B7D7D0` | `120` | `0` | `1500` | `1200` | `1500` | `0 / 0` |
| `0xDF2AB04B` | `120` | `0` | `1500` | `1200` | `1500` | `90 / 90` |
| `0x2C4AD0C2` | `1` | `3` | `300` | `240` | `450` | `0 / 0` |

`bulletparam.bin` has `74` entries, `80` commands, entry size `320`. Representative
projectile rows emitted by callbacks:

| Action / function | Bullet rows | Raw bullet evidence |
|---|---|---|
| state 0 main, `func_907` | `0x3A4B1C51` | action `0x5230F7CE`, resource `0x45DC32EF`, lifetime `300`, duration `70`, interaction `0x5A9F1943` |
| CS setup / awakening reuse | `0x1B80391E` | lifetime `30`, interaction `0x01CEA2A0` |
| CS beam, `func_911` | `0x834FF331`, `0x7940CE52` | resource `0xE7C8F9F9`, speed `8`, max range `2000` |
| state 0 sub, `func_927` | `0x52ABC41A` | action `0x555D33D7`, resource `0xAF88C156`, shape `5`, speed `19`, lifetime `300` |
| state 0 slot 2, `func_918` | `0x5F8A3695` | resource `0xA7C64C3E`, move type `2`, speed `18`, child `0x8FF44DD5` |
| state 1/2 main, `func_999` | `0x5A5D4ABB` | action `0x5230F7CE`, resource `0xE3CD3DA1`, lifetime `300`, duration `70` |
| state 1/2 sub, `func_1009` | `0xAE2255A7` | action `0xFE6200EF`, resource `0x30526CBE`, speed `20`, lifetime `120` |
| state 3 main, `func_1060` | `0xA7218B3F`, `0x5D2EB65C` | action `0x676B5155`, resource `0xFB4C2648`, lifetime `300`, duration `70` |
| state 3 CS, `func_1066` | `0x81E5C689`, `0x7BEAFBEA`, `0x5308676F`, `0x874958B0` | paired beam rows, resource `0x36D57DEA` / `0x76FE19B5` |
| state 3 sub, `func_1071` | `0xC73A5C3C`, `0x5E330D86`, plus 10 more timed rows | multi-row bit volley family |
| state 3 special melee, `func_1086` | `0x593CEFED`, `0xA333D28E` | action `0x4F482208`, resource `0x0277C23D`, speed `30`, duration `400` |

`speedparam.bin` has three rows:

| Row | Linked state | BD init | BD max | Air speed | Step distance | Landing |
|---|---|---:|---:|---:|---:|---:|
| `0xC2B19D12` | state 0 / state 3 | `200` | `380` | `280` | `10` | `280` |
| `0x3767F2E5` | state 1 | `180` | `380` | `250` | `10` | `280` |
| `0x76A00477` | state 2 | `180` | `350` | `280` | `9` | `280` |

`characterparam.bin` has four row IDs matching the state writers:

```text
0x1B12AE7D, 0x6C159EEB, 0x821BFFC7, 0xF51CCF51
```

The current `characterparam` field names are not strong enough to use for player-facing cost
or HP conclusions here; use the row IDs as state-link evidence only.

## Representative `.c` chains

### Main shot candidate

```text
0.c:3453-3455
  global48 & 0x1 -> 0x66D33DAF
2.c:32331
  0x66D33DAF -> func_904
2.c:26153-26183
  func_906 setup uses slot 0
  func_907 emits sys_4F(0, global681, 0x3A4B1C51)
armsparam
  slot 0 row 0x773015FD / 0xB065185E, ammo 8
bulletparam
  row 0x3A4B1C51
```

Wiki names the visible main as Beam Rifle with 8 ammo and 75 damage. The `.c`/Param chain
proves the slot-0 8-ammo rifle family, while exact player damage should be verified in native
damage runtime before renaming the hash.

### Assault Pack shooting-CS candidate

```text
0.c:3393-3395
  global48 & 0x800 -> 0x7CECBD11
2.c:32332
  0x7CECBD11 -> func_908
2.c:26209-26303
  func_910 emits 0x1B80391E or func_1149/1150 by prior global770
  then writes state 3 loadout and calls func_1130 at timeline 0x834
2.c:26305-26326
  func_911 emits 0x834FF331 and 0x7940CE52
```

The callback switches into state 3 and emits its own projectile family. This matches the wiki's
shooting CS that changes into an Assault Pack attack. It does not match Aerial's Long Barrel;
the previous interpretation came from the wrong unit identity.

### Pack resource / missile-shell count candidate

`func_1146` manages `global776` as a 4-to-0 count against slot 4 ammo thresholds:

```text
slot 4 ammo >= 0x78 -> func_1131() -> global776 = 4
<= 0x5A -> 3
<= 0x3C -> 2
<= 0x1E -> 1
<= 0x00 -> 0
```

Evidence:

- Count logic: `2.c:31955-32085`.
- Reset: `2.c:31640-31645`.
- Visual shell toggles: `func_1134/1135`, around `2.c:31659-31806`.
- Projectile row families:
  - `func_1149`: `0xEFF12737 / 0x7195B294 / 0x06928202 / 0x9F9BD3B8 / 0xE89CE32E`
    at `2.c:32117-32138`.
  - `func_1150`: `0x872BE4AD / 0x194F710E / 0x6E484198 / 0xF7411022 / 0x804620B4`
    at `2.c:32141-32162`.
- All ten rows exist in `bulletparam.bin`, lifetime `30`, interaction `0x1241A530`.

The old Aerial interpretation called this a GUND-BIT count. That is invalid after the identity
correction. On G-Self it is more plausibly a pack resource or missile-shell visibility/count
bridge, but exact semantics still need animation and resource-name evidence.

### State 3 Assault Pack multi-projectile family

State 3 is entered by CS and has its own selector branch:

- Main: `0x3FB42C5D -> func_1057`, emits `0xA7218B3F / 0x5D2EB65C` plus timed bit rows
  (`2.c:29709-29842`).
- CS: `0xD33B48AE -> func_1063`, emits four beam rows (`2.c:29844-29921`).
- Sub: `0x7D7AC30E -> func_1068`, emits `0xC73A5C3C`, `0x5E330D86`, and ten additional
  timed rows (`2.c:29923-30010`), consistent with the Assault Pack missile-heavy kit.
- Special shooting: `0x387E5458 -> func_1073`, emits repeated `sys_4F(0, 5, ...)` rows and
  effect pairs (`2.c:30013-30161`).
- Front special shooting: `0x13EF79A7 -> func_1079`, a longer multi-wave moving sequence
  (`2.c:30163-30445`).
- Special melee: `0x1953F3BF -> func_1084`, emits `0x593CEFED` or `0xA333D28E`
  (`2.c:30447-30570`).

## Open questions

- The exact ordering of states `1` and `2` remains unresolved. `func_1127` and `func_1128` are
  clearly two Reflector-related loadouts, but motion/resource evidence is still required to
  decide stored versus deployed.
- `characterparam` named fields conflict with the wiki cost/HP values; this page therefore uses
  those rows only as state IDs.
- `armsparam` label offsets decode as non-plain text or packed references in this sample. Do not
  use them as names until the encoding is proven.
- Assist/summon semantics should be deepened by tracing `sys_51` payloads and matching resource
  objects, especially the `0xC7C23444 -> func_913` path. The wiki candidates include High-Torque
  Pack and Montero, depending on form/input.

## Current conclusion

G-Self adds an important classic local selector sample with four local states and a dense
pack-switch / Assault missile bridge. It proves that 68-byte empty `chrsysparam` units can
still have rich stateful weapon systems: the action matrix lives in `0.c func_143`, the action
registry lives in `2.c func_1166`, and the state/resource bridge lives in
`2.c func_1125/1127/1128/1130` plus raw `armsparam` / `bulletparam` / `speedparam` rows.
