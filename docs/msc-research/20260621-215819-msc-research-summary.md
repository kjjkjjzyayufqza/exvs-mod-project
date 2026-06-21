# MSC 研究汇总（截至 2026-06-21）

本页基于 git 历史中 `docs/msc-research/` 下**已全部通读**的 Markdown（13 台机体 README + legacy 对照 + 总览/两份跨机体对比/代际 Param bridge + 函数角色地图/证明手册/原子表/walkthrough + 系统控制面矩阵 + boost gate / shell loadout / sys46 / 主射 reload 专题）整理。回答三件事：

1. AI 一共分析了多少个机体。
2. 每个机体分析到了什么程度。
3. **重点**：AI 怎么理解脚本里执行的函数、以及函数和实际玩家动作（主射/副射/特射/特格/格斗/觉醒/换装/BD）之间的对应关系，含 **特格** 的完整拆解实例。

---

## 一、一共分析了多少机体

正文逐台读 `.c` 的真实 OB v27 源样本共 **13 台**（均完成 `0/1/2.c` 解包 + 反编译 + SHA-256 快照 + raw Param 对照），另有 2 个旁证样本。

| # | 机体 | Character ID | Msc hex | Param hex | action 存储形态 |
|---:|---|---:|---|---|---|
| 1 | Unicorn 独角兽 | `15001001` | `0x0B180D9E` | `0x5AE33786` | classic local selector |
| 2 | Sinanju 新安洲 | `15003001` | `0xCF8FC16A` | `0x9E74FB72` | classic local selector |
| 3 | NEXA-N 极限高达爆破 | `59001001` | `0x693F756D` | `0x38C44F75` | external Param action-table |
| 4 | Gundam AGE-FX | `33004001` | `0x605245CC` | `0x31A97FD4` | external Param action-table |
| 5 | Delta Plus | `15004001` | `0x04AD9F33` | `0x5556A52B` | classic local selector |
| 6 | Kshatriya 刹帝利 | `15002001` | `0x3724E360` | `0x66DFD978` | classic local selector |
| 7 | Hyaku Shiki 百式 | `2002001` | `0x43BB8719` | `0x1240BD01` | classic local selector |
| 8 | RX-78-2 Gundam | `1001001` | `0xF22E425D` | `0xA3D57845` | classic local selector |
| 9 | G-Self | `42001001` | `0x72CD747F` | `0x23364E67` | classic local selector |
| 10 | Mack Knife（假面） | `42002001` | `0xC33AA885` | `0x92C1929D` | classic local selector |
| 11 | Gundam Aerial 风灵 | `66001001` | `0x19CE466D` | `0x48357C75` | external Param action-table |
| 12 | Gundam Pharact | `66002001` | `0x33BAAE59` | `0x62419441` | external Param action-table |
| 13 | Darilbalde | `66003001` | `0x39DD42B7` | `0x682678AF` | external Param action-table |

旁证样本：

- **Delta Kai 改造工作副本** `0xBDBE6FEA`（1047 funcs / 29664 行）：源 FHM2D 缺失，`2.c` 含 2026-06-19 AI patch。它是所有“函数角色/可改点”文档的主样本（`ACTION_*` 名称就是在它上面标的），但不能当官方版本证据。
- **RX-78-2 legacy 1011 对照**（`G:\1. Gundam - 1011.c`）：MBON 衍生、FB 兼容、含 XB 风 Burst 改造的混合码，是唯一命中 embedded B4AC 的样本，无对应 binary/FHM2D。

### 三种 action 存储形态（早期“新=chrsysparam、旧=B4AC”二分已被推翻）

| 形态 | 台数 | 识别特征 |
|---|---:|---|
| **classic local selector** | 8（#1/2/5/6/7/8/9/10） | `chrsysparam.csyspm` 68 字节、两张 `1×1` 空表；`0.c` 145 函数；动作选择写死在 `0.c func_143`；无 `0x700000/1/2`、无 `sys_2C/2D` |
| **external Param action-table** | 5（#3/4/11/12/13） | `chrsysparam` 是 `N×128` 大表（NEXA 55、AGE-FX 72、Aerial 47、Pharact 33、Darilbalde 44 行）；`0.c` 162 函数、走 `sys_41` + `sys_0(0x700000/1/2)`；`2.c func_849` 启动时动态注册 |
| **legacy embedded B4AC** | 仅 legacy 1011 对照 | `add_B4AC()` 用 `sys_2D` 写 29×128 行内嵌表，`sys_2C` 读 |

