# 1001001 RX-78-2 Gundam MSC 研究

生成日期：2026-06-20

上级入口：

- [跨机体 MSC 研究总览](../../cross-unit-msc-research-overview.md)
- [首批跨机体 MSC 对比](../../cross-unit-first-batch-comparison.md)
- [MSC 代际与 Param Action Bridge 对比](../../msc-generation-param-bridge-comparison.md)
- [Legacy 1011 与 OB v27 跨版本对比](legacy-1011-vs-ob-v27.md)
- [Delta Plus 主射与 RX-78-2 自动装填对比](../../delta-plus-main-shot-rx78-style-auto-reload.md)

## 身份与来源

| Field | Value |
|---|---|
| Character ID | `1001001` |
| Local name evidence | `001GUNDAM / RX-78-2 Gundam` |
| Msc signed / hex | `-231849379` / `0xF22E425D` |
| Param signed / hex | `-1546291131` / `0xA3D57845` |
| Msc source | `E:\OBHK0.3_v27\data\x64\dplcache_release\0xF22E425D.fhm2d` |
| Param source | `E:\OBHK0.3_v27\data\x64\dplcache_release\0xA3D57845.fhm2d` |
| Msc workspace | `E:\XB\解包\com\file\040msc\0xF22E425D` |
| Param workspace | `E:\XB\解包\com\file\041cpm\0xA3D57845` |

`Character ID Table` 的当前 row 只提供 ID 与资源 hash；机体名由仓库已有
`001GUNDAM` 本地映射交叉确认。源 FHM2D 只读，抽取和反编译只写 workspace。

源文件完整性：

| Source | Bytes | MTime | SHA-256 |
|---|---:|---|---|
| `0xF22E425D.fhm2d` | `99562` | `2024-07-10 00:07:30` | `B2D9D1FD92B1068A9D53F66085E3948E031DF7AB566F1A33B28F8D6011D9BE1B` |
| `0xA3D57845.fhm2d` | `8465` | `2023-07-25 00:07:25` | `EA4ABCFDDAAC5719C73BB606D97375D10EA552D8B209DCB53274017E75A4CB72` |

## 0.c / 1.c / 2.c 快照

| Script | Binary bytes | Binary SHA-256 | C lines | Functions | C SHA-256 |
|---|---:|---|---:|---:|---|
| `0.c` | `27168` | `A9978203970016F0585682E4B4C4896C6466F290BEDE946D51DB0BD8FAA147BC` | `3461` | `145` | `CCDE0F95AA341E9896FD1EFA4339F5FF91305294C35A79B6A90326521771A235` |
| `1.c` | `192` | `3BA97A583CC93CEC2E2BFBF85F02FDA0729C17ABE3E2959E4451FBCC04B1C151` | `34` | `6` | `24FF3EEB5235F34AE9B99918B1C59CC5D5D8972CEE09121DBAF3135F35E6452F` |
| `2.c` | `275520` | `1BAA2A81F96C7061FAA73DD601A3A5A03F884FD9859717C28A98C44A5CFF38D5` | `30089` | `1062` | `FA93995983C1F7003AF787812433085C220017B284BB89CB42BA36C2F9811D24` |

这里的 `.c` 由当前 `tools/mscdec.py` 从新抽取的三份脚本重新生成。旧散落目录
`E:\XB\解包\com\file\0xF22E425D` 不作为当前版本证据；其 `.c` hash 与本次抽取
不同，且缺少可用于来源核验的完整三份原始脚本。

本页不使用 generated analysis JSON。结构统计来自完整 `.c` 扫描；行为结论来自下面
列出的实际函数体、syscall 和原始 Param row。

旧对照 `G:\1. Gundam - 1011.c` 的 embedded B4AC、人工 FB/XB patch 边界和同动作
hash 迁移见[跨版本对比](legacy-1011-vs-ob-v27.md)。该文件不是可回溯到原始 FHM2D 的
官方 clean build，不能和本页 OB v27 源证据等量看待。

## Action storage 分类

`chrsysparam.csyspm` 是 `68` bytes。直接按 little-endian u32 读取：

