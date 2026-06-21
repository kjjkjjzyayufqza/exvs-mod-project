# RX-78-2 legacy 1011 与 OB v27 MSC 跨版本对比

生成日期：2026-06-21

上级入口：

- [1001001 RX-78-2 Gundam MSC 研究](README.md)
- [MSC 代际与 Param Action Bridge 对比](../../msc-generation-param-bridge-comparison.md)
- [跨机体 MSC 研究总览](../../cross-unit-msc-research-overview.md)

## 结论先行

这不是两份“官方原版 MSC”的干净 diff。

- OB 侧是可回溯到 v27 源 FHM2D 的 `0.c / 1.c / 2.c + raw Param`。
- legacy 侧只有 `G:\1. Gundam - 1011.c`。文件注释明确说其 B4AC 来自
  MBON `011.bin`，但主体又做了大量 FB 兼容修改，并混入 XB 风格 Burst 逻辑。
- legacy 没有对应 MSC binary、FHM2D、`011.bin` 或同目录 `0/1/2.c`，因此只能证明
  “这份磁盘代码当前怎样工作”，不能把所有代码都当作某一官方版本的原始实现。

在这个边界内，仍然得到两个可靠结论：

1. 同一机体从 legacy embedded B4AC 变成 OB classic local selector；OB RX 的
   `chrsysparam.csyspm` 是 68-byte 空表，并没有简单迁移成 external Param action-table。
2. Beam Rifle、双 CS、Bazooka、三段 Javelin、方向 assist 和 Last Shooting 能按
   函数行为对齐，但 29 个 legacy action hash 与 OB `func_1058()` 的 55 个 action hash
   精确交集为 `0`。跨版本不能复用 action hash 字典。

本页直接读取 `.c` 与 raw Param，不使用 generated analysis JSON。

## 证据等级与文件身份

### Legacy 1011.c

| Field | Value |
|---|---|
| Path | `G:\1. Gundam - 1011.c` |
| Bytes | `885051` |
| MTime UTC | `2026-06-03 15:35:42.365326` |
| SHA-256 | `1232A5A83769102D4525BE1321B07A6F8C52855DC2F8443B7BBEC706B42BD28D` |
| Alternate stream | `Zone.Identifier`, `HostUrl=https://github.com/` |
| Matching old binary/FHM2D on `G:\` | not found |

`HostUrl` 只证明下载域名；公开搜索未定位到具体 repository/commit，不能补成来源证明。

代码内的版本证据比文件名更重要：

- `main()`、`func_1()` 等位置共有 `43` 处 `FB Change` 注释。
- `func_767()` 注释写明 `add_B4AC()` 由 MBON `011.bin` 生成。
- `func_765/766()` 把数据集数量硬编码成 `0x1E`，并注释其来源是 MBON
  `011.bin` offset `0x20`。
- 追加逻辑同时出现 `Original MBON` 与 `XB Version of C Burst`。
- `main()`、Burst、input、weapon reader 等原有函数也被插入人工逻辑；不能只把文件尾
  当补丁区、文件前半当未改原版。

所以本页使用以下名称：

> **MBON-derived、FB-compatible legacy 1011.c，含 XB-style Burst 人工改造**

不再称为“EXVS1 原版”或“纯 MBON 原版”。

### OB v27

| Source | Bytes | MTime | SHA-256 |
|---|---:|---|---|
| `0xF22E425D.fhm2d` | `99562` | `2024-07-10 00:07:30` | `B2D9D1FD92B1068A9D53F66085E3948E031DF7AB566F1A33B28F8D6011D9BE1B` |
| `0xA3D57845.fhm2d` | `8465` | `2023-07-25 00:07:25` | `EA4ABCFDDAAC5719C73BB606D97375D10EA552D8B209DCB53274017E75A4CB72` |

Workspace：

```text
Msc   E:\XB\解包\com\file\040msc\0xF22E425D
Param E:\XB\解包\com\file\041cpm\0xA3D57845
```

OB 三脚本快照：

| Script | Binary bytes | C lines | Functions | C SHA-256 |
|---|---:|---:|---:|---|
| `0.c` | `27168` | `3461` | `145` | `CCDE0F95AA341E9896FD1EFA4339F5FF91305294C35A79B6A90326521771A235` |
| `1.c` | `192` | `34` | `6` | `24FF3EEB5235F34AE9B99918B1C59CC5D5D8972CEE09121DBAF3135F35E6452F` |
| `2.c` | `275520` | `30089` | `1062` | `FA93995983C1F7003AF787812433085C220017B284BB89CB42BA36C2F9811D24` |

## 架构差异

| Layer | Legacy 1011.c | OB v27 RX-78-2 |
|---|---|---|
| Available artifact | one mixed `.c`; old siblings/binary absent | verified `0/1/2` binaries, `.c`, Msc/Param FHM2D |
| Base globals/functions | `882` `globalN`; `main` + `1091` `func_N` definitions | `145 + 6 + 1062` functions across `0/1/2.c` |
| Manual additions | 49 named helper definitions after base body; patches also inserted earlier | current decompiler output, no AI/manual edit in workspace snapshot |
| Input selection | `input() -> sys_74(0x3,...) -> func_786(row,category)` | `0.c func_143() -> func_95(action_hash,...)` |
| Action storage | `add_B4AC()` emits `sys_2D` rows; `sys_2C` reads fields | local selector + `2.c func_1058()` action registry |
| Action table | 29 rows x 128 fields embedded in code | `chrsysparam` table0/table1 both `1 x 1` zero |
| Phase resolver | `func_926(key) -> func_N` | direct `func_241(action, wrapper)` plus wrapper callback assignment |
| Param boundary | source `011.bin` absent; raw weapon/projectile values unavailable | arms/bullet/character/speed and other Param files present |

legacy 文件本身不能证明旧版本是否也有其它 `0/1` 脚本。当前这一个 artifact 的职责最接近
OB `2.c` 的 common runtime + unit phase body，但不要把“只拿到一个文件”误写成“旧引擎一定
只有一个脚本”。

## Legacy 启动与 embedded B4AC

启动链：

```text
main
  -> func_2()
  -> func_927()
       -> func_928() common callback table
       -> func_929() common action-state callbacks
       -> func_930() hash/resource table
       -> func_931() small table