关键证据：13 台真实样本的 `1.c` **完全相同**（6 函数 / 34 行 / 同一 SHA `24FF…452F`），是空 glue stub；5 台 external-table 机体的 `0.c` **byte-for-byte 相同**（Aerial/Pharact/Darilbalde 同 SHA `70F3…1795`），只在单位初始化钩子 `func_152` 有差异。13 台共享 **同一组 25 个固定 action handler hash**。机体差异几乎全在 `2.c` + `chrsysparam` + raw Param。

---

## 二、每台机体分析到了什么

| 机体 | 形态轴 / selector | 已读实码、已闭环到 raw Param 的部分 |
|---|---|---|
| **Unicorn** | `global143 → field 0x17 → global39` 双形态（0=Unicorn / 1=Destroy） | slot 0/1/3 loadout（slot1 1→20 发）、Beam Magnum（两形态切 bullet resource row 4/15）、两形态 CS/sub、普通特格 Beam Magnum stance、Destroy Beam Tonfa、ReZEL assist、`func_972` 格斗 CS 启 NT-D、觉醒 `0x99A7A777` 强制换装 |
| **Sinanju** | classic，`global143` 为时限 buff（非换装轴） | 主射/CS/格斗 CS Grenade/四向 Bazooka/assist 闭环；**特格=隕石蹴り** `0x200→0xD44E9701→func_1025/1027→func_1084` 触发『赤い彗星の再来』（`func_1084/1085/1086` 管状态 + characterparam `0x1B12AE7D↔0xF51CCF51` + speedparam `0xC2B19D12↔0x3548754D` 同步切换 + slot3 弹 2↔4） |
| **NEXA-N** | external，`func_849` 动态注册 | 26 个 `sys_4F` 输出全定位到 bulletparam row；group `0x13` 三向 Dagger Funnel（各 6 弹）、group `0x10` Bomber Knuckle、group `0x26` row 7/9 **前/横特殊射击 Bomber Knuckle 后方爆发特殊移动**（`func_1185` 方向 `sys_46` 急加速）；row 33 是输入显式投递的 BD 格派生 |
| **AGE-FX** | external，72×128 表 | group `0x35` 五行两组 assist（`func_977/979/980 → sys_51`，Full Glansa/Glastro/Dark Hound 候选）、group `0x1D` row 11~14 Dark Hound 四方向特殊移动（`func_917 → sys_46 → 0x9B4748FB` 命中 bullet row 69）；group `0x0C/0x1F` 待拆 |
| **Delta Plus** | classic，`global20 & 0x4000` 普通/变形分支 | 主射（4 发 + **脚本 2 连射 + 手动装填**）、CS（Unicorn summon）、N/方向 Grenade、Jesta assist、**特格 Waverider rush** `0x6AB12717/0x193FE550→func_934/938→func_888(7)+sys_46`、变形主/副/特射连 bullet row；觉醒临时切 speedparam `0x0577EF6D` |
| **Kshatriya** | classic，`global143` 普通/Besserung 复活轴 | 5→3 arms loadout、character/speed 双行切换、main/back main/8-beam CS/四向 Funnel/N+back special shot/special movement；**单位 action 区 98 个唯一 projectile literal 全命中 114-row bulletparam，0 缺失**；复活态禁用 3 个 common hash |
| **Hyaku Shiki** | classic，`global143=2` Dodai flying loadout，`global20&0x4000` 选择 transform branch | `0.c func_71/72/106/124` 进入 gate 与方向缓存、`func_450/452/464` 复用 common transform controller、`func_874/875/876` 做 Dodai entry/loop/release depiction、`func_1085` 切 flying/normal/revival arms rows、`func_1084` 释放三种 Dodai projectile、`func_1086` 复活态禁用三个 transform hash |
| **RX-78-2** | classic（无变形：3 个 transform hash 注册为 0） | 主射（8 发常时 3 秒）、N/方向 CS（BR 最大输出/Super Napalm）、N/横 Bazooka、双 assist(Guncannon+Guntank)、N/横 Hammer、Beam Javelin 三段蓄力（`global772` 阈值 → bullet row 0/14/25）、Last Shooting 多 action graph（`0x3AC14535→0x6B9EBE62→0x19F1EA82→…`，BR 段交替 row 27/2）；含 MBON legacy 1011 跨版本对比 |
| **G-Self** | classic，`global39==0/1/2/3` 四状态 | `func_1125/1127/1128/1130` 重装 slot 0..4 + characterparam + speedparam（Space/Reflector stored/deployed/Assault 候选）、CS 切入 state 3、state 3 多弹体族、`func_1146` 用 slot4 ammo 阈值维护 `global776` 4→0 资源计数选 10 个 bullet row |
| **Mack Knife** | classic，`global39==0/1` normal/Long-Range Booster | slot 1/2 loadout + speed/character 切换、Beam Vulcan/concentrated CS/Plasma Claw(10 弹)/方向 Grenade/Barara assist 候选连 `sys_4F` + bulletparam |
| **Gundam Aerial** | external，46-action 表 | `func_849` 动态注册 46 action + 三相 callback，`func_973` 141 phase-key resolver；slot-0 两弹族、slot-1 GUND-BIT 多弹体(10+1)族、slot-5 大齐射；固定 registry 26 行(23 非零+3 null) |
| **Gundam Pharact** | external，32-action 表 | `func_965` 101-case resolver；`func_1115` 左右**方向特殊移动**、`func_997` 四方向移动射击、Corax/Beakfoot 候选弹族；**82 个 literal bullet hash 全命中 93-row bulletparam**；row 32 临时超远锁定态（characterparam 距离 380→5000 后恢复）；无 assist summon |
| **Darilbalde** | external，43-action 表 | `func_967` 132-case resolver；四机 **Gusser Ishvara** deploy/manual/auto-release 状态机（`func_1119/1174` + `global955..957`）、scatter/Pellet Mine 分槽、**Daya Ambicar** 双侧 barrier proxy（`func_1167..1170` slot4 消耗 + shell detach/restore）、front special Beam Katana（row 14 group 0x25 → `func_1149`）；24 个 bullet row 已命中 |