- magic `0xB4ACACAF`，version `0x00010000`，unit id `1001001`。
- table0 marker `0xA8BBBAB9`，`1 x 1`，唯一 cell 为 `0`。
- table1 marker `0xA8BAA9BA`，`1 x 1`，唯一 cell 为 `0`。
- `0.c`、`2.c` 都没有 `0x700000/0x700001/0x700002`。
- `0.c`、`2.c` 都没有 `sys_2C/sys_2D`。
- `0.c:3440-3460 func_144` 直接注册 17 个固定 input callback。

结论：RX-78-2 属于 **classic local selector**，不是 external Param action-table，也不是
legacy embedded B4AC。RX、Unicorn、Sinanju、Delta Plus 的 `0.c func_144` 源码逐字
相同，说明这 17 个 callback 是 classic runtime template；单位武装差异主要落在
`func_143` selector 与 `2.c` unit tail。

## 1.c：完整源码职责

`1.c` 已完整读取，只有 6 个函数：

```text
main -> func_1 -> func_3(empty)
     -> callFunc3(func_2)
func_2 -> func_4(empty) -> func_5(empty)
```

它与当前其它真实样本的 `1.c` hash 相同，不包含 RX 武装、形态或 action hash。当前证据
仍支持把它视为通用 glue stub，而不是机体逻辑层。

## 0.c：输入到 action hash

`0.c:3349-3438 func_143` 是 RX 的 unit selector。它直接读取 `global48` 输入位、
`global2` 方向位、ammo/native 状态，然后调用 `func_95(action_hash, ...)`。

| Code evidence | Gate | Action hash | 代码与 wiki 联合候选 |
|---|---|---|---|
| `0.c:3427-3436` | `global48 & 0x1` | `0xF48D2D49` / `0xAE6D509D` | Beam Rifle 正面 / 背面状态；两者在 `2.c` 共用 bullet row `15` |
| `0.c:3416-3425` | `global48 & 0x800`，无方向 / 有方向 | `0x868B9026` / `0x4D9D0C32` | N 射击 CS / 方向 Super Napalm |
| `0.c:3355-3364` | `global48 & 0x80`，无横向 / 横向且 slot 1 有弹 | `0x6E6EB5C3` / `0x8F35CBC3` | N / 横 Hyper Bazooka |
| `0.c:3366-3375` | `global48 & 0x100`，slot 2 与 assist 状态可用 | `0xE7D67E59` | Guncannon + Guntank assist family |
| `0.c:3377-3386` | `global48 & 0x200`，无横向 / 横向 | `0x9AA23C82` / `0x640D4DFF` | N Gundam Hammer / 横 Hammer Swing |
| `0.c:3404-3407` | `global48 & 0x20` | `0x91D361B9`，release 时再投递 `0x031F9F7C` | 后格 Beam Javelin hold/release |
| `0.c:3388-3391` | `global48 & 0x40` | `0x3AC14535` | Burst Attack / Last Shooting 候选 |

这些 action hash 在 `2.c:29852-29869 func_1058` 直接注册。输入位名称不是仅凭
bit 值推断；武装候选还要求对应 runtime 输出、slot/Param 数值与 wiki 行为同时匹配。

## 2.c：武装 action runtime

`2.c` 的 unit action wrapper 先进入 common ranged/melee runtime，再把实际阶段函数写入
`global676..global680` 或 `global602/global609`。真正输出在阶段 callback：

