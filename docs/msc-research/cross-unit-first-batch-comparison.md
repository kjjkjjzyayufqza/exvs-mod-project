# 首批跨机体 MSC 对比

生成日期：2026-06-21

本页记录第一批从 Character ID Table 映射出的 MSC FHM2D 抽取、反编译和直接 `.c` 读码结果。入口页见：[跨机体 MSC 研究总览](cross-unit-msc-research-overview.md)。

后续 Param 配对与代际扩展见：[MSC 代际与 Param Action Bridge 对比](msc-generation-param-bridge-comparison.md)。

## 输入与源码工作区

Character ID Table：

```text
E:\XB\解包\com\file\012list\0x036B9E67\character_id_table.json
```

MSC workspace：

```text
E:\XB\解包\com\file\040msc
```

本页不把机器缓存当正文证据。后续结论必须回到 workspace 里的
`0.c / 1.c / 2.c`、真实行号、函数调用形状、Param row 落点和最终 syscall/resource
输出。

`0xBDBE6FEA` 是历史研究工作副本，不是本轮从 `E:\OBHK0.3_v27\data\x64\dplcache_release` 重新抽取的样本。当前副本含 Delta Kai AI patch，不能作为未经修改的官方版本证据。

## 总结论

- `1.c` 在当前十二个真实源样本中完全一致：6 个函数、34 行、反编译 `.c` SHA-256 相同，当前可视为小型 glue/占位层。
- `0.c` 结构高度稳定：classic selector 样本通常是 145 个函数，external Param action-table 样本是 162 个函数；样本都只在 `func_6` 与 `func_92` 出现 `sys_1(0x10001, ...)` 注册。
- `2.c` 是主差异层：函数数从 1047 到 1292 不等，action registry、slot registry、weapon/movement/camera/shell syscall 都集中在这里。
- 尾部 registry 函数编号随机体漂移：Unicorn 是 `func_1065..1068`，Sinanju 是 `func_1095..1098`，NEXA-N 是 `func_1219..1222`。因此跨机体对齐不能只靠函数号，必须看 registry 内容、hash、syscall 分布和调用形状。
- 首批三样本与 BDBE 历史基线共享 25 个固定 handler hash；Delta Plus、AGE-FX、RX-78-2、Kshatriya、G-Self、Mack Knife、真实 Aerial、Pharact、Darilbalde 加入后，十二台真实源样本仍包含同一组 25 个固定 hash。
- 本轮反编译未传入 `--exvsMapping`，所以新样本函数名保持 `func_N`。旧 `0xBDBE6FEA` 分析文件中已有 21 个 `ACTION_*` 名称，不能直接用名称数量比较新旧样本。
- Param 配对后确认：Unicorn / Sinanju 属于 classic local selector；NEXA-N 属于 external Param action-table。两类都不同于 `sys_2C/sys_2D` legacy embedded B4AC。
- RX-78-2 同机体跨版本对照进一步确认：MBON-derived、FB-compatible `1011.c` 内嵌
  29 x 128 B4AC；OB v27 RX 改走 classic local selector。29 个旧 action hash 与 OB
  `func_1058` 的 55 个 registry hash 无交集，跨版本必须按 input/body/resource 对齐。