---

## 三、AI 怎么理解“脚本函数 ↔ 实际动作”（核心）

### 3.1 三脚本分层 + 主链

```text
0.c：input / action selector / 玩法分类层（按了什么 → 选哪个 action hash）
1.c：角色侧 glue 层，13 台真实样本全是空函数
2.c：depiction / callback / 武器 / 移动 / 镜头 / shell 输出层（这个动作具体做什么）
```

classic selector 主链：

```text
0.c func_143（按 global48 输入位 / global2 方向 / 弹数 / 状态选 action hash）
  → 2.c func_1043 注册 action hash → ACTION_* callback（func_241 写 sys_1(0x10002,0x2,hash,cb)）
  → 每帧 func_4 → func_44/52 把本帧 candidate(global5/6) commit 成 active(global3/4) → 查表 sys_0(0x10002,0x2,hash) → sys_2 调度
  → ACTION_* 入口只“安装 runtime callback + 初参”
  → runtime driver（func_587 射击 / func_489 格斗 / func_502 特殊移动）
  → segment callback 才真正发射/位移/命中/切镜头（sys_4F/sys_51/sys_46/sys_53/sys_4B）
```

external-table 主链（差异）：`0.c func_143 → sys_41 → row → func_145 读 field 0x2E(action hash)/0x0A(group)`；`2.c func_849` 遍历 chrsysparam 行 `func_241(hash, func_873(group))` 动态注册，并把 `field 0x02/0x7C/0x7D` 三列注册成 per-frame/entry/cleanup 三相 callback；`func_867..870` 把 row 的 128 字段装进 `global839..912` 供 callback 消费。