| Action | Wrapper / callback | 直接源码证据 | 当前语义 |
|---|---|---|---|
| `0xF48D2D49` | `func_915 -> func_917/918` | `2.c:25952-25962 func_918` 调 `sys_4F(0,0,0x93459D29)`；该 hash 是 bulletparam row `15` | 普通 Beam Rifle |
| `0xAE6D509D` | `func_919 -> func_921..924` | `func_922` 仍输出 `0x93459D29`，但使用另一组 motion/state callback | 背面 Beam Rifle 状态候选 |
| `0x868B9026` | `func_925 -> func_928` | `2.c:26168-26190` 调 `sys_4F(0,global681,0x8A43CB50,1)`，命中 bullet row `13` | N 射击 CS：Beam Rifle 最大输出 |
| `0x4D9D0C32` | `func_931 -> func_933/934` | `func_933` 含 `sys_46` 位移和动态 projectile；`2.c:26380-26394 func_934` 再输出 `0x889F7942`，命中 row `12` | 方向射击 CS：Super Napalm |
| `0x6E6EB5C3` | `func_937 -> func_940` | `2.c:26485-26530` 调 `sys_4F(0,global681,0x180D9A7D)`，命中 row `3` | N Hyper Bazooka |
| `0x8F35CBC3` | `func_943 -> func_946/947` | `func_946` 先用 `sys_46` 做横移；`func_947` 输出 `0xDDF28463`，命中 row `24` | 横 Hyper Bazooka 移动射击 |
| `0xE7D67E59` | `func_950 -> func_953` | `2.c:27060-27078` 按方向组合两次 `sys_51(0x20000,0,2,...)`，随后 `sys_4F(7,2,1)` 扣 slot 2 | 双 assist：砲击 / 突击分型 |
| `0x9AA23C82` | `func_955 -> func_958` | `2.c:27150-27201` 输出 `0xB2B3E293`，命中 bullet row `20` | N Gundam Hammer |
| `0x640D4DFF` | `func_960 -> func_963` | `func_963` 进入专用 melee/runtime 路径，含多次 `sys_57`，不走 N Hammer projectile row | 横 Hammer Swing |
| `0x91D361B9` | `func_966 -> func_968` | `2.c:27553-27658` 在按住 `global48 & 0x20` 期间累积 `global772`，松开或满时投递 `0x031F9F7C` | Beam Javelin 蓄力段 |
| `0x031F9F7C` | `func_969 -> func_972` | `2.c:27756-27777` 按 `global772` 三段阈值输出 bullet row `0/14/25` | Beam Javelin 投掷段 |
| `0x3AC14535` | `func_1008 -> func_1010 -> func_1011` | `2.c:28862-28939` 进入觉醒技起手，设置 melee hitboxes 并投递 `0x6B9EBE62` | Last Shooting 起手 |
| `0x19F1EA82` | `func_1016 -> func_1018` | `2.c:29005-29035` 在 `0xC8..0x708` 帧交替输出 bullet row `27/2`，再投递 `0xEC743522` | Last Shooting BR 连射/收束段 |

初始化 `2.c:25538-25550 func_885` 直接绑定：

```text
slot 0 -> arms entry 0xE4FAB738
slot 1 -> arms entry 0x57611139
slot 3 -> 0
```

assist 的 arms entry `0x8880B9CF` 存在，但这段没有用 `sys_4F(0xB,2,...)` 绑定；
slot 2 由 assist/native 路径怎样关联该 entry 仍需继续追，不能仅凭 entry 顺序下结论。

全脚本扫描结果更明确：

```text
0.c:3368      sys_0(0x90000,2) 检查 slot 2 ammo/resource
2.c:27067-74  sys_51(0x20000,0,2,index,type) 召唤两机 assist
2.c:27077     sys_4F(0x7,2,1) 扣 slot 2
2.c:29786-300 func_1055 用 sys_0(0xd0001/d000b) 与 sys_0(0x90000,2,0)
              维护 sys_4F(0x15/0x16,2,...) 的 HUD / 可用状态
```

`0.c/1.c/2.c` 中没有 `sys_4F(0xB,2,0x8880B9CF)`。所以 RX assist slot 2
不是由 `func_885` 显式绑定；更像由 engine/native assist state 从 Param 或其它资源表初始化，
MSC 只负责按键 gate、assist summon、扣槽和 HUD gate。不能把 Delta Kai 的
`sys_4F(0xB,2,...)` 模式直接套到 RX。

## Param 武装闭环

直接按项目 `ParamBinaryHeader + field descriptors + entry rows` 布局读取
`armsparam.bin`：3 entries、48 fields、entry size `200`。

| Entry ID | Ammo | reload type | reload per shot | Other frame evidence | Script/wiki match |
|---|---:|---:|---:|---|---|
| `0xE4FAB738` | `8` | `2` | `180` | start `120`、total `40`、lock `90`、wait `40`、cooldown `120` | `func_885` slot 0；wiki Beam Rifle 常时 3 秒 |
| `0x57611139` | `2` | `1` | `270` | start `180`、total `60`、wait `60`、cooldown `180` | `func_885` slot 1；wiki Hyper Bazooka 击切 4.5 秒 |
| `0x8880B9CF` | `2` | `1` | `720` | start `480`、total `160`、wait `160`、cooldown `480` | wiki assist 消灭后 12 秒；脚本 slot 2 绑定仍待证明 |