```

weapon/action table 初始化在另一条 common init 中：

```text
func_767
  -> sys_74(0)
  -> add_B4AC()
  -> sys_74(2)
  -> func_764()
```

`add_B4AC()` 从 line `36122` 开始，对 rows `0x11..0x2D` 写入恰好
`3712 = 29 x 128` 个常量 cell。读取与选择链是：

```text
input()
  -> sys_74(0x3, input/state flags...) returns logical row 1..29
  -> func_786(row, derived category)
  -> sys_2C(0x3, 0x11 + row - 1, field)
  -> func_926(field 0x7C / 0x02 / 0x7D key)
```

phase 字段的实际职责由函数体确认：

- `field 0x7C`：setup/entry。
- `field 0x02`：per-frame/body。
- `field 0x7D`：cleanup。

`func_926()` 有 `113` 个 `key -> func_N` 分支。29 行中有 81 个非零 phase keys，
81 个均唯一且全部解析。`fields 0x30..0x39` 另有 19 条 derived links，全部命中这
29 行中的 action hash。

## Legacy 29 行完整代码索引

`f03/f04` 是 input/category 与方向相关字段；`group` 是 field `0x0A`；action 是
field `0x2E`。语义只在后续有代码和 wiki 双重证据的行上命名。

| Row | Action hash | f03/f04 | Group | setup `f7C` | body `f02` | cleanup `f7D` |
|---:|---|---|---:|---|---|---|
| 1 | `0x572DA853` | `0x00/0x00` | `0x00` | `-` | `-` | `-` |
| 2 | `0x175B75F6` | `0x00/0x17` | `0x05` | `func_989` | `func_990` | `func_991` |
| 3 | `0x763C44AB` | `0x0B/0x00` | `0x03` | `func_992` | `func_993` | `func_994` |
| 4 | `0xA49D5F6B` | `0x0B/0x04` | `0x05` | `func_995` | `func_996` | `func_997` |
| 5 | `0x85E6880D` | `0x07/0x00` | `0x03` | `func_998` | `func_999` | `func_1000` |
| 6 | `0xB0E5A52F` | `0x08/0x00` | `0x03` | `func_1003` | `func_1004` | `func_1005` |
| 7 | `0x1AE4752E` | `0x190/0x00` | `0x03` | `func_1006` | `func_1007` | `func_1008` |
| 8 | `0x7C158C93` | `0x09/0x03` | `0x15` | `func_1009` | `func_1010` | `func_1011` |
| 9 | `0x8D581791` | `0x09/0x0C` | `0x15` | `func_1015` | `func_1016` | `func_1017` |
| 10 | `0xB3C288ED` | `0x09/0x00` | `0x15` | `func_1012` | `func_1013` | `func_1014` |
| 11 | `0xDB2CA8B5` | `0x01/0x00` | `0x0C` | `-` | `-` | `-` |
| 12 | `0xD8E5CBA8` | `0x1F/0x00` | `0x27` | `func_1021` | `func_1022` | `func_1023` |
| 13 | `0xB3360C2E` | `0x1F/0x00` | `0x27` | `func_1024` | `func_1025` | `func_1026` |
| 14 | `0xCF0C8DC6` | `0x1F/0x08` | `0x27` | `func_1027` | `func_1028` | `func_1029` |
| 15 | `0x10B7B00E` | `0x1F/0x00` | `0x27` | `func_1030` | `func_1031` | `func_1032` |
| 16 | `0x8C02D1FC` | `0x01/0x08` | `0x0C` | `func_1033` | `func_1034` | `func_1035` |
| 17 | `0x0A115E73` | `0x12C/0x00` | `0x2D` | `func_1039` | `func_1040` | `func_1041` |
| 18 | `0x137D0C4E` | `0x01/0x03` | `0x0C` | `func_1042` | `func_1043` | `func_1044` |
| 19 | `0x61EC8925` | `0x1F/0x00` | `0x27` | `func_1045` | `func_1046` | `func_1047` |
| 20 | `0x1F7A870B` | `0x06/0x00` | `0x0D` | `func_1072` | `func_1073` | `func_1074` |
| 21 | `0x7F968367` | `0x1F/0x00` | `0x1F` | `func_1075` | `func_1076` | `func_1077` |
| 22 | `0xF7A107C5` | `0x1F/0x15` | `0x1F` | `func_1078` | `func_1079` | `func_1080` |
| 23 | `0x66B10FA7` | `0x1F/0x15` | `0x0C` | `func_1081` | `func_1082` | `func_1083` |
| 24 | `0x8FFD243F` | `0x1F/0x00` | `0x0C` | `func_1084` | `func_1085` | `func_1086` |
| 25 | `0x7ABD7BF6` | `0x01/0x04` | `0x0C` | `func_1087` | `func_1088` | `func_1089` |
| 26 | `0x75A4D456` | `0x1F/0x13` | `0x28` | `func_1060` | `func_1061` | `func_1062` |
| 27 | `0x4D9ED8B5` | `0x1F/0x14` | `0x28` | `func_1063` | `func_1064` | `func_1065` |
| 28 | `0x5EF0FB68` | `0x0A/0x00` | `0x0C` | `func_1066` | `func_1067` | `func_1068` |
| 29 | `0x75DDA8AB` | `0x1F/0x14` | `0x10` | `func_1069` | `func_1070` | `func_1071` |

## 可证明的同动作映射

| Gameplay role | Legacy code | OB v27 code | Result |
|---|---|---|---|
| Beam Rifle | row 2 `0x175B75F6`; `func_989/990/991` | `0.c func_143 -> 0xF48D2D49/0xAE6D509D -> func_915/919` | same role; OB splits front/back state |
| N shooting CS | row 3 `0x763C44AB`; `func_992/993/994` | `0x868B9026 -> func_925/928` | role retained, hash replaced |
| directional CS / Super Napalm | row 4 `0xA49D5F6B`; `func_995/996/997` | `0x4D9D0C32 -> func_931/934` | role retained; OB selector accepts a wider direction mask |
| Hyper Bazooka | row 5 `0x85E6880D`; `func_998/999/1000` | N `0x6E6EB5C3`; side `0x8F35CBC3` | OB adds a separate moving side action |
| Javelin charge | row 6 `0xB0E5A52F`; `func_1003/1004/1005` | `0x91D361B9 -> func_966/968` | three-stage mechanism retained |
| Javelin release | row 7 `0x1AE4752E`; `func_1006/1007/1008` | `0x031F9F7C -> func_969/972` | role retained, hash and thresholds changed |
| F/B assist | row 8 `0x7C158C93` | folded into `0xE7D67E59 -> func_950/953` | assist composition reworked |
| side assist | row 9 `0x8D581791` | folded into `0xE7D67E59 -> func_950/953` | assist composition reworked |
| N assist | row 10 `0xB3C288ED` | folded into `0xE7D67E59 -> func_950/953` | standalone Core Fighter removed |
| Burst Attack / Last Shooting | row 17 `0x0A115E73`; `func_1039/1040/1041` | `0x3AC14535 -> func_1008` then four derived action hashes | same cinematic role; OB graph is explicitly multi-action |

row 17 的识别强于单纯 wiki 猜测：`field 0x03=0x12C` 在
`assign_B4AC_Weapon_Inputs()` 中被单独转成 `0x2000` input flag；`func_1040()` 又包含
多 phase、camera/effect 与强制动作流程，且该机体的 MBON Burst Attack 只有 Last Shooting。
但旧 projectile Param 缺失，无法像 OB 一样闭环到 bullet row。

## Action hash 不能跨版本搬运

legacy 29 个 field `0x2E` action hashes 与 OB `2.c func_1058()` 的 55 个注册 hash：

```text
legacy unique action hashes: 29
OB registry action hashes:   55
exact intersection:           0
```

连 Beam Rifle、Javelin、Last Shooting 这类玩家语义稳定的动作也全部换 hash。可靠的对齐键是：

```text
input/category shape
  + phase body
  + transition target
  + syscall/resource output
  + matching version wiki vocabulary
