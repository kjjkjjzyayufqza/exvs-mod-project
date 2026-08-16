# 2.c 函数角色地图：把 `func_N` 翻成人话

样本：

```text
E:\XB\解包\com\file\0xBDBE6FEA\2.c
```

当前本地样本是 29,664 行、1,047 个函数。你之前提到的 28,665 行可能来自另一次反编译或旧导出；后续讨论以当前文件为准。

这页不是最终重命名表，而是逆向和模组开发时的“角色地图”。目标是：看到一个丑名字时，先判断它属于哪一层、能不能改、改了会影响什么。

## 0. 使用方式

打开 `2.c` 时先别急着改 `func_N`。按下面顺序定位：

```text
1. 它是不是启动时只跑一次？
   -> main / func_1 / func_877 / func_1042 这一组

2. 它是不是每帧读 engine 状态？
   -> func_4 / func_19..25 / func_11

3. 它是不是把 action hash 查成 callback？
   -> func_44 / func_51 / func_52 / func_241 / func_1043

4. 它是不是 ACTION_* 入口？
   -> 通常只安装 ranged 或 melee runtime，不一定是实际发射 / 命中帧

5. 它是不是 runtime segment？
   -> 找 motion、sys_4F、sys_46、sys_53、func_532/535/536

6. 它是不是 shell / 表现恢复？
   -> global170/global143/func_887/func_888/sys_4B/sys_47
```

工作名建议写成：

```text
当前函数: func_44
工作名: dispatch_primary_action_hash
证据: reads global5, writes global3, clears movement channels, sys_0(0x10002), sys_2(...)
置信度: high
跨样本主键: action-dispatch shape, not func_44
```

## 1. 顶层生命周期函数

| 当前符号 | 建议工作名 | 角色 | 证据 | 模组开发时怎么用 |
|---|---|---|---|---|
| `main` | `script_entry_and_vm_callback_install` | 入口 | `sys_2(...func_3/26/27)`，然后 `func_1`，最后 `callFunc3(func_4)` | 确认脚本入口，不作为普通改点 |
| `func_1` | `init_depiction_script_runtime` | 总初始化 | 清 `global1..19`，调 `func_386/272/877`，注册基础 action handler | 判断哪些系统是开局铺好的，不要当武装动作改 |
| `func_3` | `run_top_level_frame_callbacks` | 每帧 callback runner | 调 `global1/global2` 指针和周边维护函数 | 看 shell / depiction 每帧维护 |
| `func_4` | `main_action_update_loop` | 主 action loop | 读输入、更新 gate、commit action | 大多数动作流程从这里进入 |
| `func_26` | `boost_gate_edge_callback` | boost / gate 边沿 callback | 读取 `global43/global45` 边沿 | 查进入 / 退出 boost gate 副作用 |
| `func_27` | `end_of_frame_state_snapshot` | 帧尾状态同步 | 保存上一帧状态、导出状态 | 查上一帧 / 本帧差异 |

人话：

- `main` 负责挂钩。
- `func_1` 负责开局初始化。
- `func_4` 负责每帧动作流程。
- `func_26/27` 是状态边沿和帧尾同步，不是具体武装。

## 2. 初始化子系统