`180/270/720` 帧分别对应 `3/4.5/12` 秒，三项都与 wiki 的玩家可见 reload
一致。当前 OB v27 主射 `reload_lock=90`；旧研究副本曾记录 `120`，本页以当前源 FHM2D
重新抽取值为准。

`bulletparam.bin` 是 28 entries、85 fields、entry size `340`。关键 `.c` 输出已直接命中：

| Bullet row | Entry ID | Called from | Selected raw behavior |
|---:|---|---|---|
| `3` | `0x180D9A7D` | N Bazooka `func_940` | lifetime `90`、initial speed `4`、hitgroup `0x0A5EEE9F` |
| `24` | `0xDDF28463` | side Bazooka `func_947` | 与 row 3 同 lifetime/speed/hitgroup，不同 visual resource |
| `13` | `0x8A43CB50` | N shooting CS `func_928` | lifetime `300`、initial speed `3.5`、max range `30` |
| `12` | `0x889F7942` | Super Napalm `func_934` | lifetime `150`、on-expire `0x7509CDFB` |
| `15` | `0x93459D29` | Beam Rifle `func_918/922` | lifetime `300`、initial speed `0.8`、interaction `0x99C241CE` |
| `20` | `0xB2B3E293` | N Hammer `func_958` | move type `4`、lifetime `25`、initial speed `13` |
| `0` | `0x0B429C3D` | Beam Javelin Lv1 `func_972` | move `255`、lifetime `300`、speed `3.5`、range `7`、resource `0x8A82C657` |
| `14` | `0x924BCD87` | Beam Javelin Lv2 `func_972` | move `255`、lifetime `300`、speed `6`、range `12`、resource `0x138B97ED` |
| `25` | `0xE54CFD11` | Beam Javelin Lv3 `func_972` | move `255`、lifetime `300`、speed `8.5`、range `17`、resource `0x648CA77B` |
| `27` | `0xF4F2179C` | Last Shooting `func_1018` even ticks | move `255`、lifetime `300`、hitbox `3 x 40`、hitgroup `0x8D44E986`、interaction `0x46EA22FB` |
| `2` | `0x0EFD2AFF` | Last Shooting `func_1018` odd ticks | same resource `0xF1E73C14`，hitgroup `0x774BD4E5`、interaction `0x46EA22FB` |

这些 row 只证明资源和行为形状；伤害最终值仍可能由 arms/melee/hitgroup/interaction
共同决定，不能把 bullet row 单独当完整伤害表。

`0x8D44E986 / 0x774BD4E5 / 0x46EA22FB` 未直接命中当前 RX
`hitgroupiddef.bin` / `interactionid.bin` 的 entry id。这里先作为 bullet row 内部 hash
记录，不强行跨表命名。

## Beam Javelin 闭环

`0.c:3404-3407` 把 `global48 & 0x20` 选到 `0x91D361B9`。`2.c:27553-27658`
的 `func_966/968` 是 hold 阶段：按住期间 `global772 += global457`，并在
`0x7D0`、`0x1518` 等阈值触发视觉/音效增强；松开或超过内部上限后投递
`0x031F9F7C`。

`2.c:27667-27800 func_969/972` 是 release 阶段：

| Charge evidence | Output | Param row | Wiki match |
|---|---|---:|---|
| `global772 < 0x7D0` | `sys_4F(0,5,0x0B429C3D)` | `0` | Lv1 |
| `0x7D0 <= global772 < 0x12C0` | `sys_4F(0,5,0x924BCD87)` | `14` | Lv2 |
| `global772 >= 0x12C0` | `sys_4F(0,5,0xE54CFD11)` | `25` | Lv3 |

三行 bullet 的 speed/range 从 `3.5/7` -> `6/12` -> `8.5/17` 增强，且共享
`action=0x5A2E3556`、`interaction=0x2D80F843`、`on_expire=0xEADEBB38`。
这与 wiki “后格 Beam Javelin 长按三段强化、2 段以上追加鈍足”一致。