**最关键认知**：`ACTION_*` 入口绝大多数**不是“实际打出去那一帧”**，只是装本动作的 runtime callback + 初参。真正的发射、位移、镜头、派生窗口在后面的 `func_9xx` segment 里。读懂一个动作必须顺着 `0.c 输入 → action hash → 2.c callback → segment → syscall/raw Param row` 一路追到底，不能凭函数名猜。

架构类比（文档原话）：`chrsysparam` ≈ data-driven action table（Unreal DataTable / Unity ScriptableObject）；`0.c` ≈ input/category adapter + action dispatcher；`2.c` 前中段 ≈ 共享 character controller/runtime；`2.c` 后段 callback ≈ 单位状态/武器/形态/表现脚本。

### 3.2 顶层函数到底在干什么（去掉丑名字）

| 函数 | 工作名 | 实际职责 | 可改性 |
|---|---|---|---|
| `main` | script_entry_and_vm_hook_installer | 挂 VM callback，先 `func_1()` 再 `callFunc3(func_4)` | D（只读） |
| `func_1` | init_depiction_runtime | 开局总初始化（清 global1..19、`func_386/272`、进 `func_877`），不是某武装 | D |
| `func_877` | init_unit_shell_resource_and_action_tables | 激活 base shell(`sys_4B`)、存 active shell id 到 `global20`、绑 slot 资源、默认 loadout、注册表 | D |
| `func_4` | main_action_update_loop | 每帧：读状态(`func_19..25`)→gate(`func_11/12/13`)→commit(`func_51/44`) | D |
| `func_11` | update_boost_cancel_gate | 脚本侧 boost/cancel gate 状态机（读 `0xc000*`，写 `global23/43/45/54`），**不是 BD 速度** | N |
| `func_1043` | register_action_hash_handlers | action hash → callback 注册表 | D |
| `func_44/52` | dispatch_primary/secondary_action_hash | 把本帧 candidate 提交成 `ACTION_*`，`func_52` 还写方向 mask `global172=global87&0x3c` | D |
| `func_219(row)` | load_action_movement_param_row | 从 `sys_0(0x60002,...)` 读动作追踪/突进参数到 `global379..393` | C |
| `func_887/888` | shell loadout 选择/分发 | 按 `global170` 恢复默认外观；`func_888(7/8)=func_1037/1038` 进/出 alternate shell | C |

一句话：`func_1043` 管“有哪些动作”，`func_44/52` 管“本帧选哪个动作”，二者合起来才是动作系统；单看 `ACTION_*` 会丢上游选择条件。

### 3.3 用户问的例子：**特格（特殊格闘）是什么函数、里面做了什么**

特格在脚本里属于 **melee / special movement** family。在主样本里它有**两种入口变体**，行为不同，必须分清：

**变体 A —— `ACTION_BC_SPECIAL_MELEE`（方向横移型，如 Delta Kai 横特）**

```text
0.c 特格+方向输入 → action hash
  → func_488   reset_melee_special_runtime（清旧 runtime）
  → global609 = func_940   装“横移 segment”
  → func_502   special_movement_phase_driver（按 global184 推进 func_503..506）
  → func_940   方向横移本体：
        读 global172 & 0x10/0x20（左/右）
        算 lateral delta → sys_46(0, global265)  （sys_46(0,v) 是按剩余时间分摊的方向/横向 delta，不是“设速度=v”）
        后段 sys_46(0x1,...) 清通道 + sys_46(0x2,...) 插值回正
```

**变体 B —— `ACTION_BC_SPECIAL_MELEE_ALT_2`（变形突进型）**

```text
0.c 特格输入 → action hash
  → func_488   reset
  → func_219(0x769a714e)   load_action_movement_param_row（突进/追踪参数）
  → global602 = func_936   装“起手 segment”
  → func_489   run_melee_phase_driver
  → func_936   起手段：func_888(0x7) 进 alternate shell + func_308 播 motion + func_531(func_937) 接后段
  → func_937   突进+收尾段：
        sys_46(0x5, 0, 0x46, 0x64)  突进 seed
        func_532(接触/前进惯性) + func_535(派生窗口范围) + func_536(派生输入 mask/时间/callback)
        func_321(0x651e4f06)  镜头 preset
        func_123(mask)  取消路线
```

