# 33004001 Gundam AGE-FX MSC 研究

上级入口：

- [跨机体 MSC 研究总览](../../cross-unit-msc-research-overview.md)
- [MSC 代际与 Param Action Bridge 对比](../../msc-generation-param-bridge-comparison.md)

## Source Map

| Field | Value |
|---|---|
| Character ID | `33004001` |
| Character list name | `ガンダムAGE-FX` |
| Pilot | `キオ・アスノ` |
| Msc signed | `1616004556` |
| Msc hex | `0x605245CC` |
| Param signed | `833191892` |
| Param hex | `0x31A97FD4` |
| Source MSC FHM2D | `E:\OBHK0.3_v27\data\x64\dplcache_release\0x605245CC.fhm2d` |
| Source Param FHM2D | `E:\OBHK0.3_v27\data\x64\dplcache_release\0x31A97FD4.fhm2d` |
| MSC workspace | `E:\XB\解包\com\file\040msc\0x605245CC` |
| Param workspace | `E:\XB\解包\com\file\041cpm\0x31A97FD4` |

## Verified Outputs

| Part | Binary | Decompiled C | Functions | Lines | SHA-256 |
|---|---|---|---:|---:|---|
| `0` | `0.bscex` | `0.c` | `162` | `3597` | `94DB7F870F323192143019C6B1EC8E9444D0231425D0C170FDC9A8160425B028` |
| `1` | `1.cscex` | `1.c` | `6` | `34` | `24FF3EEB5235F34AE9B99918B1C59CC5D5D8972CEE09121DBAF3135F35E6452F` |
| `2` | `2.dscex` | `2.c` | `1292` | `36247` | `85703574CE03A905CBEBF40F599CDCC7C056464C1875517E344A4F482E14C6F8` |

Extracted binary sizes：

```text
0.bscex = 27264
1.cscex = 192
2.dscex = 333792
```

后续语义以 workspace 中的 `.c` 行号、函数链和 Param row 字段落点为准。本页不把
generated JSON、semantic overlay 或 analyzer 汇总当作证据层；需要字段时直接读取原始
Param 二进制，需要行为时直接读取 `0.c / 1.c / 2.c`。

## Param / ChrSysParam

`chrsysparam.csyspm`：

- size `38744` bytes
- magic `0xB4ACACAF`
- version `0x00010000`
- unit id `33004001`
- table0 `72 x 128`
- nonzero action rows `71`
- table1 contains 12 transition evidence rows

Param row 的语义按 row 逐条追到 `2.c` group callback 和三相 callback。不能只凭列位置
批量命名，也不再保留机器生成的中间 JSON。

## Generation Classification

AGE-FX 是已验证的 external Param action-table 型：

- `0.c` 调用 `0x700000` 6 次、`0x700001` 2 次、`0x700002` 2 次。
- `2.c` 调用 `0x700000` 33 次、`0x700001` 1 次、`0x700002` 2 次。
- `0.c func_144..161` 与 NEXA-N 的外部-table bridge 17/18 个函数完全相同。
- 唯一 bridge 差异是 `func_152`：AGE-FX 额外设置 `global57 = 0x6D00AEAA`，调用 `func_13/14`，再进入共用 `func_135`。

## Runtime Registry

`2.c` registry 摘要：

- `func_835`: 172 sys1 entries
- `func_836`: 7 sys1 entries
- `func_849`: one dynamic `func_241(var2, var4)` registration
- `func_1288`: 25 constant action handlers
- `func_1289/1290/1291`: 50 / 208 / 15 sys1 entries

AGE-FX 与 NEXA-N 的 25 个常量 `func_241` handler hash 完全相同；两机 Param action row hash 交集为 0。当前解释：共享 runtime handler registry + 单位特有 action data/callback。

## 与 NEXA-N 的直接 `.c` 对照

两个单位的 external-table registry 骨架一致，但 group callback 和字段语义不能跨机体
直接复制：