```

不是 `action_hash -> permanent name`。

## Beam Javelin：保留机制，改变输入与阈值

Legacy：

```text
row 6 / field03=0x08
  -> func_1003 setup
  -> func_1004 body
       global877 += global32
       >= 0x7D0: first charge effect
       >= 0x1770: second charge effect
       release -> func_813(0x1AE4752E)
  -> row 7 / func_1007 release
       < 0x7D0 / < 0x1770 / otherwise: three output branches
```

OB v27：

```text
0.c global48 & 0x20
  -> 0x91D361B9
  -> func_968
       global772 += global457
       >= 0x7D0: first charge effect
       >= 0x1518: second charge effect
       release -> 0x031F9F7C
  -> func_972
       < 0x7D0  -> bullet 0x0B429C3D / row 0
       < 0x12C0 -> bullet 0x924BCD87 / row 14
       otherwise -> bullet 0xE54CFD11 / row 25
```

代码级变化：

- input 从 legacy special shooting 移到 OB back melee。
- charge/release 两 action 结构保留，但 action hash 全换。
- legacy release 的 Lv3 raw threshold 是 `0x1770`；OB release 是 `0x12C0`。
- OB 能直接连到三个 raw bullet rows；legacy 缺 `011.bin`/projectile Param，不能比较弹速、
  range 或 debuff 数值。

## Assist：三选一变成双机组合

Legacy B4AC 的 `field 0x04` 直接拆三行：

```text
row 8  mask 0x03 -> F/B assist candidate -> Guncannon
row 9  mask 0x0C -> side assist candidate -> Guntank
row 10 mask 0x00 -> neutral assist candidate -> Core Fighter
```

`func_963()` 还分别用 `0x7C158C93 / 0x8D581791 / 0xB3C288ED` 做正在场上的
assist input suppression。MBON wiki 对应三种独立召唤、共用 3 发。

OB 只有一个 selector action `0xE7D67E59`。`func_953()` 按方向分支，但每次都做两次
`sys_51(0x20000,0,2,...)`，然后扣 slot 2：

```text
N:         Guncannon + Guntank ranged pair
direction: Guncannon melee/grab + Guntank/Core Fighter combination
ammo:      2
```

这不是旧三行 action hash 的简单合并；召唤组合、ammo 与 callback payload 都改变了。

## Hammer 与 Last Shooting

MBON 的 Gundam Hammer 是 side melee，本身属于后半 melee action graph；不能仅凭 B4AC
row 顺序确定唯一 hash。OB 把 Hammer 提升为明确的 special-melee family：

```text
N:    0x9AA23C82 -> func_955/958 -> bullet 0xB2B3E293
side: 0x640D4DFF -> func_960/963 -> dedicated melee/runtime path
```

Last Shooting 在两个版本都存在，但实现图不同：

- legacy row 17 由一个 action row 的三相 callbacks 驱动，内部按 `global733/734`
  的 `0x835/0x836/0x838` phase 执行。
- OB 从 `0x3AC14535` 起手，依次投递
  `0x6B9EBE62 -> 0x19F1EA82 -> 0xEC743522 -> 0x7210A081`；BR 段交替输出
  bullet rows `27/2`。

所以 OB 的 Last Shooting 是显式多 action graph；legacy 的分段更多藏在同一 row body 与
内部 phase 状态中。

## 玩家可见变化与代码对齐

| Feature | MBON-derived legacy | OB v27/current wiki vocabulary | Code-level change |
|---|---|---|---|
| Main ammo | 7 | 8 | OB raw arms row `0xE4FAB738` ammo `8` |
| Shooting CS | N high-output BR; back Super Napalm | N high-output BR; lever Super Napalm | two roles retained, selector direction broadened |
| Bazooka | 3, stationary | 2; N stationary + side moving | one old action becomes two OB actions |
| Javelin | special shooting | back melee | charge/release graph retained, hashes and threshold changed |
| Assist | Core Fighter/Guncannon/Guntank, three choices, ammo 3 | two paired variants, ammo 2 | three rows collapse into one selector family with two summons per use |
| Hammer | side melee | N/side special melee | promoted into a dedicated command family |
| Burst | Last Shooting | Last Shooting | role retained; OB uses five linked action hashes |

OB raw `armsparam.bin` 进一步给出当前数值：

| Entry | Ammo | reload type | reload frames | Role |
|---|---:|---:|---:|---|
| `0xE4FAB738` | `8` | `2` | `180` | Beam Rifle |
| `0x57611139` | `2` | `1` | `270` | Hyper Bazooka |
| `0x8880B9CF` | `2` | `1` | `720` | assist candidate; native slot-2 binding still unresolved |

legacy 的对应 `011.bin`/arms/projectile binary 不在硬盘，旧 ammo 数值只能作为 wiki
语义校验，不能宣称已由 raw binary 复核。

## 对编辑器与研究方法的影响

1. action hash mapping 必须带版本和机体作用域，不能把 MBON-derived hash 写进 OB 通用映射。
2. `field 0x7C/0x02/0x7D` 的 setup/body/cleanup 模型可以跨代复用；实际 key 和函数不可复用。
3. 不能把 action storage 简化为“旧 embedded、新 external”。RX 的实际路径是：

```text
legacy embedded B4AC
  -> OB classic local selector + empty chrsysparam