- Unicorn 的 `global143 -> field 0x17 -> 0.c global39` 已证明是双形态 selector 轴；slot 1 从 raw arms row 的 1 发切到 20 发，主射 callback 同时切换 bullet resource row。
- Kshatriya 复用同一 field `0x17` 形成普通态/Besserung 复活轴；`func_1048/1047` 切换 5-to-3 arms loadout、character/speed Param 行和 registry，98 个唯一 projectile literal 全部命中 raw `bulletparam.bin`。
- Sinanju 的 `0xD44E9701 -> func_1025/1027 -> func_1084` 已证明 Meteor Kick 触发 `赤い彗星の再来`：characterparam entry 与 speedparam row 同时切换，主射、CS、格斗 CS、四向 Bazooka、assist 已连到 raw Param row。
- Delta Plus 的 `global20 & 0x4000` 变形 selector 分支已证明 WR loadout 切换：普通 `0x1486A84F/0x10B251B4/0xA8E202BF` 与 WR `0x377D1397/0xF100A0DA/0x1799C911` raw arms rows 对应，主射、CS、副射、WR 主射/副射/特射已连到 bulletparam row。
- G-Self 的 `global39 == 0/1/2/3` selector 分支已证明四状态 loadout：`func_1125/1127/1128/1130` 分别绑定 raw arms rows、`characterparam` row 和 `speedparam` row；CS 到 Assault-state、多段 projectile family 与 `global776` resource count 已连到 raw Param row。
- Mack Knife 的 `global39 == 0/1` selector 分支已证明 normal / Long-Range Booster 二状态 loadout：`func_1101/1102/1106/1107` 绑定 slot 1/2、`characterparam` row 和 `speedparam` row；Beam Vulcan、Plasma Claw、Grenade Launcher 候选链已连到 raw Param row。
- 真实 Aerial `66001001` 不使用 classic selector：`0.c func_143/145` 读取 external action row，`2.c func_849` 动态注册 46 个 action 与 phase callbacks，代表性多弹体函数已命中 raw `bulletparam.bin`。
- Pharact `66002001` 与 Aerial 的 `0.c/1.c` byte-for-byte 相同，但只有 32 个 external rows 与 101-case resolver；82 个唯一 literal bullet hashes 全部命中 raw `bulletparam.bin`，且没有 `sys_51(0x20000)` assist summon。
- Darilbalde `66003001` 继续复用同一 `0.c/1.c`，但有 43 个 external rows 与 132-case resolver；`func_1174` 维护四枚 drone 的 auto-release/action gate，`func_1167..1170` 维护 slot-4 barrier proxy 与 shell detach/restore。24 个 field/literal bullet IDs 已直接命中 51-row raw `bulletparam.bin`。

## 样本矩阵

| 机体/样本 | Character ID | Msc hex | Param hex | 0.c funcs/lines | 1.c funcs/lines | 2.c funcs/lines | 2.c action handlers | 2.c sys1 entries |
|---|---:|---|---|---:|---:|---:|---:|---:|
| Unicorn / 001UNIGUN | `15001001` | `0x0B180D9E` | `0x5AE33786` | `145 / 3537` | `6 / 34` | `1069 / 31053` | `53` | `425` |
| Sinanju / 003SINANJ | `15003001` | `0xCF8FC16A` | `0x9E74FB72` | `145 / 3506` | `6 / 34` | `1099 / 31239` | `58` | `349` |
| NEXA-N 极限高达爆破 | `59001001` | `0x693F756D` | `0x38C44F75` | `162 / 3594` | `6 / 34` | `1223 / 34612` | `26` | `378` |
| Gundam AGE-FX | `33004001` | `0x605245CC` | `0x31A97FD4` | `162 / 3597` | `6 / 34` | `1292 / 36247` | `26` | `516` |
| BDBE pre-patch history snapshot | unknown in current table pass | `0xBDBE6FEA` | unknown | `145 / 3525` | `6 / 34` | `1047 / 29664` | `55` | `356` |
| Delta Plus | `15004001` | `0x04AD9F33` | `0x5556A52B` | `145 / 3525` | `6 / 34` | `1047 / 29648` | `55` | `356` |
| Kshatriya | `15002001` | `0x3724E360` | `0x66DFD978` | `145 / 3523` | `6 / 34` | `1057 / 30249` | `51 nonzero + 3 null` | `379` |
| RX-78-2 Gundam | `1001001` | `0xF22E425D` | `0xA3D57845` | `145 / 3461` | `6 / 34` | `1062 / 30089` | `52` | `353` |
| G-Self | `42001001` | `0x72CD747F` | `0x23364E67` | `145 / 3706` | `6 / 34` | `1169 / 32709` | `75 + 1 dynamic` | `700` |
| Mack Knife (Mask) | `42002001` | `0xC33AA885` | `0x92C1929D` | `145 / 3572` | `6 / 34` | `1120 / 31418` | `69` | `545` |
| Gundam Aerial | `66001001` | `0x19CE466D` | `0x48357C75` | `162 / 3594` | `6 / 34` | `1198 / 33544` | `26 fixed rows + 46 dynamic rows` | `566` |
| Gundam Pharact | `66002001` | `0x33BAAE59` | `0x62419441` | `162 / 3594` | `6 / 34` | `1153 / 33339` | `26 fixed rows + 32 dynamic rows` | `546` |
| Darilbalde | `66003001` | `0x39DD42B7` | `0x682678AF` | `162 / 3594` | `6 / 34` | `1187 / 33258` | `26 fixed rows + 43 dynamic rows` | `544` |