| 当前符号 | 建议工作名 | 角色 | 证据 | 改动风险 |
|---|---|---|---|---|
| `func_61` / `func_62` | `init_action_cancel_gate_defaults` | action / cancel gate 初值 | 从 `func_1` 早期调用 | 中，影响全局动作门 |
| `func_272` | `init_aux_runtime_state` | 辅助状态初始化 | 从 `func_1` 调用，清另一批状态 | 中，未完全拆清 |
| `func_386` | `init_runtime_global_slots` | 大量 runtime global 默认值 | 清 `global20`、action 状态、ranged/melee slot、movement slot | 高，不建议随便改 |
| `func_835` / `func_836` | `init_unit_specific_resources` | 样本特有资源初始化 | 从 `func_1` 进入，靠近 depiction init | 中，需要结合资源表 |
| `func_18` | `register_initial_resource_hashes` | 初始 resource hash 注册 | 写 `0x10001,0x8` 组 | 中，改资源需验证 |
| `func_877` | `init_unit_shell_and_resource_tables` | active shell、resource slot、action tables | `sys_4B(0,...)`、`global20=sys_4B(1)`、`sys_4F(0xb,...)`、`func_887`、`func_1042` | 中到高，影响整机 |
| `func_1042` | `register_all_depiction_tables` | 注册协调器 | 调 `func_1043/1044/1045/1046` | 低到中，通常只读 |
| `func_1043` | `register_action_hash_handlers` | action hash 表 | 大量 `func_241(hash, callback)` | 低，适合查动作入口 |
| `func_1044` | `register_slot_callbacks` | slot callback 表 | `sys_1(0x10001,0x2,slot,func)` | 中，需知道 slot 语义 |
| `func_1045` | `register_stance_resource_hashes` | stance / motion resource 表 | group `0x3/0x4` resource hash | 中，改 motion / stance 时查 |
| `func_1046` | `register_extra_effect_resources` | extra resource / effect 表 | group `0xb` hash | 中，改表现时查 |

判断初始化函数的规则：

```text
从 func_1 或 func_877 只在启动阶段调用
大量写 sys_1 注册表
大量清 global
不直接等待玩家输入
不直接按时间点发射 / 位移 / 命中
```

## 3. 输入、状态和 action candidate

| 当前符号 | 建议工作名 | 角色 | 关键读写 | 备注 |
|---|---|---|---|---|
| `func_19` | `read_frame_inputs_and_runtime_state` | 读本帧状态入口 | 调 `func_20` 等 | `func_4` 最早调用 |
| `func_20` | `read_engine_action_state_bundle` | 状态读取聚合 | 调 `func_21/22/23/24/25` | 把 engine 暴露的状态读进 globals |
| `func_21` | `read_direction_and_action_masks` | 方向 / mask 快照 | `global87=sys_0(0x10000,0,0x7)`、`global48=sys_0(...0x8)` | `global87 & 0x3c` 后续变方向 mask |
| `func_22` | `read_weapon_slot_state` | weapon slot 状态 | `sys_0(0x90002,slot)`、`sys_4F(0xd,slot,1)` | ammo / charge / weapon slot 辅助状态 |
| `func_23` | `read_depiction_status_flags` | 表现 / gauge 状态 | `sys_55(...)`、`sys_4F(0x13)` | 与表现或特殊状态有关 |
| `func_24` | `read_primary_action_candidate` | primary action | `global5=sys_0(0x10000,0,0x10)` | 后续 `func_44` commit |
| `func_25` | `read_secondary_action_candidate` | secondary / route action | `global6=sys_0(0x10000,0,0x11)`、`global67/52/50` | 后续 `func_51/52` commit |

人话：

- `2.c` 不直接判断“玩家按了 A”。它读 `sys_0(0x10000,...)`，也就是 engine / 上游脚本已经整理好的 action/state。
- `global5` 和 `global6` 不是同一个东西。`global5` 更像 primary action candidate；`global6` 更像 route / secondary / interrupt action candidate。

## 4. action 分发和注册

| 当前符号 | 建议工作名 | 角色 | 证据 | 模组开发用途 |
|---|---|---|---|---|
| `func_44` | `dispatch_primary_action_hash` | primary action commit | `global3=global5`，清 `sys_46(0x1,...)`，`sys_0(0x10002,0x2,global3)`，`sys_2(0,0x2,callback)` | 看 primary action 如何进 `ACTION_*` |
| `func_51` | `advance_secondary_action_channel` | secondary action advance | `global4=global6` 前后状态维护，调 `func_52` | 看 cancel / route action 是否进入 |
| `func_52` | `dispatch_secondary_action_hash` | secondary action commit | `global172=global87&0x3c`，查 `0x10002` 表，`sys_2(0,0x3,callback)` | 看方向输入如何带进派生 / 方向动作 |
| `func_241` | `bind_action_hash_handler` | action hash -> callback 注册 helper | `sys_1(0x10002,0x2,arg0,arg1)` | 查动作入口的核心 |
| `func_81` | `queue_followup_action_hash` | 后续 action / cancel route enqueue 候选 | 写 action hash 和 route 参数 | 改动作接续时查 |