## Last Shooting 闭环

`0.c:3388-3391` 的 `global48 & 0x40` 直接投递 `0x3AC14535`。
`2.c:28854-28939` 显示该 action 不是普通 melee，而是特殊觉醒技 driver：

```text
0x3AC14535 -> func_1008
  -> func_1010: func_308(...0x7F618211...), func_523, func_531(func_1011)
  -> func_1011: func_532(4,15,0x62), func_536(...func_1012)
  -> func_1012: func_81(0x6B9EBE62,1,2,global173)
```

后续链继续：

```text
0x6B9EBE62 -> func_1013/1015 -> func_81(0x19F1EA82,...)
0x19F1EA82 -> func_1016/1018
  -> sys_4F(0,5,0xF4F2179C) / sys_4F(0,5,0x0EFD2AFF) 交替 8 次
  -> func_81(0xEC743522,...)
0xEC743522 -> func_1019/1021/1022 -> func_81(0x7210A081,...)
0x7210A081 -> func_1024/1026/1027 -> finish / movement / hit cleanup
```

wiki 写作“切り上げから真上に BR”。源码形状也分成起手 melee hitbox 与后续 BR
projectile 段。当前已经闭环到 Last Shooting 的 projectile row `27/2`；但 melee
起手的具体 damage 还要继续拆 `func_532/535/536/572` 对 melee/hitbox runtime 的含义。

## Registry 与跨机体位置

RX `2.c` registry：

- `func_835`: 172 个 shared `sys_1` 注册。
- `func_836`: 7 个 shared `sys_1` 注册。
- `func_1058`: 55 个 action registry row，其中 52 个非零 callback。
- `0x9475130E / 0x77B100FF / 0xA02D57DC` 三个 transform action 显式注册为 `0`，与 wiki“无变形”一致。
- `func_1059/1060/1061`: 49 / 106 / 15 个 tail `sys_1` registry row。
- 整份 `2.c` 有 353 个 `sys_1(0x10001,...)`，总 `sys_1` 调用 582 次。

RX 的非零 action handler hash 与其它真实源样本交集：

| Against | Intersection |
|---|---:|
| Unicorn | `28` |
| Sinanju | `31` |
| NEXA-N | `25` |
| AGE-FX | `25` |
| Delta Plus | `30` |

六台真实源样本的非零共同交集仍是原来的 25 个 common runtime hash。RX 还提供
classic 样本中的明确反例：通用 transform hash 可以保留在 registry ABI 中，但 callback
为 `0`；所以“registry 有该 hash”不等于机体支持该玩法状态。

## Wiki 玩家语义

EXVS2OB wiki 的当前候选词汇：

- 无形态移行、无变形 command。
- Beam Rifle 8 发、常时 3 秒。
- N shooting CS 是 Beam Rifle 最大输出；方向 shooting CS 是 Super Napalm。
- N/横 Hyper Bazooka 共用 2 发，击切 4.5 秒。
- Guncannon + Guntank 双 assist 共用 2 发，assist 消灭后 12 秒。
- N Gundam Hammer、横 Hammer Swing、Beam Javelin、Last Shooting。

来源：[EXVS2OB Gundam](https://w.atwiki.jp/exvs2ob/pages/78.html)、
[StrategyWiki RX-78-2 movelist](https://strategywiki.org/wiki/Mobile_Suit_Gundam_Extreme_Vs._2_OverBoost/RX-78-2_Gundam)。
wiki 只用于玩家语义和数值交叉验证；action 名称以 `.c -> Param/resource` 闭环为准。

## 下一步证据

- 继续拆 Last Shooting 起手 `func_532/535/536/572` 的 melee damage / hitbox runtime。
- 追 assist `0x8880B9CF` 到 slot 2 的 native/非 MSC 初始化路径；当前 `.c` 已证明不是 `func_885` 显式绑定。
- 追 Javelin 的 slow debuff 来自 `interaction=0x2D80F843`、`on_expire=0xEADEBB38`，还是 projectile behavior/native effect。
- 与 Delta Plus 主射当前源重新比较 `reload_lock=90`，修正旧副本数值引用。