注：NEXA-N / AGE-FX 的 `26` 包含一处源码级动态 `func_241(var2,var4)`；RX 的 `52` 只计非零 callback，另有三个 transform hash 显式注册为 `0`。Kshatriya 有 51 个 unique nonzero handler、3 个 always-null transform hash，另有 3 个 common hash 在 Besserung 状态临时置 `0`。G-Self 的 `75 + 1 dynamic` 是 tail registry `func_1166` 的 75 个固定 handler 加一处动态 `func_241`。Aerial、Pharact、Darilbalde 的固定 registry 都是 26 行（23 nonzero + 3 null）；各自 `func_849` 再遍历 46 / 32 / 43 个外部 action rows。BDBE 行只作历史上下文。

## 脚本产物核验

| Msc hex | Extract path | Extracted binary sizes | Decompiled C sizes |
|---|---|---|---|
| `0x0B180D9E` | `E:\XB\解包\com\file\040msc\0x0B180D9E` | `0.bscex=27904`, `1.cscex=192`, `2.dscex=294944` | `0.c=66213`, `1.c=254`, `2.c=664612` |
| `0xCF8FC16A` | `E:\XB\解包\com\file\040msc\0xCF8FC16A` | `0.bscex=27344`, `1.cscex=192`, `2.dscex=288288` | `0.c=65022`, `1.c=254`, `2.c=656101` |
| `0x693F756D` | `E:\XB\解包\com\file\040msc\0x693F756D` | `0.bscex=27232`, `1.cscex=192`, `2.dscex=318096` | `0.c=65526`, `1.c=254`, `2.c=727241` |
| `0x605245CC` | `E:\XB\解包\com\file\040msc\0x605245CC` | `0.bscex=27264`, `1.cscex=192`, `2.dscex=333792` | `0.c=65586`, `1.c=254`, `2.c=769697` |
| `0x04AD9F33` | `E:\XB\解包\com\file\040msc\0x04AD9F33` | `0.bscex=27808`, `1.cscex=192`, `2.dscex=272784` | `0.c=65724`, `1.c=254`, `2.c=623183` |
| `0x3724E360` | `E:\XB\解包\com\file\040msc\0x3724E360` | `0.bscex=27456`, `1.cscex=192`, `2.dscex=278624` | `0.c=65758`, `1.c=254`, `2.c=637456` |
| `0xF22E425D` | `E:\XB\解包\com\file\040msc\0xF22E425D` | `0.bscex=27168`, `1.cscex=192`, `2.dscex=275520` | `0.c=64040`, `1.c=254`, `2.c=629951` |
| `0x72CD747F` | `E:\XB\解包\com\file\040msc\0x72CD747F` | `0.bscex=29712`, `1.cscex=192`, `2.dscex=308192` | `0.c=70720`, `1.c=254`, `2.c=694550` |
| `0xC33AA885` | `E:\XB\解包\com\file\040msc\0xC33AA885` | `0.bscex=28624`, `1.cscex=192`, `2.dscex=287328` | `0.c=67557`, `1.c=254`, `2.c=657399` |
| `0x19CE466D` | `E:\XB\解包\com\file\040msc\0x19CE466D` | `0.bscex=27232`, `1.cscex=192`, `2.dscex=313392` | `0.c=65526`, `1.c=254`, `2.c=710924` |
| `0x33BAAE59` | `E:\XB\解包\com\file\040msc\0x33BAAE59` | `0.bscex=27232`, `1.cscex=192`, `2.dscex=314848` | `0.c=65526`, `1.c=254`, `2.c=716740` |
| `0x39DD42B7` | `E:\XB\解包\com\file\040msc\0x39DD42B7` | `0.bscex=27232`, `1.cscex=192`, `2.dscex=308048` | `0.c=65526`, `1.c=254`, `2.c=702919` |

## Decompiled `.c` SHA-256