最关键的一句：

```text
func_1043 负责注册 ACTION_*。
func_44/52 负责把本帧 action hash 调度成 ACTION_*。
```

这两处合起来才是“动作系统”，单独看 `ACTION_*` 会丢掉上游选择条件。

## 5. ACTION 入口角色表

| 当前符号 | 玩家侧语义 | runtime family | 入口动作 | 主要后续 |
|---|---|---|---|---|
| `ACTION_A_SHOT` | 主射候选 | ranged | `func_586()`，写 `global677/680/681` | `func_913 -> func_587` |
| `ACTION_A_SHOT_STATE_0` | 主射状态 0 候选 | ranged | 主射变体 | 查 `global676..681` |
| `ACTION_CHARGE_SHOT_LOCK_SWITCH` | 蓄力射击换锁候选 | ranged / lock switch | charge shot 分支 | 查 `sys_4F` / lock metadata |
| `ACTION_AB_SUB` | 副射候选 | ranged | `func_586()`，多 phase callback | `func_593` family |
| `ACTION_AB_SUB_DIRECTIONAL` | 方向副射候选 | ranged | direction variant | `sys_4F` 发射 |
| `ACTION_AC_SPECIAL_SHOT_DIRECTIONAL` | 特射 / 援护候选 | special / assist | `func_488()`，`global609` | `func_502`，`sys_51` |
| `ACTION_BC_SPECIAL_MELEE_ALT_2` | 特格 / 特殊移动候选 | melee / special movement | `func_488()`、`func_219(0x769a714e)`、`global602=func_936` | `func_489`、`func_936/937` |
| `ACTION_BC_SPECIAL_MELEE` | 特格另一入口 | melee / special movement | `func_488()`、`global609=func_940` | `func_502` family |
| `ACTION_B_MELEE` | N 格候选 | melee | `func_488()`、`func_219(0xde3d1477)`、`global602=func_966` | `func_489`、`func_966/967` |
| `ACTION_B_MELEE_DIR_1` | 方向格斗候选 | melee | 方向格斗 setup | 查 `global172/global175` 和 segment |
| `ACTION_B_MELEE_DIR_2` | 方向格斗候选 | melee | 方向格斗 setup | 查 motion / branch window |
| `ACTION_B_MELEE_DIR_4` | 方向格斗候选 | melee | 方向格斗 setup | 查 motion / branch window |
| `ACTION_B_MELEE_VARIANT` | 格斗派生候选 | melee | 派生 action | 查 `func_536` 注册关系 |
| `ACTION_ABC_FINAL_ATTACK` | 觉醒技候选 | final attack | 演出 / 多段 action | 查 `sys_53`、`sys_4A`、`sys_4F`、`sys_58` |

规则：

- `ACTION_*` 多数不是“实际打出去的那一帧”。
- 它更像“安装本动作的 runtime callback + 初始参数”。
- 真正发射、位移、镜头、派生窗口通常在后续 `func_9xx` segment 里。

## 6. ranged / shooting runtime

| 当前符号 / global | 建议工作名 | 角色 | 证据 | 常见改动 |
|---|---|---|---|---|
| `func_586` | `reset_ranged_runtime` | 清射击 runtime | `ACTION_A/AB` 入口常先调 | 不作为普通改点 |
| `func_587` | `run_simple_ranged_runtime` | 简单射击 driver | 主射 `func_913` 调它 | 查 phase callback 何时执行 |
| `func_593` | `run_multi_phase_ranged_runtime` | 旧版 / 正常班多阶段射击 driver | 副射/特射写 `676/677/678/679` | 查 start/shoot/no_ammo/end |
| `global676` | `ranged_start_callback` | start | `func_593` 第一段 | 改起手 motion |
| `global677` | `ranged_shoot_callback` | shoot（有弹） | start 结束后 `sys_0(0x90000,slot)!=0` | 改开火 / `sys_4F(0,...)` |
| `global678` | `ranged_no_ammo_callback` | 没子弹分支 | start 结束后槽空才进；**不是 cancel** | 改空弹段 / 常伴 `sys_4F(0x12,...)` |
| `global679` | `ranged_end_callback` | end | shoot 或 no_ammo 之后 | 改收尾 |
| `global680` | `ranged_fire_callback` | `func_587` 新版主射的 fire 槽 | 主射写 `func_915` | 不要和 `func_593` 的 `677` 混用 |
| `global681` | `ranged_ammo_slot` | ammo slot | 主射 `0`，副射常 `1` | 改 slot 时必须全链一致 |
| `sys_4F(0,slot,hash)` | `request_weapon_fire` | 发射 / weapon request | Notion 与项目 sys_4F 文档 | 改弹种 |
| `sys_4F(0x7,slot,1)` | `consume_ammo_slot` | 主动扣弹 | Notion 记录 | 改扣弹 |
| `sys_0(0x90000,slot,0)` | `check_ammo_slot` | ammo / weapon 可用检查 | 主射起手读 | 防止空弹发射 |

