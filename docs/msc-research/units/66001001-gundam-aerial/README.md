# 66001001 Gundam Aerial MSC 研究

生成日期：2026-06-20

本页只使用实际反编译 `.c`、raw Param 和源 FHM2D。没有生成 analysis JSON、
semantic overlay 或 resolved-label 中间物。

上级入口：

- [MSC Research 入口](../../README.md)
- [跨机体 MSC 研究总览](../../cross-unit-msc-research-overview.md)
- [MSC 代际与 Param Action Bridge 对比](../../msc-generation-param-bridge-comparison.md)
- [66003001 Darilbalde](../66003001-darilbalde/README.md)

身份由 Character ID Table 与 `character_list.json` 交叉确认。玩家语义只参考
[EXVS2OB wiki Gundam Aerial](https://w.atwiki.jp/exvs2ob/pages/28.html)：Beam Rifle、
Long Barrel、GUND-BIT、Demi Trainer assist 等名称是候选语义，不能单独给
`func_N` 或 hash 命名。

## Source map

Character ID Table row:

| Field | Value |
|---|---:|
| `id` | `66001001` |
| `Model` | `0x97A5E17C` |
| `Effect` | `0x6CFE74BB` |
| `Sound` | `0x57E15CE5` |
| `Param` | `0x48357C75` |
| `Msc` | `0x19CE466D` |
| `Motion` | `0xB963C9FF` |

Source FHM2D:

| Kind | Source | Size | SHA-256 |
|---|---|---:|---|
| MSC | `E:\OBHK0.3_v27\data\x64\dplcache_release\0x19CE466D.fhm2d` | `110172` | `1FAF1CF70377F45F0D9A0A563E17DD4DFC8166F0582A130BE717B6208F142919` |
| Param | `E:\OBHK0.3_v27\data\x64\dplcache_release\0x48357C75.fhm2d` | `14734` | `77168512873E795A4FE31A14B7B5C232902C72B8D2FE7A5D91874BB034E2DD34` |

Read-only source files were extracted into the existing workspaces:

```text
E:\XB\解包\com\file\040msc\0x19CE466D
E:\XB\解包\com\file\041cpm\0x48357C75
```

Extracted and decompiled scripts:

| Part | Binary size / SHA-256 | `.c` lines / functions / SHA-256 |
|---|---|---|
| `0` | `27232` / `50CA4F4B00B7D5AFAAC14684679C65DADFC8FDB81B641631AC02DFDECF308E39` | `3594` / `162 definitions (func_0..func_161)` / `70F360731C28E2B3DCD9DA14915FCAC0452A57861A65919193BE31B330871795` |
| `1` | `192` / `3BA97A583CC93CEC2E2BFBF85F02FDA0729C17ABE3E2959E4451FBCC04B1C151` | `34` / `main + func_1..func_5` / `24FF3EEB5235F34AE9B99918B1C59CC5D5D8972CEE09121DBAF3135F35E6452F` |
| `2` | `313392` / `6368BAE05E77188444FD870575A082CB873710ACED81D4901FA6687F0DC49CE5` | `33544` / `1198 definitions (main + func_1..func_1197)` / `1F3F59DE67F7BEF7C0A6D6F1893ECD31DD9E1A30F29704FCC1212E259D232964` |

`1.c` is the standard 34-line glue script. Unit-specific input routing and behavior are in
`0.c` and `2.c`.

## Classification

Aerial is an **external Param action-table** unit, not a classic hardcoded `global39` selector.

Direct `.c` evidence:

- `0.c:3363-3407`, `func_143`, calls `sys_41(...)`; its returned value is an external action-row
  index, then `func_145` resolves it.
- `0.c:3480-3496`, `func_145`, reads action hash field `0x2E`, group field `0x0A`, and route/flag
  values through `sys_0(0x700002, ...)`.
- `0.c:3420-3438`, `func_146`, scans the external table for rows whose field `0x03 == 0x12C`.
- `0.c:3573-3593`, `func_161`, still registers the shared fixed 17 input callbacks.
- `2.c:25054-25089`, `func_849`, loops over every external row, dynamically registers its
  action hash, row index and three phase callbacks.
- `2.c:25542-25676`, `func_867/868/870`, copies action-row fields into runtime globals.
- `2.c:25746-25755`, `func_875`, is the direct `sys_0(0x700000, 0, row, field)` accessor.
- `2.c:28710-29143`, `func_973`, maps 141 phase-key hashes to callback functions.

There are no `sys_2C` or `sys_2D` calls in this sample. The runtime bridge is the
`0x700000/0x700001/0x700002` family.

## External action table

Raw `chrsysparam.csyspm` evidence:

| Item | Value |
|---|---:|
| Magic | `0xB4ACACAF` |
| Unit ID | `66001001` |
| Table 0 | marker `0xA8BBBAB9`, `47 x 128`, rows `1..46` nonempty |
| Table 1 | marker `0xA8BAA9BA`, `1 x 1`, empty |

Representative rows, read directly from table 0:

| Row | Action hash | Group | Slot | Phase 0 key -> callback | Representative output |
|---:|---|---:|---:|---|---|
| `1` | `0xF48D2D49` | `0x00` | `0` | `0xC7C10AFD -> func_975` | common action setup; no direct `sys_4F` in phase 0 |
| `2` | `0xDF8C4DAB` | `0x03` | `0` | `0x42EC9B53 -> func_978` | `0x2CE0C3C6`, `0x3A584DBC` |
| `3` | `0x43DCA0EA` | `0x03` | `1` | `0x406439E9 -> func_981` | three directional 11-row projectile families |
| `4` | `0x31B991A3` | `0x03` | `1` | `0x1886FFA2 -> func_984` | one 11-row projectile family |
| `14` | `0x7C554D21` | `0x0C` | `5` | `0x8928D7D5 -> func_1005` | `0x0C28F8FE`, `0x4E2837D1` |
| `29` | `0x759EA5C8` | `0x0C` | `5` | `0x3F7545A9 -> func_1053` | 11-row projectile family beginning `0x26C6AD02` |
| `44` | `0x15E73A45` | `0x1F` | `5` | `0xC25C1402 -> func_1098` | timed row plus 11-row family |
| `46` | `0xD02D6AD4` | `0x1F` | `5` | `0x20E6AB32 -> func_1104` | `0x91E0AEC8` plus 11-row family |

The phase 1/2 keys are also data, not hardcoded action hashes. For example row 3 uses
`0x64110B3A -> func_980` and `0xE38917F5 -> func_982`; `func_849` registers these through
`sys_1(0x10001, 0x11/0x12, row, callback)`.

## Representative `.c` chains

### Slot-0 two-row shot family

```text
chrsysparam row 2
  action 0xDF8C4DAB, group 0x03, slot 0
2.c:25061-25083
  func_849 registers row action and phase callbacks
2.c:28767-28869
  phase key 0x42EC9B53 -> func_978
2.c:29179-29244
  func_978 emits 0x2CE0C3C6 and 0x3A584DBC
bulletparam
  rows 22 and 33, shared resource 0x5E2D02E6, lifetime 300
```

This is a slot-0 weapon chain. Beam Rifle/Long Barrel is a semantic candidate only; exact
input and visible subtype still need motion/resource confirmation.

### Slot-1 multi-projectile families

```text
chrsysparam rows 3 and 4
  group 0x03, slot 1
row 3 phase 0 -> func_981
  direction/global200 chooses one of three 11-row sys_4F families
row 4 phase 0 -> func_984
  emits another 11-row sys_4F family
bulletparam
  every literal bullet hash in these functions exists as a raw entry ID
```

The repeated 10+1 pattern and slot-1 grouping are strong GUND-BIT family evidence when combined
with the wiki, but the specific all-range/deploy input for each action hash is not yet proven.

### Slot-5 large volleys

Rows 29, 44 and 46 route to `func_1053`, `func_1098` and `func_1104`:

- `func_1053` emits 11 rows starting at `0x26C6AD02`.
- `func_1098` emits `0x578ADEB2`, then 11 rows; its cleanup `func_1099` can emit another
  11-row family beginning `0xA1F56093`.
- `func_1104` emits `0x91E0AEC8`, then the same 11-row cleanup family.

These are proven multi-projectile timelines. They are plausible GUND-BIT, assist or burst
families, but exact player names require motion/effect/resource evidence.

## Raw Param bridge

Key raw files:

| File | Entries | Commands | Entry size | Trailing |
|---|---:|---:|---:|---:|
| `armsparam.bin` | `4` | `48` | `200` | `263` |
| `bulletparam.bin` | `156` | `85` | `340` | `0` |
| `characterparam.bin` | `1` | `197` | `796` | `36` |
| `speedparam.bin` | `1` | `74` | `304` | `37` |
| `interactionid.bin` | `43` | `31` | `124` | `0` |
| `hitgroupiddef.bin` | `69` | `15` | `60` | `0` |

`armsparam.bin` rows:

| Entry ID | Ammo | Reload type | Start | Per-shot | Cooldown | Charge | Full | Bullet type |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `0x4B954A15` | `2` | `0` | `240` | `360` | `240` | `0` | `240` | `2` |
| `0x5392B380` | `8` | `1` | `120` | `180` | `120` | `0` | `120` | `0` |
| `0x92D85F6D` | `1` | `0` | `300` | `420` | `300` | `0` | `300` | `3` |
| `0xD5CAD3A8` | `1` | `0` | `240` | `360` | `240` | `60` | `240` | `1` |

The 8-ammo row is consistent with the wiki's Beam Rifle ammo count, but none of these four
entry IDs appears as a literal in `0.c` or `2.c`. Their exact slot binding is therefore native
or table-order driven and remains a candidate, not a proven hash-name assignment.

Representative raw `bulletparam.bin` rows:

| Bullet ID / row | Move | Lifetime | Resource | Action | Interaction | Notes |
|---|---:|---:|---|---|---|---|
| `0x2CE0C3C6` / `22` | `11` | `300` | `0x5E2D02E6` | `0xB57FB3E9` | `0x4C9AC2B0` | slot-0 family |
| `0x3A584DBC` / `33` | `11` | `300` | `0x5E2D02E6` | `0` | `0x4C9AC2B0` | paired slot-0 row |
| `0x9313BEB0` / `86` | `0` | `300` | `0xF62228A1` | `0xA5D2CE83` | `0x6D9B753A` | row-3 family lead |
| `0x4CC39753` / `46` | `0` | `300` | `0xF62228A1` | `0` | `0x6D9B753A` | row-3 timed child |
| `0x26C6AD02` / `19` | `3` | `300` | `0x3596A47B` | `0xD2D5FE15` | `0x6D9B753A` | row-29 family lead |
| `0x578ADEB2` / `52` | `255` | `15` | `0xEE1AA9A8` | `0xCBCECF54` | `0x6D9B753A` | speed `290`, range `10` |
| `0x91E0AEC8` / `85` | `255` | `31` | `0x6743BDBE` | `0xCBCECF54` | `0x6D9B753A` | speed `290`, range `10` |
| `0xA1F56093` / `94` | `2` | `1000` | `0xDAA5774D` | `0` | `0x4A2E9718` | common 11-row family lead |

`speedparam.bin` contains one row, `0xC2B19D12`: movement class `7`, BD initial `175`,
BD max `350`, air base `265`, air max `65`, step distance `8`. `2.c` initializes
`global142 = 0xC2B19D12`, directly linking this row to the unit runtime.

`characterparam.bin` contains one row, `0x1B12AE7D`. Current field labels are not strong
enough to use its values as authoritative player-facing HP/damage, so this page records the row
identity but does not rename callbacks from it.

## Fixed and dynamic registries

Aerial combines two registry layers:

- Dynamic layer: `func_849` registers all 46 nonempty external action rows and their phase
  callbacks.
- Fixed layer: `2.c:33363-33391`, `func_1194`, registers 26 fixed rows: 23 nonzero callbacks
  and three explicit zero callbacks (`0x9475130E`, `0x77B100FF`, `0xA02D57DC`). Together
  with two early registrations, this sample still contains the 25 nonzero hashes shared by all
  current real-source units.
- `func_1195/1196/1197` then register slot, resource and extra callbacks.

This explains why a simple tail-registry diff undercounts Aerial's actual action surface.

## Boundaries and next work

- Do not map this unit from `42001001`; that ID is G-Self.
- Do not recreate generated JSON to name functions. Continue from action row -> phase key ->
  `.c` callback -> `sys_4F/sys_47/sys_51` -> raw Param/resource evidence.
- Resolve the 46 action rows to exact player inputs by combining table fields `0x03/0x04/0x08/
  0x0A`, motion hashes and runtime captures.
- Trace `sys_51` payloads for Demi Trainer assist candidates.
- Match GUND-BIT projectile resource/effect hashes to model/effect archives, separating all-range,
  deploy and defensive variants.
- Determine the native/order-based mapping from the four arms rows to visible slots.

## Current conclusion

The real OB v27 Aerial is a 46-action external-table unit. `0.c` delegates input resolution to
`sys_41` and `0x700000/1/2`; `2.c func_849` installs action and phase callbacks from raw
`chrsysparam`; `func_973` resolves 141 phase keys; the resulting callbacks emit projectile
families that are present in the 156-row raw `bulletparam.bin`. This is a direct code-and-binary
chain, not a generated JSON interpretation.