| Msc hex | Part | SHA-256 |
|---|---:|---|
| `0x0B180D9E` | `0` | `880BAF7878CA2FC6150A4DD56FB037F71C7756567270C5BA418FD67B85DA676A` |
| `0x0B180D9E` | `1` | `24FF3EEB5235F34AE9B99918B1C59CC5D5D8972CEE09121DBAF3135F35E6452F` |
| `0x0B180D9E` | `2` | `B3E447D77BE36728BC3F89DCD63EBAA3014F72CD923E0B5F665EDC38EB4ECA7A` |
| `0xCF8FC16A` | `0` | `FC2809870C1CB56A499FD6C20A8FD0BB198A5690A7B800BF5431172719C896A3` |
| `0xCF8FC16A` | `1` | `24FF3EEB5235F34AE9B99918B1C59CC5D5D8972CEE09121DBAF3135F35E6452F` |
| `0xCF8FC16A` | `2` | `8D5DD9104FEF193E17C7D9E769BC92350E7FEF4645CE92F4680BDADD7D1C405E` |
| `0x693F756D` | `0` | `70F360731C28E2B3DCD9DA14915FCAC0452A57861A65919193BE31B330871795` |
| `0x693F756D` | `1` | `24FF3EEB5235F34AE9B99918B1C59CC5D5D8972CEE09121DBAF3135F35E6452F` |
| `0x693F756D` | `2` | `01156A21620757E0456E6D7BC3BB4D8F30F9C6C77F6395624D0280FCB1A67542` |
| `0x605245CC` | `0` | `94DB7F870F323192143019C6B1EC8E9444D0231425D0C170FDC9A8160425B028` |
| `0x605245CC` | `1` | `24FF3EEB5235F34AE9B99918B1C59CC5D5D8972CEE09121DBAF3135F35E6452F` |
| `0x605245CC` | `2` | `85703574CE03A905CBEBF40F599CDCC7C056464C1875517E344A4F482E14C6F8` |
| `0x04AD9F33` | `0` | `CE3300FBBC671F13C828DAB184E3734C304D01AA257666043AEC51A1A037EC32` |
| `0x04AD9F33` | `1` | `24FF3EEB5235F34AE9B99918B1C59CC5D5D8972CEE09121DBAF3135F35E6452F` |
| `0x04AD9F33` | `2` | `C09FAFDD7A3C9CE0A9D3DE9D94E3F1FF6E162C9ABD99A6C9902F579FFC61594E` |
| `0x3724E360` | `0` | `0FD33798A55E8161E2FCDFA757D5CD07012B339D499ED36924AC09CCED5C82CB` |
| `0x3724E360` | `1` | `24FF3EEB5235F34AE9B99918B1C59CC5D5D8972CEE09121DBAF3135F35E6452F` |
| `0x3724E360` | `2` | `DC6E193CB3DD40111800C6EA0F1530E5CA4E9FB04F26C0341A8B1759678718AA` |
| `0xF22E425D` | `0` | `CCDE0F95AA341E9896FD1EFA4339F5FF91305294C35A79B6A90326521771A235` |
| `0xF22E425D` | `1` | `24FF3EEB5235F34AE9B99918B1C59CC5D5D8972CEE09121DBAF3135F35E6452F` |
| `0xF22E425D` | `2` | `FA93995983C1F7003AF787812433085C220017B284BB89CB42BA36C2F9811D24` |
| `0x72CD747F` | `0` | `8D01BD1202BEF1126105A4EA4D4567A29FFB6B4A695FE876072731FDEB45CDD9` |
| `0x72CD747F` | `1` | `24FF3EEB5235F34AE9B99918B1C59CC5D5D8972CEE09121DBAF3135F35E6452F` |
| `0x72CD747F` | `2` | `CF48C54997B7D50CE0798B7292AB08C92FAFF759E2545862CED60C0E5D6A4760` |
| `0xC33AA885` | `0` | `85A7A4FF229931AAEFC5BF64BB4895A3917AC6104AFB59049C0D46FC101E757E` |
| `0xC33AA885` | `1` | `24FF3EEB5235F34AE9B99918B1C59CC5D5D8972CEE09121DBAF3135F35E6452F` |
| `0xC33AA885` | `2` | `6B0EF0BAE62D564E87DEA79775F89B54438C763E8BE9F3AEEFB10F6AEDA644FA` |
| `0x19CE466D` | `0` | `70F360731C28E2B3DCD9DA14915FCAC0452A57861A65919193BE31B330871795` |
| `0x19CE466D` | `1` | `24FF3EEB5235F34AE9B99918B1C59CC5D5D8972CEE09121DBAF3135F35E6452F` |
| `0x19CE466D` | `2` | `1F3F59DE67F7BEF7C0A6D6F1893ECD31DD9E1A30F29704FCC1212E259D232964` |
| `0x33BAAE59` | `0` | `70F360731C28E2B3DCD9DA14915FCAC0452A57861A65919193BE31B330871795` |
| `0x33BAAE59` | `1` | `24FF3EEB5235F34AE9B99918B1C59CC5D5D8972CEE09121DBAF3135F35E6452F` |
| `0x33BAAE59` | `2` | `1287A81D28FA2659A1FABC00E3BE4B743364EA3AD73B4E804E2AA730C92D6D81` |
| `0x39DD42B7` | `0` | `70F360731C28E2B3DCD9DA14915FCAC0452A57861A65919193BE31B330871795` |
| `0x39DD42B7` | `1` | `24FF3EEB5235F34AE9B99918B1C59CC5D5D8972CEE09121DBAF3135F35E6452F` |
| `0x39DD42B7` | `2` | `3970426BA223DC6A337C001B75C3A98B596BA76C7BCD5246F5CBF2DE59BBA3E2` |