改主射时最小链：

```text
func_1043
  -> ACTION_A_SHOT
  -> func_586
  -> global677 = func_914
  -> global680 = func_915
  -> global681 = 0
  -> func_587 driver
  -> sys_0(0x90000,0,0)
  -> sys_4F(0,0,weaponHash)
  -> func_123(cancelMask)
```

## 7. melee / special movement runtime

| 当前符号 / global | 建议工作名 | 角色 | 证据 | 常见改动 |
|---|---|---|---|---|
| `func_488` | `reset_melee_special_runtime` | 清格斗 / 特殊移动 runtime | 格斗、特格、特射入口常先调 | 不作为普通改点 |
| `func_489` | `run_melee_runtime` | 普通格斗 / 一部分特格 driver | `ACTION_B_MELEE`、`ACTION_BC_SPECIAL_MELEE_ALT_2` 使用 | 查突进、命中、阶段 |
| `func_502` | `run_special_movement_runtime` | 特殊移动 / 特射类 driver | `ACTION_AC_SPECIAL_SHOT_DIRECTIONAL`、部分特格 | 查特殊移动和援护 |
| `func_219(row)` | `load_action_movement_param_row` | 读取动作参数 row | 从 `0x60002` 读入 `global379..393` | 改追踪、突进前先查 |
| `global602` | `melee_segment0_callback` | melee 起手段 callback | N 格写 `func_966` | 改第一段 |
| `global608` | `melee_segment_alt_callback` | 备用 segment callback | 部分格斗写 | 查派生 |
| `global609` | `special_segment_callback` | special movement callback | 特射 / 特格另一入口写 | 改特殊移动 |
| `global610` | `special_end_callback` | special end callback | 部分动作写 | 改收尾 |
| `func_532` | `setup_melee_contact_or_approach_window` | 接近 / 命中 / 前进惯性候选 | Notion 记录“近战击中后前进惯性？” | 改突进 / 接近窗口 |
| `func_535` | `setup_branch_window_param` | 派生窗口参数候选 | 和 `func_536` 成组 | 改窗口基础参数 |
| `func_536(mask,time,callback)` | `register_branch_window_callback` | 登记派生 / 输入窗口 | N 格多次调用 | 改派生时间和方向 |
| `func_239` | `consume_branch_window_input` | 消费派生输入候选 | cookbook 已记录 | 查派生为什么触发 |

改 N 格时最小链：

```text
func_1043
  -> ACTION_B_MELEE
  -> func_488
  -> func_219(0xde3d1477)
  -> global602 = func_966
  -> func_489 driver
  -> func_966 起手 motion / shell / cancel
  -> func_967 后续 motion / func_532 / func_535 / func_536
```

改特格 / 特殊移动时最小链：

```text
func_1043
  -> ACTION_BC_SPECIAL_MELEE_ALT_2
  -> func_488
  -> func_219(0x769a714e)
  -> global602 = func_936
  -> func_489 driver
  -> func_936 shell + motion + effects
  -> func_937 sys_46 + func_532/535/536 + camera
```

## 8. movement / BD / gate 角色