每个零件职责：`func_488` 清脏数据（非改点）；`func_219(row)` 读“冲多远/追多狠”（改追踪/突进先查它）；`func_489/502` 是通用 driver（多动作共用，慎改）；`func_936/940` 才是这一招自己的本体段（改横移距离改 `func_940` 的 `0x28/0xffffffd8` 常量；改突进起步改 `func_937` 的 `sys_46(0x5,...)`）。

**具体落地（Sinanju 隕石蹴り）** —— wiki 说“特殊格闘=隕石蹴り，触发『赤い彗星の再来』”，代码里就是：

```text
0.c 特格位 0x200
  → 0xD44E9701
  → 2.c func_1025 / func_1027
  → if !func_1086()（没在强化态）&& sys_0(0x90009,4)==1（强化弹可用）:
        func_1084(1)   # global143=1；sys_1(0x60008,0xF51CCF51) 切 characterparam buff；global142=0x3548754D 切 speedparam buff 行；sys_4B(0x6,...) toggle 模型部件
        global771 = 1
  → sys_4F(0x7, slot3, 1)   # 消耗 slot3 特殊格斗弹数
结束 func_1085：恢复 global143=0 / characterparam 0x1B12AE7D / speedparam 0xC2B19D12
```

也就是说，“特格”这一个按键被拆成 **选择层（0.c 输入位 → action hash）→ 注册层（2.c callback）→ 执行层（触发强化状态 + 消耗弹数 + driver 推进突进/命中段）**。其它机体的特殊移动也同款：Pharact `func_1115`（左右方向移动，group 0x26 把 `field 0x1C` 当函数键经 `func_924→func_914→func_965` 调用）、NEXA-N `func_1185`（Bomber Knuckle 后方爆发特殊移动）、Darilbalde `func_1149`（front Beam Katana jump thrust，group 0x25 同款函数键路径）。

### 3.4 同样的拆法适用于其它动作

| 玩家动作 | 入口 `ACTION_*` | 核心执行函数 | 真正发射/效果的落点 |
|---|---|---|---|
| 主射 | `ACTION_A_SHOT` | `func_586` 清 → `func_587` driver；`global677/680/681`(起手/发射/ammo slot) | `func_915 → sys_4F(0,slot,weaponHash)` 发射、`sys_4F(0x7,slot,1)` 扣弹 |
| 副射 | `ACTION_AB_SUB` | `func_586` → `func_593` 多阶段 driver | `sys_4F` 多 phase 发射 |
| 特射/援护 | `ACTION_AC_SPECIAL_SHOT_DIRECTIONAL` | `func_488` → `func_502` driver；`global200=(global87&0x3c)?1:0` 方向分支 | `func_952 → sys_51(0x20000,0,2,index,type)` 召唤 + `sys_4F(0x7,2,1)` 扣弹 |
| 特格 | `ACTION_BC_SPECIAL_MELEE(_ALT_2)` | `func_488 → func_219 → func_489/502` | `func_936/937` 或 `func_940` + `sys_46` 移动 + `func_532/535/536` |
| N 格 | `ACTION_B_MELEE` | `func_488 → func_219(0xde3d1477) → func_489` | `func_966` 起手 → `func_967` 续段 + `func_536(mask,time,cb)` 派生窗口 + `func_239` 消费派生输入 |
| 觉醒技 | `ACTION_ABC_FINAL_ATTACK` | 多段演出 action graph | `sys_53` 镜头 / `sys_4A`/`sys_58` 特效 / `sys_4F` 发射 |
| 换装/变形 | — | `func_877 → func_887 → func_888(n)` | `sys_4B(2/3)` attach/detach、`sys_47(0x10/11/12)` rotate/translate/scale；`global143/global170` 状态 |
| BD/移动 | — | `func_11` gate + `speed_param` | 普通 BD 看 `speed_param`(boost_dash_*/step_*)；动作内位移才看 `sys_46` |