| Layer | NEXA-N | AGE-FX | Result |
|---|---|---|---|
| Dynamic registry | `2.c:25052-25086 func_849` | `2.c:25069-25103 func_849` | 都扫描 field `0x2E/0x0A`，注册 action、row index、entry/tick/cleanup 三相 callback |
| Phase resolver | `func_975` | `func_996` | 结构相同，单位函数键集合不同 |
| Group resolver | `func_873`, 9 个 group case | `func_873`, 13 个 group case | resolver 是单位行为路由表，不是固定 ABI enum |
| `1.c` | SHA-256 `24FF...452F` | 同一 SHA-256 | 两机都是完全相同的 6 函数 glue stub |

最关键的反例是 `field1C -> global839`：

- NEXA-N group `0x26`：`func_919 -> func_914 -> func_975(global839)`，把
  `field1C=0x3987CD20` 当函数键，落到 `func_1185` 特殊移动。
- AGE-FX group `0x35`：`2.c:29020-29054 func_977` 建 ranged runtime；
  `2.c:29069-29090 func_979` 把 `global839` 传给 `func_895` 播 motion；
  `2.c:29137-29143 func_980` 再用 `global841/global842` 调 `sys_51` 并扣 slot ammo。

因此 `field1C` 只能先叫“group-local primary payload”。具体是 motion、函数键还是其它
资源，必须读匹配 group callback 后再命名。这个差异也证明外部 Param 表更像共享 schema
承载 tagged payload，而不是每列在所有机体、所有 group 中都有单一类型。

## Action Group Summary

| Group | Callback | Rows | Evidence |
|---|---|---:|---|
| `0x00` | `func_967` | `2` | old route formula covered |
| `0x03` | `func_971` | `3` | old route formula covered |
| `0x0C` | `func_930` | `14` | old route formula covered |
| `0x0D` | `func_951` | `2` | old route formula covered |
| `0x1F` | `func_923` | `12` | old route formula covered |
| `0x20` | `func_923` | `4` | route unresolved |
| `0x1D` | `func_915` | `5` | route unresolved |
| `0x27` | none | `17` | phase-only path |
| `0x29` | none | `2` | phase-only path |
| `0x35` | `func_977` | `5` | route unresolved |

## Group `0x35`：两组 assist 输入

group `0x35` 的五行直接来自 `chrsysparam.csyspm`，共享 `func_977` runtime：

| Row | Action | Cat / mask | Runtime slot | `field1C` | `field1E / 1F` | Phase callbacks |
|---:|---|---|---:|---|---|---|
| `6` | `0xDB308CF4` | `8 / 0x04` front | `2` | `0x64AEA726` | `1 / 1` | `func_1009 / 1010 / 1011` |
| `7` | `0x4D02500C` | `8 / 0x30` sides | `2` | `0x133075D6` | `1 / 2` | `func_1009 / 1010 / 1011` |
| `8` | `0xB180AC06` | `8 / 0x08` back | `2` | `0x64AEA726` | `1 / 1` | `func_1009 / 1010 / 1011` |
| `9` | `0x51554518` | `8 / 0` neutral | `2` | `0x133075D6` | `1 / 0` | `func_1009 / 1010 / 1011` |
| `10` | `0x5313FB41` | `9 / 0` neutral | `3` | `0xEF45F4EE` | `0 / 0` | `func_1012 / 1013 / 1014` |

三相函数键由 `2.c func_996` 直接解析。row `6..9` 是
`0x5A65A584 / 0x55B8A2ED / 0xDDFDB94B`，row `10` 是
`0x7A43A0E1 / 0xAA6BEABE / 0xFDDBBC2E`。这些 callback 只做少量状态初始化；
实际输出位于公共 runtime：

```text
func_977
  -> func_979: func_895(global839, ...) 播放 field1C motion
  -> func_980: sys_51(0x20000, 0, 2, global841, global842)
               sys_4F(7, global681, 1)
```