| 当前符号 / global | 建议工作名 | 角色 | 证据 | 模组开发用途 |
|---|---|---|---|---|
| `func_11` | `update_boost_cancel_gate` | 全局 boost / cancel gate | 主循环 commit 前调用，密集读 `sys_0(0xc000*)` | 查动作能否进入 / 退出 gate |
| `global23` | `boost_cancel_gate_state` | gate state | `0/1/2` 状态切换 | 判断 gate active |
| `global43` | `boost_cancel_gate_enter_edge` | 进入边沿 | `func_11` 置 1，`func_26` 读 | 查进入瞬间 |
| `global45` | `boost_cancel_gate_exit_edge` | 退出边沿 | `func_11` 置 1，`func_26` 读 | 查退出瞬间 |
| `global46` | `boost_cancel_forced_reentry_latch` | 强制重入 latch | `func_11` 入口条件读取 | 查特殊状态强制 gate |
| `global54` | `movement_bonus_gate_edge` | movement bonus edge 候选 | `sys_0(0xc000c)` 控制 | 查特殊移动 bonus |
| `sys_0(0xc000*)` | `engine_boost_cancel_state_slots` | engine gate 状态槽 | `func_11` 消费侧证据 | native 名称仍需验证 |
| `sys_46(...)` | `movement_control_bus` | 动作局部移动控制总线 | 样本 391 次，subcmd 多 | 改动作位移 / 速度 |
| `func_296` | `set_movement_state_switch` | movement 状态开关 wrapper | `0x3e8/0x3e9/0x3ea/0x3eb` 分发 | 查动作进入特殊移动状态 |
| `func_298..302` | `set_movement_speed_scale` | 速度倍率 wrapper | 包 `sys_46(0x3,...)` | 查隐藏的速度倍率 |

玩家语义和脚本语义不要混：

```text
玩家侧 BD:
  跳键二连，高速移动，可取消多数动作，消耗 boost

2.c 侧:
  不直接判定跳键二连
  读 engine 的 action/gate 状态
  用 func_11 管 gate
  用 ACTION segment 内 sys_46 / func_532 控某个动作的移动
```

改动建议：

| 目标 | 优先入口 |
|---|---|
| 普通 BD 燃费 / 次数 / 基础速度 | native / resource / `speed_param` |
| 某动作可否 BD cancel | `func_123(mask)`、route action、`func_11` |
| 某特格冲多远 | `ACTION_BC_* -> func_219(row) -> sys_46 / func_532` |
| 某格斗追踪强度 | `func_219(row)`、`func_489`、`func_532/535` |

## 9. motion / camera / shell / effect

| 当前符号 / syscall | 建议工作名 | 角色 | 证据 | 常见改动 |
|---|---|---|---|---|
| `func_79` | `play_stance_resource_motion` | 从 stance group 取 motion 并播放 | 读 `sys_0(0x10001,0x3+global170,...)` | 改 stance resource motion |
| `func_308` | `play_motion_on_active_shell` | 播放 motion | 大量 `func_308(global20,motionHash,...)` | 改动作 motion |
| `func_309` | `motion_time_reached` | 判断 motion 时间线 | `if (func_309(global20,time))` | 改发射 / 派生 / 特效帧 |
| `func_610` | `setup_ranged_motion` | 射击起手 motion setup | 主射起手用 | 改射击动作 |
| `func_321` | `play_camera_preset` | camera preset wrapper | `sys_53(0x4,arg0,0x4650)` | 改镜头 |
| `sys_53(0x5)` | `clear_camera_preset` | 清 camera | 多处动作结束 / 打断 | 防镜头残留 |
| `func_887` | `select_default_shell_loadout` | 按 `global170` 恢复默认 shell | `global170 ? func_888(1) : func_888(0)` | 动作结束恢复外观 |
| `func_888` | `dispatch_shell_loadout_mode` | shell loadout dispatcher | `arg0` 分发 `0..8` | 改组件组合 |
| `func_1037` | `enter_alternate_shell_mode` | 进入大模式 / 变形候选 | `func_888(0x7)` 调，写 `global143=1` | 特格 / 变形外观 |
| `func_1038` | `return_base_shell_mode` | 回默认 shell mode | `func_888(0x8)` 调，写 `global143=0`、`global170=0` | 恢复默认外观 |
| `sys_4B` | `attach_detach_shell_model` | attach / detach / active shell | Notion: `0x2` 接模型，`0x3` 解除 | 改挂件 |
| `sys_47(0x10/0x11/0x12)` | `edit_model_bone_transform` | bone rotate / translate / scale | Notion 记录 | 改部件位置和大小 |
| `sys_4A` / `sys_58` | `effect_and_aleo_control` | 特效 / aleo / 表现 | Notion 与样本动作段大量使用 | 改表现 |

