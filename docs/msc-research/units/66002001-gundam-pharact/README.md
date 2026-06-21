# 66002001 Gundam Pharact MSC 研究

生成日期：2026-06-21

本页只使用实际反编译 `.c`、raw Param 与源 FHM2D。没有生成 analysis JSON、
semantic overlay 或 resolved-label 中间物。

上级入口：

- [MSC Research 入口](../../README.md)
- [跨机体 MSC 研究总览](../../cross-unit-msc-research-overview.md)
- [首批跨机体 MSC 对比](../../cross-unit-first-batch-comparison.md)
- [MSC 代际与 Param Action Bridge 对比](../../msc-generation-param-bridge-comparison.md)

身份由 Character ID Table 与 `character_list.json` 交叉确认：机体名
`ガンダム・ファラクト`，驾驶员 `エラン・ケレス`。玩家可见语义参考
[EXVS2OB wiki Gundam Pharact](https://w.atwiki.jp/exvs2ob/pages/675.html)：Beam
Arquebus、Corax、Beakfoot 与方向特殊移动只作候选词汇，不能单独给 `func_N` 或 hash
命名。

## Source map

Character ID Table row：

| Field | Value |
|---|---:|
| `id` | `66002001` |
| `Model` | `0xBDD10948` |
| `Effect` | `0x468A9C8F` |
| `Sound` | `0x7D95B4D1` |
| `Param` | `0x62419441` |
| `Msc` | `0x33BAAE59` |
| `Motion` | `0x931721CB` |

Source FHM2D：

| Kind | Source | Size | SHA-256 |
|---|---|---:|---|
| MSC | `E:\OBHK0.3_v27\data\x64\dplcache_release\0x33BAAE59.fhm2d` | `111570` | `4D21DB7DF85CB195F17D924B4951EF9D8BDAFDE3143198139AE67876266DA4EE` |
| Param | `E:\OBHK0.3_v27\data\x64\dplcache_release\0x62419441.fhm2d` | `10967` | `2AACF5AD40C1C576AE175A9C516136A1A7BBA2529E7A78896BF729FD985D3407` |

只读源文件被抽取到现有 workspace：

```text
E:\XB\解包\com\file\040msc\0x33BAAE59
E:\XB\解包\com\file\041cpm\0x62419441
```

抽取与反编译结果：

| Part | Binary size / SHA-256 | `.c` lines / functions / SHA-256 |
|---|---|---|
| `0` | `27232` / `50CA4F4B00B7D5AFAAC14684679C65DADFC8FDB81B641631AC02DFDECF308E39` | `3594` / `main + func_0..func_161` / `70F360731C28E2B3DCD9DA14915FCAC0452A57861A65919193BE31B330871795` |
| `1` | `192` / `3BA97A583CC93CEC2E2BFBF85F02FDA0729C17ABE3E2959E4451FBCC04B1C151` | `34` / `main + func_1..func_5` / `24FF3EEB5235F34AE9B99918B1C59CC5D5D8972CEE09121DBAF3135F35E6452F` |
| `2` | `314848` / `84FA00ADBCBDDF686CB951575A3B608D36B78454F776F211AE6647E757EE33D2` | `33339` / `main + func_0..func_1152` / `1287A81D28FA2659A1FABC00E3BE4B743364EA3AD73B4E804E2AA730C92D6D81` |

`0.c` 与 Aerial `0x19CE466D/0.c` 的大小和 SHA 完全相同；`1.c` 也完全相同。
这两份文件是稳定 external-table input/glue 模板，Pharact 的单位差异主要位于
`chrsysparam.csyspm` 与 `2.c`。

## 三份脚本职责

### `0.c`：external row input adapter

- `0.c:3363-3411`, `func_143`, 把输入与当前状态交给 `sys_41(...)`，得到外部 action
  row index。
- `0.c:3394-3411`, `func_147`, 先处理 phase-only/强制 row，再回到普通 selector。
- `0.c:3413-3438`, `func_146`, 扫描 `field 0x03 == 0x12C` 的特殊入口。
- `0.c:3440-3478`, `func_144`, 读取 `field 0x03/0x04` 并把方向 mask 转成 gameplay
  category。
- `0.c:3480-3496`, `func_145`, 读取 action hash `field 0x2E` 与 group `field 0x0A`，
  再用 `0x700002` 得到 route/flags，最终调用 `func_95`。

因此 action hash 不是在 `0.c` 内硬编码选择；`0.c` 负责把 native input selector 与
external row 接起来。

### `1.c`：glue stub

`1.c` 只有 34 行、6 个函数，与当前其它真实源样本一致。没有发现 Pharact 专属状态、
武装或动作逻辑。

### `2.c`：runtime 与单位行为

- `2.c:25062-25097`, `func_849`, 动态注册全部 external rows、row index 和三相 callback。
- `2.c:25099-25126`, `func_873`, 把支持的 group 解析成 shooting/melee/movement
  runtime。
- `2.c:25546-25676`, `func_867/868/870`, 把当前 row 的 128 fields 装入 runtime globals。
- `2.c:25750-25759`, `func_875`, 直接执行
  `sys_0(0x700000, 0, row, field)`。
- `2.c:28222-28534`, `func_965`, 把 phase/function key 解析成实际 callback。
- `2.c:33154-33338`, `func_1148..1152`, 注册固定 action、slot、resource 与 extra callbacks。

高频 syscall 只作结构指标：`sys_0=1294`、`sys_1=546`、`sys_4A=527`、
`sys_46=388`、`sys_4B=299`、`sys_4F=151`、`sys_58=127`、`sys_51=32`。

## External action table

Raw `chrsysparam.csyspm`：

| Item | Value |
|---|---:|
| Magic | `0xB4ACACAF` |
| Unit ID | `66002001` |
| Table 0 | marker `0xA8BBBAB9`, `33 x 128`, rows `1..32` nonempty |
| Table 1 | marker `0xA8BAA9BA`, `1 x 1`, empty |

`func_873` 只给 27 行返回 group runtime：

| Group | Rows | Runtime |
|---:|---:|---|
| `0x03` | `9` | `func_946`, shooting runtime |
| `0x0C` | `9` | `func_929`, melee runtime |
| `0x19` | `1` | `func_916`, special-movement runtime |
| `0x1F` | `7` | `func_921`, movement/action runtime |
| `0x26` | `1` | `func_924 -> func_914`, executes `field 0x1C` as a function key |
| `0x27` / `0x29` | `4 + 1` | no group callback; phase callbacks remain active |

三相字段总计 96 个槽：row 9 的 `0x02/0x7C/0x7D` 都为零，其余 93 个槽复用
84 个非零 phase keys。`func_965` 有 101 个 case，但只有 84 个 key 出现在这三列。
resolver 中存在并不代表本机 row 会调用该函数。

### Rows 1..14：射击与特殊移动区

| Row | Action | Group | Category | Mask | Phase entry/tick/cleanup | 直接代码证据 |
|---:|---|---:|---:|---:|---|---|
| `1` | `0x07F0418C` | `0x03` | `0` | `0` | `func_966/967/968` | common shooting setup；无直接 bullet literal |
| `2` | `0x1F20C0BF` | `0x03` | `0` | `0x3C` | `func_969/970/971` | 按方向改 motion key |
| `3` | `0xECBCED28` | `0x03` | `0x0B` | `0` | `func_975/976/977` | shooting-CS category candidate；phase 内无直接 `sys_4F` |
| `4` | `0xD8338079` | `0x1F` | `7` | `0` | `func_978/979/980` | 12/6-row projectile family |
| `5` | `0x25331131` | `0x03` | `7` | `0x3C` | `func_981/982/983` | directional multi-projectile family |
| `6` | `0xC0EA0290` | `0x03` | `8` | `0` | `func_984/985/986` | special-shooting movement setup |
| `7` | `0xA69B2AC0` | `0x03` | `8` | `0x30` | `func_987/988/989` | emits `0x16A9DDC4` or `0xECA6E0A7` |
| `8` | `0xCB47D3EE` | `0x1F` | `9` | `0x08` | `func_993/994/995` | special-movement branch |
| `9` | `0xB1AED43B` | `0x26` | `9` | `0` | none | `field 0x1C -> func_1115` directional movement controller |
| `10..13` | four hashes | `0x1F` | `0` | `0/4/0x10/0x20` | `func_996/997/998` | four directional movement-shot variants |
| `14` | `0xAF102B08` | `0x03` | `9` | `0` | `func_999/1000/1001` | emits `0x11EB040D` twice |

结合 wiki，category `0/0x0B/7/8/9` 分别强对应 main、shooting CS、sub、special
shooting、special movement 的候选输入族。这里仍保留“候选”，因为 category 数字本身不是
玩家显示名。

### Rows 15..32：melee、system 与 awakening 区

| Row | Action | Group | Category | Mask | Phase entry/tick/cleanup |
|---:|---|---:|---:|---:|---|
| `15` | `0x178D1109` | `0x0C` | `1` | `0` | `func_1002/1003/1004` |
| `16` | `0x145E2BA9` | `0x27` | `0x1F` | `0` | `func_1005/1006/1007` |
| `17` | `0x7C554D21` | `0x27` | `0x1F` | `0` | `func_1008/1009/1010` |
| `18` | `0xDA7D28E1` | `0x0C` | `1` | `0x30` | `func_1011/1012/1013` |
| `19` | `0xDDFC17B5` | `0x27` | `0x1F` | `0` | `func_1014/1015/1016` |
| `20` | `0xA2236F44` | `0x0C` | `1` | `4` | `func_1017/1018/1019` |
| `21` | `0xF9BEAEB9` | `0x19` | `1` | `8` | `func_1020/1021/1022` |
| `22` | `0x58CC87CE` | `0x0C` | `0x12C` | `0` | `func_1023/1024/1025` |
| `23` | `0x89891310` | `0x03` | `0x190` | `0` | `func_1026/1027/1028` |
| `24` | `0x3AC14535` | `0x0C` | `6` | `4` | `func_1029/1030/1031` |
| `25` | `0x0BABEAF7` | `0x27` | `0x1F` | `0` | `func_1032/1033/1034` |
| `26` | `0x8B83AFE6` | `0x0C` | `0x0A` | `0` | `func_1035/1036/1037` |
| `27` | `0x128AFE5C` | `0x0C` | `0x190` | `0x44` | `func_1038/1039/1040` |
| `28` | `0x294D1473` | `0x29` | `0x1F` | `0x46` | `func_1041/1042/1043` |
| `29` | `0x658DCECA` | `0x0C` | `0x190` | `0` | `func_1044/1045/1046` |
| `30` | `0x451E3CF2` | `0x1F` | `0x190` | `0` | `func_1047/1048/1049` |
| `31` | `0xFBE95B69` | `0x0C` | `0x190` | `0` | `func_1050/1051/1052` |
| `32` | `0xD02D6AD4` | `0x03` | `0x0A` | `8` | `func_1053/1054/1055` |

这些行不能只按 category 命名。`0x27/0x29` 没有 group callback，必须从三相函数本身
读取；`0x190` 多用于系统/觉醒动作，但不是最终语义名。

## 代表 `.c -> raw Param` 链

### Corax 候选多弹体族

```text
row 4: action 0xD8338079, category 7
  -> func_979
  -> 12-row or 6-row sys_4F family

row 5: action 0x25331131, category 7, mask 0x3C
  -> func_982/983
  -> two lead rows + six timed child rows
```

代表 bullet rows 包括 `0x99484454/0x004115EE`、
`0x30135A4B/0x81C58335`、`0x662A595C/0x9158653D`。多方向、定时子弹与 wiki 的
Corax all-range/deploy 词汇一致，但哪一行对应哪种玩家显示名仍需 motion/effect 资源确认。

### Beakfoot 候选

```text
row 6/7: category 8
  -> func_985 / func_988
  -> movement setup
  -> row 7 emits 0x16A9DDC4 or 0xECA6E0A7
```

这两个 raw bullet rows 都是 `move_type=255`、`max_range=20`、`homing_range=500`、
`lifetime=300`、`resource=0x74C92692`，只在 hitgroup 上不同。它们是 wiki 中
Beakfoot neutral retreat shot / horizontal moving shot 的强候选对，但输入方向到具体 row 的
最终映射仍需实机或 motion hash。

### 方向特殊移动与派生射击

row 9 没有 phase key；它通过 group `0x26` 执行 `field 0x1C`：

```text
row 9 field 0x1C = 0xD3A742A8
  -> func_924
  -> func_914
  -> func_965(0xD3A742A8)
  -> func_1115
  -> global87 left/right branch
  -> func_1118/1119/1120 movement callbacks
```

rows `10..13` 共用 `func_997`，方向由 mask 和 `global200` 区分。该函数同时执行
`sys_46` movement，并按方向发出 `0xC6CC5D4B / 0x3C2A51FB / 0x72CBFB91 /
0x067537DD`，另有 slot-3 row `0x4F2D7AD3`。这与 wiki 的方向特殊移动及
特殊移动中 main 派生三连射形成强候选闭环。

### Row 32 临时超远锁定态

`func_1054` 在时间线 `0x258` 写：

```text
sys_1(0x60008, 0x6C159EEB)
sys_1(0xB000C, 1)
```

cleanup `func_1055` 恢复：

```text
sys_1(0x60008, 0x1B12AE7D)
sys_1(0xB000C, 0)
```

Raw `characterparam.bin` 中两行只有 8 个字段不同。六个当前已验证为距离的字段
`camera near/far`、`lock-on max`、`alert`、`target`、`radar` 都从 float `380.0`
切到 `5000.0`；另两个是 action/resource label 指针。这证明 row 32 是动作内临时
超远锁定/相机参数态，结束后恢复，不是常驻形态。

### `func_973` 不是本机 CS 链

`func_965` 的确包含：

```text
0xCE6034F9 -> func_973
```

但 raw 32-row table 的任何 field 都没有 `0xCE6034F9`。`func_973` 发出
`0x5AA54B1D` 的代码属于 resolver 模板残留，不能拿来证明 row 3 shooting CS。
row 3 实际 phase 是 `func_975/976/977`；其 projectile/hitbox 可能由 common shooting
runtime 与 motion/resource 数据驱动。

### 无 assist summon

Pharact `2.c` 有 32 次 `sys_51`，第一参数全部是 `0x20001`；没有任何
`sys_51(0x20000,...)` summon 调用。Aerial 同类脚本有 2 次 `0x20000`。这与 Pharact
wiki 武装表没有 assist 一致，也避免把 Corax 误判为援护。

## Raw Param bridge

| File | Entries | Commands | Entry size | Trailing | SHA-256 |
|---|---:|---:|---:|---:|---|
| `armsparam.bin` | `5` | `48` | `200` | `345` | `D09A129513F7B4C043D3D1F736A3280406EFF10E5321E2343D9156943E7DB97C` |
| `bulletparam.bin` | `93` | `85` | `340` | `0` | `82DCCE219E44D6114F7E1A47FE0BC453D3AC5C644AE27773CC88B3DCACB9780B` |
| `characterparam.bin` | `2` | `197` | `796` | `72` | `AFB21D46128DD87E7576DE0FB1F9365EF1C226739D83F37F0A6A8831FED1FC53` |
| `speedparam.bin` | `1` | `74` | `304` | `37` | `62D32EB333E2AE96349D799ADC63BC4FC8D9E6157FED02E830D142466B4B7F00` |
| `interactionid.bin` | `29` | `31` | `124` | `0` | `EA760D25E28EAF7FA76974F6E171394894139322806A888805FDCC9CA44BF619` |
| `hitgroupiddef.bin` | `34` | `15` | `60` | `0` | `76B8B39BCE59648C08F869F5AD616C8C16DD9B3D14C4309CD9C0041DD9A3803D` |

`armsparam.bin` 直接读取结果：

| Entry ID | Ammo | Reload type | Start | Total | Per-shot | Wait | Cooldown | Charge/full | Continuous/count/interval | Bullet type |
|---|---:|---:|---:|---:|---:|---:|---:|---|---|---:|
| `0x25AAD736` | `1` | `0` | `240` | `70` | `300` | `80` | `210` | `0/210` | `0/0/0` | `2` |
| `0x41E28D02` | `1` | `0` | `300` | `100` | `420` | `100` | `300` | `0/300` | `0/0/0` | `3` |
| `0x6DB53916` | `2` | `0` | `300` | `100` | `420` | `100` | `300` | `0/300` | `0/0/0` | `1` |
| `0xE03129B8` | `1` | `0` | `210` | `70` | `300` | `70` | `210` | `0/210` | `0/0/0` | `4` |
| `0xF23E44C8` | `3` | `1` | `240` | `80` | `420` | `80` | `240` | `60/240` | `1/120/90` | `0` |

5 个 entry ID 都没有作为 literal 出现在 `0.c/2.c`。`0xF23E44C8` 的 3 发与
continuous-fire 结构符合 wiki 主射 3 发候选，但 slot 绑定仍是 native/order driven，不能把
这个候选写成最终 hash 名。

代表 raw `bulletparam.bin` rows：

| Bullet ID / row | Move | Range/homing | Life | Resource/action | Hitgroup/interaction | Code use |
|---|---:|---|---:|---|---|---|
| `0x16A9DDC4` / `10` | `255` | `20/500` | `300` | `0x74C92692/0x39CE3399` | `0xAA853F87/0x0F3F177C` | `func_988` |
| `0xECA6E0A7` / `87` | `255` | `20/500` | `300` | `0x74C92692/0x39CE3399` | `0x508A02E4/0x0F3F177C` | `func_988` |
| `0xC6CC5D4B` / `74` | `255` | `0/0` | `180` | `0/0` | `0x8A11BF93/0xD162BFD2` | `func_997` direction 1 |
| `0x3C2A51FB` / `24` | `255` | `0/0` | `180` | `0/0` | `0x8A11BF93/0xD162BFD2` | `func_997` direction 2 |
| `0x72CBFB91` / `41` | `255` | `0/0` | `180` | `0/0` | `0x8A11BF93/0xD162BFD2` | `func_997` direction 3 |
| `0x067537DD` / `2` | `255` | `0/0` | `180` | `0/0` | `0x8A11BF93/0xD162BFD2` | `func_997` neutral |
| `0x4F2D7AD3` / `31` | `255` | `300/0` | `10` | `0xE2CB32CF/0x3EA3F780` | `0x17925E47/0xD162BFD2` | `func_997` slot 3 |
| `0x11EB040D` / `8` | `255` | `7/500` | `300` | `0x0547BE0A/0x5E647E65` | `0x17925E47/0xD162BFD2` | `func_1000`, twice |
| `0x30135A4B` / `18` | `4` | `0/0` | `240` | `0x8504F0E9/0` | `1/0x0F3F177C` | multi-projectile child |
| `0x81C58335` / `49` | `6` | `0/0` | `240` | `0x8504F0E9/0` | `1/0x0F3F177C` | multi-projectile child |

全文件 107 个 literal `sys_4F(0, slot, hash)` 调用包含 82 个唯一 hash；82 个全部命中
本机 93-entry `bulletparam.bin`。剩余 11 个 Param rows 没有被 literal 直接引用，可能由
native/order、child/on-expire 或动态路径消费。

`speedparam.bin` 只有 row `0xC2B19D12`，`2.c:8194` 直接写入
`global142`。当前 parser 字段值：movement class `7`、boost gauge `500`、BD initial
`170`、BD max `350`、BD duration `378`、air base `260`、air max `65`、step distance
`8`。

## Fixed registry 与 Aerial 对比

`func_1149` 有 26 个固定 rows：23 个非零 callback、3 个 null callback。其 26 个 hash
与 Aerial `func_1194` 完全相同；随后 `func_1150/1151/1152` 注册 slot/resource/extra。

| Evidence | Pharact | Aerial | Result |
|---|---:|---:|---|
| `0.c` | `3594` lines, SHA `70F360...` | same | byte-for-byte common template |
| `1.c` | `34` lines, SHA `24FF3E...` | same | common glue |
| `2.c` | `1153` functions / `33339` lines | `1198` / `33544` | unit behavior differs |
| External rows | `32` | `46` | Pharact action graph is smaller |
| Phase resolver cases | `101` | `141` | Pharact callback surface is smaller |
| Fixed registry | `23 nonzero + 3 null` | same hashes/counts | stable external-template layer |
| `bulletparam` | `93` rows | `156` rows | Aerial has denser projectile data |
| `armsparam` | `5` rows | `4` rows | slot count is not action-count proxy |
| `characterparam` | `2` rows | `1` row | Pharact has action-local range state |
| Literal bullet hashes | `82` unique | `92` unique | both directly bridge code to raw rows |
| `sys_51(0x20000)` | `0` | `2` | Pharact has no assist summon path |

同一个 action hash 也不能跨机体直接命名：`0xD02D6AD4` 在 Pharact 是 row 32、group
`0x03`、`func_1054` 临时 characterparam 切换；在 Aerial 是 row 46、group `0x1F`、
`func_1104` 多弹体时间线。稳定主键必须包含 unit、group、row fields、callback shape 与
resource 输出，不能只有 action hash。

## 边界与下一步

- row 3 shooting CS 的实际 projectile/hitbox 仍需追 common shooting runtime、motion 与
  effect；不能使用未被 Param 引用的 `func_973`。
- Corax 与 Beakfoot 已有 category、movement、bullet family 证据，但 neutral/horizontal
  精确映射仍需 motion hash 或实机 trace。
- 5 个 arms rows 的可见 slot 绑定仍在 native/order 层。
- rows `15..31` 需要继续按 melee param、hitgroup、interaction 和 timeline 拆分。
- row 30 的 16-projectile timeline 与 row 32 的超远锁定态是 awakening action 强候选，
  但最终玩家名仍需 effect/motion 资源确认。
- 继续研究时直接从 `.c -> raw Param` 追踪；不要恢复 generated JSON 工作流。

## 当前结论

真实 OB v27 Pharact 是 32-action external Param action-table 机体。`0.c` 与 Aerial 共用
完全相同的 input adapter，`1.c` 是相同 glue；单位差异由 raw `chrsysparam`、
`2.c func_873/965` 与后段 callback 实现。当前已经直接闭环 Corax/Beakfoot/方向特殊移动
候选弹体族、82 个 literal bullet hashes、无 assist summon，以及 row 32 的临时超远
characterparam 状态。以上结论来自实际 `.c` 和二进制行，不来自 generated JSON。
