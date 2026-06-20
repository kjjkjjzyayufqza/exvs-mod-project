# 42002001 Mack Knife (Mask) MSC 研究

生成日期：2026-06-20

本页只使用真实 `.c`、raw Param 和源 FHM2D 作为证据。旧
`docs/msc-research/generated` / `overlays` / `resolved` 工作流已经废弃；本机体没有生成
JSON 中间物。

上级入口：

- [MSC Research 入口](../../README.md)
- [跨机体 MSC 研究总览](../../cross-unit-msc-research-overview.md)
- [MSC 代际与 Param Action Bridge 对比](../../msc-generation-param-bridge-comparison.md)

身份由 Character ID Table 与 `character_list.json` 交叉确认：`42002001` 是
Mack Knife（Mask），不是 Gundam Pharact。玩家语义候选参考
[EXVS2OB wiki Mack Knife (Mask)](https://w.atwiki.jp/exvs2ob/pages/179.html)。wiki 证明玩家可见
武装包括 Beam Vulcan、concentrated Beam Vulcan、Plasma Claw irradiation、Grenade Launcher、
Mack Knife (Barara) assist、Photon Bomb，以及 Long-Range Booster 变形/时限强化；它不单独
证明任何 `func_N` 或 hash 语义。

## Source map

Character ID Table:

```text
E:\XB\解包\com\file\012list\0x036B9E67\character_id_table.json
```

Row evidence:

| Field | Value |
|---|---:|
| `id` | `42002001` |
| `Param` signed | `-1832807779` |
| `Param` hex | `0x92C1929D` |
| `Msc` signed | `-1019565947` |
| `Msc` hex | `0xC33AA885` |

同一 Character ID row 的完整资源主键：

```text
Model  0x4D510F94    Effect 0xB60A9A53    Sound  0x8D15B20D
Param  0x92C1929D    Msc    0xC33AA885    Motion 0x63972717
```

Source FHM2D:

| Kind | Source | Size | SHA-256 |
|---|---|---:|---|
| MSC | `E:\OBHK0.3_v27\data\x64\dplcache_release\0xC33AA885.fhm2d` | `104390` | `A70BCCB4851BDA82BC11E25FEB0EEF0EF651487AC1D8A9C9AB31F039A7CE2F48` |
| Param | `E:\OBHK0.3_v27\data\x64\dplcache_release\0x92C1929D.fhm2d` | `10534` | `80D74BB7CF01CC83E064F8EB0840EB86FBC1FDCDCCB162C07983A0971702C07B` |

Workspace:

```text
E:\XB\解包\com\file\040msc\0xC33AA885
E:\XB\解包\com\file\041cpm\0x92C1929D
```

Extracted scripts:

| Part | Binary | Size | SHA-256 |
|---|---|---:|---|
| `0` | `0.bscex` | `28624` | `1E5CC9DB56902B1DCEF3200637163ABA87C52AA1B0D382569E83768B6789FDD3` |
| `1` | `1.cscex` | `192` | `3BA97A583CC93CEC2E2BFBF85F02FDA0729C17ABE3E2959E4451FBCC04B1C151` |
| `2` | `2.dscex` | `287328` | `681E2427D496FADA09D7DB9825136B073D205BA8CF75DC3D67A281090FDB5C04` |

Decompiled scripts:

| Part | File | Lines | Functions | SHA-256 |
|---|---|---:|---:|---|
| `0` | `0.c` | `3572` | `main + func_0..func_144` | `85A7A4FF229931AAEFC5BF64BB4895A3917AC6104AFB59049C0D46FC101E757E` |
| `1` | `1.c` | `34` | `main + func_1..func_5` | `24FF3EEB5235F34AE9B99918B1C59CC5D5D8972CEE09121DBAF3135F35E6452F` |
| `2` | `2.c` | `31418` | `main + func_0..func_1120` | `6B0EF0BAE62D564E87DEA79775F89B54438C763E8BE9F3AEEFB10F6AEDA644FA` |

`1.c` remains the same 34-line glue shape as the other classic samples.

## Classification

Mack Knife is a classic local selector sample, not an external Param action-table sample.

Evidence:

- `0.c:256` reads `global39 = sys_0(0x10000, 0, 0x17)`.
- `0.c:3349-3549` uses `global39 == 0` and `global39 == 1 && (global20 & 0x4000) != 0`
  as the local selector branches.
- `0.c:3551-3571` registers the fixed 17 input callbacks with
  `sys_1(0x10002, 0x1, hash, func_N)`.
- `2.c:31197-31268` registers 69 unit action handlers with `func_241(hash, callback)`.
- `chrsysparam.csyspm` is 68 bytes with two `1 x 1` empty tables.
- `0.c` / `2.c` contain no `0x700000`, `0x700001`, `0x700002`, `sys_2C`, or `sys_2D`.

This puts Mack Knife in the same broad family as RX-78-2, Unicorn, Sinanju, Delta Plus,
and G-Self. Its two-state bridge matches the normal / Long-Range Booster split.

## 0.c selector

`0.c func_143` is the main input-to-action selector.

| Branch | Input gate | Action hash | `2.c` callback | Evidence | Semantic candidate |
|---|---|---|---|---|---|
| normal | `global48 & 0x1` | `0x675E5A56` | `func_911` | `0.c:3470-3472`, `2.c:31227` | main Beam Vulcan candidate |
| normal | `global48 & 0x800` | `0x609A0ABB` | `func_915` | `0.c:3353-3355`, `2.c:31228` | concentrated Beam Vulcan CS candidate |
| normal | `global48 & 0x80`, slot 1 ammo | `0x3ACCB1AF` | `func_927` | `0.c:3372-3376`, `2.c:31230` | Plasma Claw multi-beam candidate |
| normal | `global48 & 0x100`, slot 2 ammo | `0x31F61D6C` / `0x12F1AE80` / `0x492627EE` | `func_933` / `func_939` / `func_945` | `0.c:3383-3398`, `2.c:31231-31233` | directional Grenade Launcher family candidate |
| normal | `global48 & 0x200`, slot/object state | `0xD44DBDD1` / `0xA810E83D` / `0x89DF5628` / `0xA07737CB` | `func_963` / `func_966` / `func_969` / `func_957` | `0.c:3405-3443`, `2.c:31235-31238` | Barara assist / follow-up family candidate |
| booster state | `global48 & 0x1` | `0x749C3260` | `func_1024` | `0.c:3544-3546`, `2.c:31249` | transformed Beam Vulcan derivative |
| booster state | `global48 & 0x80` | `0x3FB0F933` | `func_1034` | `0.c:3485-3490`, `2.c:31252` | transformed Plasma Claw derivative |
| booster state | `global48 & 0x200` | `0x4C942011` / `0x58225FA5` / `0xC897CDB` / `0x05B0B45C` | `func_1044` / `func_963` / `func_966` / `func_969` | `0.c:3507-3527`, `2.c:31254-31257` | transformed assist / follow-up family |

The wiki names the visible kit as a 2000-cost transforming BMG unit. The table above does not
treat those names as proven hash names; it only uses them as semantic candidates after the
`.c -> Param` chain is established.

## Action registry

`2.c func_241` registers a hash to a callback through `sys_1(0x10002, 0x2, hash, callback)`:

```text
2.c:6228-6244
```

The Mack Knife tail registry is:

| Function | Evidence | Role |
|---|---|---|
| `func_1117` | `2.c:31197-31268` | 69 fixed action handlers |
| `func_1118` | `2.c:31270-31327` | 48 slot callback registrations |
| `func_1119` | `2.c:31328-31399` | 62 resource / stance registrations |
| `func_1120` | `2.c:31400-31418` | 15 effect / extra resource registrations |

Total `2.c` `sys_1` entries: `545`.

## Loadout and state bridge

Mack Knife has a compact two-row state bridge:

| State | Writer | `global143` | Character row | Speed row | Slot rows |
|---:|---|---:|---|---|---|
| normal | `func_1101`, `func_1103`, `func_1107` | `0` | `0x1B12AE7D` | `0xC2B19D12` | slot 1 `0x5DFFF073`, slot 2 `0xA59ED475` |
| Long-Range Booster / transformed | `func_1102`, `func_1106` | `1` | `0x6C159EEB` | `0x56B9DA0B` | slot 1 `0x354FF2C6`, slot 2 `0xD9FFA8EB` |

Line evidence:

- Default slot rows and speed row: `2.c:30995-31000`.
- Active state slot rows and `global143 = 1`: `2.c:31002-31016`.
- Active state speed and character row: `2.c:31018-31027`.
- Return to normal slot rows: `2.c:31029-31038`.
- Return to normal speed and character row: `2.c:31078-31098`.

This is not an external `chrsysparam` action matrix. It is a local `.c` state bridge that
uses raw arms/speed/character Param rows.

## Raw Param rows

Param headers:

| File | Entries | Commands | Entry size | Trailing |
|---|---:|---:|---:|---:|
| `armsparam.bin` | `9` | `48` | `200` | `676` |
| `bulletparam.bin` | `79` | `80` | `320` | `0` |
| `speedparam.bin` | `2` | `74` | `304` | `82` |
| `characterparam.bin` | `2` | `197` | `796` | `72` |
| `chrsysparam.csyspm` | `68 bytes` | - | - | - |

`armsparam.bin` loadout rows:

| Row | Entry id | Ammo | Reload type | Reload start | Total | Per-shot | Wait | Cooldown | Damage | Count / interval |
|---:|---|---:|---|---:|---:|---:|---:|---:|---:|---|
| `4` | `0x5DFFF073` | `1` | `0x00000003` | `360` | `120` | `480` | `120` | `360` | `480` | `90 / 90` |
| `6` | `0xA59ED475` | `2` | `0x00000001` | `300` | `100` | `360` | `100` | `300` | `360` | `0 / 0` |
| `1` | `0x354FF2C6` | `2` | `0x00000003` | `240` | `80` | `300` | `80` | `240` | `300` | `90 / 90` |
| `7` | `0xD9FFA8EB` | `2` | `0x00000001` | `300` | `100` | `360` | `100` | `300` | `360` | `0 / 0` |

`speedparam.bin` rows:

| Row | Entry id | Movement class | BD init | BD max | Air base | Air max | Step distance | Landing |
|---:|---|---:|---:|---:|---:|---:|---:|---:|
| `0` | `0x56B9DA0B` | `7` | `190` | `350` | `280` | `65` | `9` | `280` |
| `1` | `0xC2B19D12` | `7` | `175` | `350` | `265` | `65` | `8` | `280` |

`characterparam.bin` rows:

| Row | Entry id | `team_cost_value` | Red lock | Main dmg | Sub dmg | Special dmg |
|---:|---|---:|---:|---:|---:|---:|
| `0` | `0x1B12AE7D` | `2000` | `120.00` | `68` | `39` | `29` |
| `1` | `0x6C159EEB` | `2000` | `120.00` | `68` | `39` | `29` |

Current parser field names are useful for comparison, but player-facing HP/cost labels still
need native/UI context. For this page, `team_cost_value=2000` is used only as a supporting
identity check against the wiki.

Representative `bulletparam.bin` rows hit by `.c` `sys_4F(0, slot, hash)`:

| Use chain | Bullet row(s) | Raw bullet evidence |
|---|---|---|
| normal main, `func_911 -> func_914` | `0x61C544D8`, `0x9BCA79BB` | rows `25/49`, resource `0xCED5DB99`, speed `1.5`, range `11`, lifetime `300`, duration `72` |
| Beam Vulcan CS candidate, `func_915 -> func_918` | `0x5E30B6E4`, `0xA43F8B87` | rows `23/53`, speed `0.8`, range `15`, lifetime `300`, duration `70` |
| Plasma Claw candidate, `func_927 -> func_930` | `0x7C377D62` plus timed rows `0xE53E2CD8`, `0x92391C4E`, `0x0C5D89ED`, ... | primary row `38`, resource `0x93473060`, range `210`, lifetime `90`; timed family shares the same resource shape |
| special shooting, `func_933 -> func_936` | `0x3CD946F6`, `0xA5D0174C`, `0xD2D727DA`, `0x4CB3B279` | rows `13/54/70/18`, mix of `0x2875FCF1`, `0xB17CAD4B`, `0xC67B9DDD`, `0x581F087E` resources |
| booster-state main, `func_1024 -> func_1027` | `0xB3479AA1`, `0x4948A7C2` | rows `59/16`, resource `0xA6A6DD4B`, speed `0.8`, range `10`, lifetime `300` |
| booster-state sub, `func_1034 -> func_1037` | `0x441940F6`, `0xBE167D95` | row `14` primary has action `0xB693D78B`, resource `0xABDA9C27`, speed `0.8`, range `15` |
| booster-state follow-up / object state, `func_1092 -> func_1094` | `0x4D6244C1` | row `19`, move type `0`, shape `3`, lifetime `10000`; paired with `sys_4F(0x3/0x5, slot3)` object control |

## Representative `.c` chains

### Main Beam Vulcan candidate

```text
0.c:3470-3472
  global48 & 0x1 -> 0x675E5A56
2.c:31227
  0x675E5A56 -> func_911
2.c:25842-25935
  func_911 sets slot 0 runtime and func_914 emits 0x61C544D8 or 0x9BCA79BB
bulletparam
  rows 25 / 49
```

The wiki names the visible main as a 60-round Beam Vulcan/BMG. The `.c`/Param chain proves the
main projectile family and slot runtime path, not the full player damage formula.

### Concentrated Beam Vulcan CS candidate

```text
0.c:3353-3355
  global48 & 0x800 -> 0x609A0ABB
2.c:31228
  0x609A0ABB -> func_915
2.c:25946-25993
  func_918 emits 0x5E30B6E4 and 0xA43F8B87
bulletparam
  rows 23 / 53
```

This matches the wiki's concentrated Beam Vulcan CS candidate, but exact hit count and damage
still require native damage/runtime verification.

### Plasma Claw irradiation candidate

```text
0.c:3372-3376
  global48 & 0x80 and slot 1 ammo -> 0x3ACCB1AF
2.c:31230
  0x3ACCB1AF -> func_927
2.c:26206-26294
  func_930 emits 0x7C377D62 plus nine timed slot-5 rows
armsparam
  slot 1 normal row 0x5DFFF073, active row 0x354FF2C6
bulletparam
  primary row 38 plus timed row family
```

Wiki names the visible sub as ten independent Plasma Claw beams. The code proves a slot-1 ammo
gate and a multi-row projectile family; motion/resource evidence is still needed before assigning
the exact hash.

### Directional Grenade Launcher candidate

```text
0.c:3383-3398
  global48 & 0x100 and slot 2 ammo -> 0x31F61D6C / directional variants
2.c:31231-31233
  action hashes -> func_933 / func_939 / func_945
2.c:26332-26420
  func_936 emits 0x3CD946F6, 0xA5D0174C, 0xD2D727DA, 0x4CB3B279
armsparam
  slot 2 normal row 0xA59ED475, active row 0xD9FFA8EB
```

The wiki names N/front/side special shooting as Grenade Launcher variants. The `.c` evidence
proves the slot-2 branch and projectile families; exact directional naming remains a semantic
candidate.

### Long-Range Booster state bridge

```text
2.c:31002-31016
  func_1102 sets global143=1 and swaps slot 1/2 rows
2.c:31018-31027
  func_1106 sets speed row 0x56B9DA0B and character row 0x6C159EEB
0.c:3475-3547
  global39==1 && global20&0x4000 selects derivative actions
2.c:31249-31257
  derivative actions resolve to func_1024 / func_1034 / func_1044 / func_963 / func_966 / func_969
```

This is the concrete local state bridge behind the wiki's Long-Range Booster transform/timed
enhancement.

## Boundaries

- Do not infer Mack Knife's whole weapon names from hash constants alone.
- Do not resurrect `generated` JSON analysis to name callbacks. The stable path here is
  `.c -> action hash -> callback -> sys_4F/sys_1 -> raw Param row`.
- `chrsysparam.csyspm` is intentionally recorded as empty 68-byte evidence; it is not a missing
  generated artifact.
- Slot 0 visible ammo is not directly bound by the local `sys_4F(0xb, slot, row)` cluster in
  this sample. Main-shot analysis should therefore cite the action callback and bullet rows, not
  invent a slot-0 arms row without a direct `.c` binding.

## Next work

1. Trace `func_921` and other `0x1000` / awakening branches to decide whether they are Photon
   Bomb, burst action, or shared special hooks.
2. Resolve Grenade Launcher directional variants `func_939/945/951/957/963/966/969`.
3. Follow Plasma Claw projectile rows into interaction / hitgroup data to prove beam layout and
   hit behavior from raw Param.
4. Find whether slot 0 main ammo is initialized by native/default loadout or by a non-obvious
   script path outside the `0xb` cluster.