镜头和 shell 的共同规则：

```text
有进入点就必须找恢复点。
只加镜头不清，会残留。
只切 shell 不恢复，会动作结束后外观错误。
```

## 10. global 家族速查

| global 家族 | 建议角色 | 典型读写方 | 用途 |
|---|---|---|---|
| `global1/global2` | top-level frame callbacks | `func_1`、`func_3`、`func_877` | 每帧维护函数指针 |
| `global3/global5` | primary active / candidate action | `func_24`、`func_44` | 当前主动作 |
| `global4/global6` | secondary active / candidate action | `func_25`、`func_51/52` | route / cancel / secondary 动作 |
| `global20` | active shell entry id | `func_877`、motion / `sys_47` helpers | active model / motion target |
| `global23/43/45/46/54` | boost / cancel gate state | `func_11`、`func_26` | BD / cancel gate 脚本侧状态 |
| `global48/49/87/172/200` | input / direction state | `func_21`、`func_52`、方向动作 | 前后左右、是否按方向 |
| `global143` | alternate shell mode flag | `func_1037/1038`、shell branches | 变形 / 大模式外观 |
| `global170` | stance resource group selector | `func_877/887`、`func_79/308` | motion resource group 和默认外观 |
| `global379..393` | action movement param row | `func_219`、`func_489/502` | 格斗 / 特殊移动参数 |
| `global602/608/609/610` | melee / special segment callbacks | `ACTION_B*`、`func_489/502` | 格斗和特殊移动段 |
| `global676..681` | ranged runtime callbacks / ammo slot | `ACTION_A/AB`、`func_587/593` | 射击阶段和弹药槽 |

## 11. 从目标反推应先给哪些函数起名

### 我要改主射

先命名这组：

```text
func_1043 = register_action_hash_handlers
ACTION_A_SHOT = setup_main_shot_runtime
func_586 = reset_ranged_runtime
func_913 = run_main_shot_driver_wrapper
func_914 = main_shot_start_segment
func_915 = main_shot_fire_segment_candidate
global681 = ranged_ammo_slot
```

再找：

```text
sys_0(0x90000,0,0)
sys_4F(0,0,weaponHash)
sys_4F(0x7,0,1)
func_123(cancelMask)
```

### 我要改特射援护

先命名这组：

```text
ACTION_AC_SPECIAL_SHOT_DIRECTIONAL = setup_directional_assist_action
func_488 = reset_melee_special_runtime
func_502 = run_special_movement_runtime
global200 = has_direction_input
sys_51 = summon_assist
sys_4F(0x7,slot,1) = consume_ammo_slot
```

验证 N / 方向两种分支，因为 `global200` 和 `global172` 可能改变援护 type。

### 我要改特格突进

先命名这组：

```text
ACTION_BC_SPECIAL_MELEE_ALT_2 = setup_bc_special_movement_alt
func_219 = load_action_movement_param_row
func_489 = run_melee_runtime
func_936 = bc_special_enter_shell_motion_segment
func_937 = bc_special_movement_followup_segment
func_888 = dispatch_shell_loadout_mode
sys_46 = movement_control_bus
func_532/535/536 = contact_and_branch_window_helpers
```

同时查：

```text
func_296(0x3e8/0x3e9,...)
func_123(cancelMask)
func_321(cameraHash)
```

### 我要改 N 格

先命名这组：