```

4. 旧文件中的 semantic variable/comment 可帮助理解人工移植意图，但不能覆盖原始
`globalN/func_N` 证据，也不能当官方符号表。
5. 若以后找到对应 old MSC/`011.bin`，应重新反编译到独立 workspace，并把本页 legacy
结论分成“clean original”与“port patch”两栏。

## 外部语义来源

- [MBON wiki Gundam](https://w.atwiki.jp/gundamexvsmbon/pages/163.html)
- [GGEZ MBON RX-78-2 guide](https://ggez.space/exvsmbon-rx-78-2-gundam/)
- [EXVS2OB wiki Gundam](https://w.atwiki.jp/exvs2ob/pages/78.html)

网页只用于动作名称、输入和玩家可见 ammo/damage 语义。版本归属、action hash、phase
callback、syscall 和 Param row 结论都以本地磁盘代码为主。

## 未关闭的边界

- legacy 原始 repository/commit、MSC binary、FHM2D、MBON `011.bin` 未找到。
- 43 处 `FB Change` 证明文件已修改，但没有基线，无法自动剥离所有 port patch。
- legacy 后半 melee rows 的精确动作名仍需 clean binary、motion/resource table 或实机 trace。
- OB assist `0x8880B9CF` 到 slot 2 的 native 初始化仍未从 MSC 证明。
- 两侧 native syscall ABI 不同；同名 `sys_N` 也不能默认语义完全相同。