## Registry 对齐

`0.c` registry 函数：

| 样本 | Registry functions |
|---|---|
| `0x0B180D9E` | `func_6` line 145, `func_92` line 2285 |
| `0xCF8FC16A` | `func_6` line 145, `func_92` line 2285 |
| `0x693F756D` | `func_6` line 145, `func_92` line 2284 |
| `0x605245CC` | `func_6` line 145, `func_92` line 2285 |
| `0x04AD9F33` | `func_6` line 145, `func_92` line 2285 |
| `0x3724E360` | `func_6` line 144, `func_92` line 2283 |
| `0xF22E425D` | `func_6` line 145, `func_92` line 2285 |
| `0x72CD747F` | `func_6` line 144, `func_92` line 2283 |
| `0xC33AA885` | `func_6` line 144, `func_92` line 2283 |
| `0x19CE466D` | `func_6` line 145, `func_92` line 2284 |
| `0x33BAAE59` | `func_6` line 145, `func_92` line 2284 |
| `0x39DD42B7` | `func_6` line 145, `func_92` line 2284 |
| `0xBDBE6FEA` | `func_6` line 313, `func_92` line 2283 |

`2.c` registry 函数：

| 样本 | Stable mid registry | Tail action registry | Tail sys1 registries |
|---|---|---|---|
| `0x0B180D9E` | `func_835=172 sys1`, `func_836=7 sys1` | `func_1065=53 handlers` | `func_1066=49`, `func_1067=178`, `func_1068=15` |
| `0xCF8FC16A` | `func_835=172 sys1`, `func_836=7 sys1` | `func_1095=58 handlers` | `func_1096=49`, `func_1097=102`, `func_1098=15` |
| `0x693F756D` | `func_835=172 sys1`, `func_836=7 sys1` | `func_1219=25 constant handlers` plus one dynamic handler in `func_849` | `func_1220=51`, `func_1221=108`, `func_1222=15` |
| `0x605245CC` | `func_835=172 sys1`, `func_836=7 sys1` | `func_1288=25 constant handlers` plus one dynamic handler in `func_849` | `func_1289=50`, `func_1290=208`, `func_1291=15` |
| `0x04AD9F33` | `func_835=172 sys1`, `func_836=7 sys1` | `func_1043=55 handlers` | `func_1044=48`, `func_1045=106`, `func_1046=15` |
| `0x3724E360` | `func_835=172 sys1`, `func_836=7 sys1` | `func_1053=51 unique nonzero + 3 null; 3 common handlers disabled in Besserung` | `func_1054=51`, `func_1055=106`, `func_1056=15` |
| `0xF22E425D` | `func_835=172 sys1`, `func_836=7 sys1` | `func_1058=52 nonzero handlers + 3 null transform rows` | `func_1059=49`, `func_1060=106`, `func_1061=15` |
| `0x72CD747F` | `func_835=172 sys1`, `func_836=8 sys1` | `func_1166=75 handlers` | `func_1167=48`, `func_1168=221`, `func_1169=15` |
| `0xC33AA885` | `func_835=172 sys1`, `func_836=9 sys1` | `func_1117=69 handlers` | `func_1118=48`, `func_1119=62`, `func_1120=15` |
| `0x19CE466D` | `func_835=172 sys1`, `func_836=7 sys1` | `func_1194=23 nonzero + 3 null`, plus 46 dynamic rows in `func_849` | `func_1195=49`, `func_1196=58`, `func_1197=15` |
| `0x33BAAE59` | `func_835=172 sys1`, `func_836=7 sys1` | `func_1149=23 nonzero + 3 null`, plus 32 dynamic rows in `func_849` | `func_1150=49`, `func_1151=58`, `func_1152=15` |
| `0x39DD42B7` | `func_835=172 sys1`, `func_836=7 sys1` | `func_1183=23 nonzero + 3 null`, plus 43 dynamic rows in `func_849` | `func_1184=49`, `func_1185=54`, `func_1186=15` |
| `0xBDBE6FEA` | `func_835=172 sys1`, `func_836=7 sys1` | `func_1043=55 handlers` | `func_1044=48`, `func_1045=106`, `func_1046=15` |