对应源码为 `2.c:29020-29054`、`29057-29122`、`29124-29215`。因此这里可以确认：

- `field1C` 在 group `0x35` 是 motion，不是函数键。
- `field1E / field1F` 原样成为 `sys_51` 的两个 assist payload。
- row `6..9` 共用 slot `2`；row `10` 使用 slot `3`。

结合 wiki normal form 的输入说明，当前语义候选为：row `9` 是 Full Glansa 三向光束，
row `6/8` 是 Full Glansa 两段格斗，row `7` 是 Glastro Launcher，row `10` 是 Dark
Hound 无方向防御 assist。这里的命名同时依赖方向 mask、`sys_51` payload 分型和 wiki，
不是只由 wiki 反推。

## Group `0x1D`：Dark Hound 方向移动候选

row `11..14` 共用 slot `3`，但由 group `0x1D -> func_915` 进入移动型 runtime：

| Row | Action | Mask | Motion `field1C` | Entry / tick / cleanup |
|---:|---|---:|---|---|
| `11` | `0xD97632AD` | `0x04` front | `0x98DB261E` | `func_1015 / 1016 / 1017` |
| `12` | `0xB3C6125F` | `0x08` back | `0x98DC4BDA` | `func_1018 / 1019 / 1020` |
| `13` | `0xBD1D9A6D` | `0x10` left | `0x78EE1AE9` | `func_1021 / 1022 / 1023` |
| `14` | `0x4712A70E` | `0x20` right | `0x5F16547E` | `func_1024 / 1025 / 1026` |

`func_917` 播各自 motion 后执行 `sys_46(0x5, 60, 60, 60)`。四个 tick callback
具有相同骨架：先登记 slot `3`，在 frame `0x64` 扣除 slot `3`，frame `0x1F4`
调用 `func_1248(5)` 并挂接对象 `0x45A0E9ED`，随后发出：

```text
sys_4F(0, 5, 0x9B4748FB)
```

直接读取本机 `bulletparam.bin` 可见 `124 x 320`，`0x9B4748FB` 位于 row `69`；
该 row 的 `move_type=1`、lifetime `300`、on-expire `0x691246B1`、interaction
`0x45A0E9ED`。interaction 与 callback 挂接对象相同，形成 `.c -> bullet row` 的
资源闭环。结合四方向 mask 和 wiki 的 Hyper Boost 描述，row `11..14` 是 Dark Hound
方向特殊移动的强语义候选。

## Wiki Semantic Candidates

EXVS2OB wiki 可见状态/武装：

- normal / FX Burst Mode two forms
- Stungle Rifle
- Daidal Bazooka
- C-Funnel launch/charge/self barrier/ally barrier
- Gundam AGE-1 Full Glansa assist
- Gundam AGE-2 Dark Hound assist/special movement
- FX Burst activation via charge melee; awakening or low HP can make it permanent

Sources：

- [AGE-FX overview](https://w.atwiki.jp/exvs2ob/pages/360.html)
- [AGE-FX normal](https://w.atwiki.jp/exvs2ob/pages/362.html)
- [AGE-FX FX Burst](https://w.atwiki.jp/exvs2ob/pages/361.html)

这些只作为 semantic candidate。group `0x35` 和 group `0x1D` 已有 syscall、方向 mask
和 resource row 证据，因此可使用上面的候选名；其它 `func_923/930/...` 仍保持函数号。

## Next Evidence

- 追 `func_152` 的 `0x6D00AEAA` unit hook，确认它与 FX Burst 初始状态、默认 action 或共享 runtime reset 的关系。
- 从 group `0x0C` / `0x1F` 各选 action row，追 group callback、phase callbacks、`sys_4F/sys_51`、resource hash。
- 继续追 group `0x1D` 的 `0x691246B1` on-expire 与 `0x45A0E9ED` interaction 定义。
- 对照 wiki 的 C-Funnel / FX Burst，只有资源 hash 和状态变量同时命中后才升级语义名。