一个被反复强调的反直觉点（主射专题实证）：Delta Plus 主射“2 连射”不是弹体参数，而是 `func_914` 在动作窗口内 `func_81(0xf48d2d49,...)` **脚本自我再投递同一 action**（`global773<2` 计数封顶）；RX-78-2“常时 3 秒回弹”不是脚本动作，而是 `arms_param` 的 `reload_type=2` + `reload_per_shot_frame=180`（180/60fps=3 秒）**资源层**负责。所以“改弹药系统”和“改弹体”是不同层。

### 3.5 关键 syscall（动作真正“做事”的地方）

| syscall | 作用 |
|---|---|
| `sys_4F(0,slot,hash)` | 发射 / weapon request（弹种本体） |
| `sys_4F(0x7,slot,1)` | 主动扣弹；`sys_4F(0xB,slot,armsEntryId)` 绑定 ammo/weapon slot 资源行 |
| `sys_51(0x20000,0,2,index,type)` | 召唤援护（Pharact/Darilbalde 只有 `sys_51(0x20001,...)` 维护型，无 summon） |
| `sys_46(...)` | 动作内局部移动控制总线（391 次/样本；子命令 0x1=清通道、0=方向 delta、0x3=速度倍率、0x4=baseline、0x5=突进 seed…），**不是普通 BD** |
| `sys_4B` | active shell / attach(0x2)/detach(0x3)（挂件、换装） |
| `sys_47(0x10/0x11/0x12)` | bone rotate / translate / scale |
| `sys_53(0x4/0x5)` | 镜头 preset 开始 / 清除（只加不清会镜头残留） |
| `sys_0(0x60006,row,field)` | 读 speedparam 字段；`sys_1(0x60008,entry)` 切 characterparam（同 `0x6000*` 前缀但语义不同，不能按前缀粗暴命名） |

### 3.6 AI 的证据纪律（为什么结论可信）

- 行为结论**只引用** `.c` 文件 + 函数行号 + 注册 hash + raw Param row 字段 + syscall/resource 输出。
- **不用** generated analysis JSON、semantic overlay、resolved-label 缓存当证据（旧工作流已废弃）。
- wiki 只给“玩家可见名称候选”，必须先 `.c → syscall → raw Param row` 再贴名字；版本时间不一致时（如 Darilbalde 源 2024-08-08 vs wiki 2024-08-28 调整）wiki 数值不能反证本包帧数/弹数。
- `func_N` **不能当跨机体主键**（不同样本编号会漂移：Unicorn tail registry 是 `func_1065`、Sinanju `func_1095`、NEXA `func_1219`）。跨样本用 **semanticId + evidence shape**（读哪些 global、写哪些 global、调哪些 syscall、resource hash）重新识别。同一 action hash 也不能跨机体复名（`0xD02D6AD4` 在 Pharact=row32 临时锁定态、在 Aerial=row46 多弹体齐射；legacy 29 个 hash 与 OB 55 个 hash 交集为 0）。
- parser 字段名（reload_type/max_hp/team_cost 等）标记为 native-unverified，不能直接当玩家 UI 值。

---

## 四、来源（均已通读）

- 总览/对比：`cross-unit-msc-research-overview.md`、`cross-unit-first-batch-comparison.md`、`msc-generation-param-bridge-comparison.md`
- 函数↔action 映射（特格/N格/主射等链路最全）：`2c-function-role-map-for-modders.md`、`2c-entry-to-action-output-walkthrough.md`、`2c-function-responsibility-proof-handbook.md`、`2c-key-function-atlas-for-patching.md`、`system-control-surface-matrix.md`
- 专题：`func11-c000-boost-gate-map.md`（BD/boost gate）、`shell-loadout-func-887-888.md`（换装）、`sys46-script-parameter-atlas.md`（动作内移动）、`delta-plus-main-shot-rx78-style-auto-reload.md`（主射/连射/装填）
- 单机体证据：`units/` 下 13 台 README + `units/1001001-rx-78-2/legacy-1011-vs-ob-v27.md`