## 共同 action handler hash

这 25 个固定 handler hash 同时出现在 Unicorn、Kshatriya、Sinanju、NEXA-N、AGE-FX、Delta Plus、RX-78-2、G-Self、Mack Knife、Gundam Aerial、Gundam Pharact、Darilbalde 十二台真实源样本；external-table 样本的 `0x900AB393/0xF32AA1BA` 位于早期 `func_2` 注册面，其余主要位于 tail registry。BDBE 历史基线也包含同一组：

```text
0x14b0aea3
0x1ad4e055
0x27786a84
0x41443ba0
0x4de2206b
0x506ac760
0x613494c8
0x676aca0b
0x679f48c2
0x68790b03
0x6d00aeaa
0x868ec571
0x86d45295
0x900ab393
0x901c3623
0x910f3fa7
0x9cf36e1b
0xa8ab2ac9
0xb28c1647
0xdabb0543
0xeee34191
0xef809e66
0xf32aa1ba
0xf5f21169
0xff098547
```

这些 hash 应优先与旧文档中的 `ACTION_*` 命名、Param/chrsysparam action rows、以及实际战斗输入路径交叉验证。

## Syscall 分布要点

`2.c` 的高频 syscall 均以 `sys_0`、`sys_1`、`sys_47`、`sys_4B`、`sys_46`、`sys_4A` 为主：

| 样本 | Top syscall distribution |
|---|---|
| `0x0B180D9E` | `sys_0=1206`, `sys_1=662`, `sys_47=599`, `sys_4B=378`, `sys_46=362`, `sys_4A=249` |
| `0xCF8FC16A` | `sys_0=1226`, `sys_1=581`, `sys_47=418`, `sys_46=414`, `sys_4B=325`, `sys_4A=220` |
| `0x693F756D` | `sys_0=1264`, `sys_1=615`, `sys_47=433`, `sys_4B=396`, `sys_46=384`, `sys_4A=352` |
| `0x605245CC` | `sys_0=1343`, `sys_1=762`, `sys_47=519`, `sys_46=420`, `sys_4B=395`, `sys_4A=251` |
| `0x04AD9F33` | `sys_0=1196`, `sys_1=590`, `sys_46=391`, `sys_47=332`, `sys_4B=275`, `sys_4A=219` |
| `0x3724E360` | `sys_0=1202`, `sys_1=614`, `sys_47=388`, `sys_46=373`, `sys_4B=308`, `sys_4A=181` |
| `0xF22E425D` | `sys_0=1208`, `sys_1=582`, `sys_47=373`, `sys_46=372`, `sys_4B=304`, `sys_4A=181` |
| `0x72CD747F` | `sys_0=1219`, `sys_1=700`, `sys_47=481`, `sys_46=381`, `sys_4B=345`, `sys_4A=268` |
| `0xC33AA885` | `sys_0=1227`, `sys_1=545`, `sys_46=416`, `sys_47=352`, `sys_4B=275`, `sys_4A=203` |
| `0x19CE466D` | `sys_0=1271`, `sys_1=566`, `sys_47=556`, `sys_46=386`, `sys_4A=322`, `sys_4B=309` |
| `0x33BAAE59` | `sys_0=1294`, `sys_1=546`, `sys_47=557`, `sys_4A=527`, `sys_46=388`, `sys_4B=299` |
| `0xBDBE6FEA` pre-patch snapshot | `sys_0=1196`, `sys_1=590`, `sys_46=391`, `sys_47=332`, `sys_4B=283`, `sys_4A=219` |