```text
ACTION_B_MELEE = setup_neutral_melee_action
func_488 = reset_melee_special_runtime
func_219 = load_action_movement_param_row
func_489 = run_melee_runtime
func_966 = neutral_melee_first_segment
func_967 = neutral_melee_followup_segment
func_536 = register_branch_window_callback
```

查重点：

```text
func_308 motion hash
func_532 approach/contact
func_536 branch masks
func_123 cancel mask
func_125 state mask
```

### 我要改 BD / 移动

先命名这组：

```text
func_11 = update_boost_cancel_gate
global23 = boost_cancel_gate_state
func_219 = load_action_movement_param_row
func_296 = set_movement_state_switch
func_298..302 = set_movement_speed_scale
sys_46 = movement_control_bus
```

再分清：

```text
普通 BD 基础性能 -> native / resource / speed_param
动作内位移 -> ACTION segment 的 sys_46 / func_532
取消是否允许 -> func_123 / func_11 / route action
```

### 我要改镜头

先命名这组：

```text
func_321 = play_camera_preset
sys_53(0x4,hash,...) = start_camera_preset
sys_53(0x5) = clear_camera_preset
func_309 = motion_time_reached
```

同时必须找清理路径：

```text
动作自然结束
命中后切段
空挥
被打断
BD cancel
死亡 / 复归
```

### 我要改换装 / 组件

先命名这组：

```text
func_877 = init_unit_shell_and_resource_tables
func_887 = select_default_shell_loadout
func_888 = dispatch_shell_loadout_mode
func_1037 = enter_alternate_shell_mode
func_1038 = return_base_shell_mode
global170 = stance_resource_group_selector
global143 = alternate_shell_mode_flag
sys_4B = attach_detach_shell_model
sys_47 = edit_model_bone_transform
```

验证：

```text
动作进场
动作结束
动作取消
被打断
死亡复归
切换到其他 action
```

## 12. 置信度边界

| 项 | 当前状态 | 不要过度命名成 |
|---|---|---|
| `func_1` | high，初始化证据完整 | 单个武装初始化 |
| `func_44/52` | high，action hash dispatch 证据完整 | 原始输入处理 |
| `func_11` | medium-high，脚本侧 gate 明确 | 最终 BD 函数 |
| `sys_46` | medium，脚本侧 movement bus 明确 | 已知所有 native case 的移动函数 |
| `func_532/535/536` | medium，接近 / 派生窗口证据强 | 最终 hitbox / damage 函数 |
| `sys_4F(0,slot,hash)` | high，射击 / weapon request | 所有 projectile 行为本体 |
| `sys_51` | high，援护召唤 | 援护 AI 全部逻辑 |
| `func_887/888` | high，shell loadout | 高层 action 入口 |

命名原则：

```text
high: 可以写成明确工作名
medium: 名字里保留 gate / candidate / helper / bus
low: 只做索引，等更多样本或 native 证据
```

## 13. 和动态 overlay 的关系

这页给人读。跨样本时不要套旧 `func_N`；直接读新 `.c` 的 registry、callback shape 和 syscall/resource 输出。

人工讨论可以写：

```text
func_44 = dispatch_primary_action_hash
```

overlay 里应该写：

```text
semanticId: depiction.dispatchPrimaryActionHash
match:
  reads current primary candidate global
  writes active primary action global
  clears movement channels via sys_46(0x1,...)
  fetches sys_0(0x10002,0x2,actionHash)
  schedules sys_2(0,0x2,callback)
```

这样下一份样本 `func_44` 变成 `func_52` 或别的编号时，仍能按形状重新识别。

## 14. 来源和相关页

- 当前样本：`E:\XB\解包\com\file\0xBDBE6FEA\2.c`
- [2.c 逐帧生命周期：从玩家动作到 MSC 输出](./2c-frame-lifecycle-human-trace.md)
- [MSC 调用链快速决策树：从问题到可改点](./modding-decision-tree-system-cards.md)
- 跨样本命名原则：以当前 `.c` 证据为准，`func_N` 只当本样本坐标。
- [MSC 模组开发 cookbook：按改动目标反查 `2.c`](./modding-cookbook-action-editing.md)
- Notion MSC 页：`https://app.notion.com/p/1601ebad394d8027a042df115e61b6dd`