当前解释仍沿用现有文档共识：`sys_4F` 偏 weapon/ammo/presentation entry control，`sys_51` 偏 assist/summon，`sys_46` 偏动作内 movement bus。具体武装语义必须继续和 Param/chrsysparam、resource hash、动作输入路径配对。

## 下一步

- 对 25 个共同 action hash 建立 `hash -> semantic candidate -> evidence` 表，不直接按函数号命名。
- 对比 `0.c` selector 层到 `2.c` registry 的实际路径，确认 action hash 是从哪里进入 `func_241`/callback 层。
- NEXA-N 已闭环 group `0x03/0x10/0x13/0x26` 的代表 weapon/movement 输出，并把 26 个 resource hash 定位到 bulletparam row；继续追爆炸、hitgroup 与 row `33` 派生。
- AGE-FX 下一步从 group `0x35` 的 `sys_51` payload 和 group `0x0C/0x1F` 三相 callback 扩展外部-table 对照。
- Delta Plus `0x04AD9F33` 已完成抽取与直接读码；后续追主射、变形、援护和特格的单位语义链。
- RX-78-2 `0xF22E425D` 已把主射、两种 CS、N/横 Bazooka、双 assist、N Hammer、Beam Javelin 三段、Last Shooting projectile 段连到原始 Param；后续追 Last Shooting melee 起手、Javelin slow debuff 和 assist slot 2 native 初始化。
- Unicorn `0x0B180D9E` 已把主形态、loadout、Beam Magnum、两形态 CS/sub、special melee、assist、NT-D 与觉醒技强制换装连到 `.c` 和 raw Param；后续追 Destroy 格斗、interaction/hitgroup 与 `B0004[1]` 次状态轴。
- Kshatriya `0x3724E360` 已把普通态/Besserung selector、5-to-3 loadout、character/speed 双行、主要射击 family 和 98/98 literal bullet bridge 连到 `.c` 与 raw Param；后续追 native revival event、Besserung 精确武装名和 all-fire effect/hit chain。
- Sinanju 已建立第一条完整武器/状态闭环；后续只剩 awakening precise split、assist summon payload、slot 4 gauge native 绑定和 melee/hitgroup 深挖。
- G-Self `0x72CD747F` 已把四个 `global39` 状态、slot loadout、CS 到 Assault state、状态 3 projectile family 和 `global776` resource count 连到 `.c` 与 raw Param；后续追 Reflector stored/deployed 精确语义、assist payload 和资源名。
- Mack Knife `0xC33AA885` 已把 `global39 == 0/1` 二状态、slot 1/2 loadout、Beam Vulcan / Plasma Claw / Grenade Launcher 候选与 Booster derivative 连到 `.c` 与 raw Param；后续追 `func_921`/`0x1000`、方向特射、interaction/hitgroup 与 slot 0 native 初始化。
- Gundam Aerial `0x19CE466D` 已把 46 个 external action rows、三相 callback、141-key resolver 和代表性多弹体族连到 `.c` 与 raw Param；后续追全部 input 映射、Demi Trainer `sys_51`、GUND-BIT resource/effect 和 arms slot 绑定。
- Gundam Pharact `0x33BAAE59` 已把 32 个 external action rows、101-case resolver、方向特殊移动、Corax/Beakfoot 候选、82 个 literal bullet hashes 和临时超远锁定态连到 `.c` 与 raw Param；后续追 rows `15..31` 的 melee/hitgroup/interaction 与 arms slot 绑定。
- Darilbalde `0x39DD42B7` 已把 43 个 external action rows、132-case resolver、四机 drone state machine、scatter/mine 分槽、Daya Ambicar barrier proxy 与主要 melee transition graph 连到 `.c` 与 raw Param；后续追 Motion、child projectile、interaction/hitgroup 与 arms slot 绑定。
