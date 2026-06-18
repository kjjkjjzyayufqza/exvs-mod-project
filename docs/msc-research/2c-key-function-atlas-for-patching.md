# 2.c 关键函数职责表：给模组 patch 用的工作名

样本：

```text
E:\XB\解包\com\file\0xBDBE6FEA\2.c
```

当前样本是 29,664 行、1,047 个函数。这页不是最终重命名表，而是给逆向者读 `2.c` 时用的“工作名 + 可改性”对照表。

命名原则：

```text
工作名只描述职责，不承诺跨版本 func_N 不变。
跨样本引用 semanticId 和证据形状。
func_N、line、offset 只用于当前样本定位。
```

## 可改性等级

| 等级 | 含义 | 模组建议 |
|---|---|---|
| A | action-local segment，通常只影响一个动作的一段 | 优先 patch |
| B | action setup 或局部 wrapper，影响一个动作 family | 可 patch，但要顺着 callback 找 segment |
| C | shared runtime/helper，多动作共用 | 谨慎，只在理解复用面后改 |
| D | registry / dispatch / loop / init | 通常只读，不为单招 patch |
| N | native / resource 边界不完整 | 先记录工作模型，不能写最终名 |

## 1. 启动、初始化、每帧主链

| 当前符号 | semanticId | 建议工作名 | 人话职责 | 证据 | 可改性 |
|---|---|---|---|---|---|
| `main` | `depiction.entryPoint` | `script_entry_and_vm_hook_installer` | 安装 VM callback，然后启动初始化和主循环 | `sys_2` 三次，先 `func_1()`，再 `callFunc3(func_4)` | D |
| `func_1` | `depiction.initializer` | `init_depiction_runtime` | 初始化当前 `2.c` 的运行时、基础 action 表、本机体 depiction 系统 | 清 `global1..19`，调用 `func_386/272/877`，写 `sys_1(0x10002,...)` | D |
| `func_386` | overlay 未细分 | `init_runtime_global_slots` | 清 runtime global family：动作、射击、格斗、移动、shell 状态槽 | 从 `func_1` 调用，写大量 runtime globals | D |
| `func_272` | overlay 未细分 | `init_aux_runtime_state` | 初始化辅助状态 | 从 `func_1` 调用，处于 `func_386` 和 `func_877` 之间 | D |
| `func_877` | `depiction.unitShellResourceInitializer` | `init_unit_shell_resource_tables` | 激活 base shell，保存 active shell id，初始化默认 loadout 和注册表 | `sys_4B(0,0xab9c3043)`、`global20=sys_4B(1)`、`global170=0`、`func_887`、`func_1042` | D |
| `func_4` | `depiction.actionUpdateLoop` | `run_action_frame_pipeline` | 每帧读 engine 状态、更新 gate、commit action | 被 `main` 用 `callFunc3` 安装；调用 `func_11/51/44` | D |
| `func_11` | `depiction.boostCancelGate` | `update_boost_cancel_gate` | 维护脚本侧 boost / cancel gate | 读 `sys_0(0xc0001/3/5/c)`，写 `global23/43/45/54` | N |

读法：

```text
如果一个函数只在 main -> func_1 这条链里出现，它大概率是初始化层。
初始化层可以解释系统怎么铺好，但不是主射、格斗、BD 的直接 patch 点。
```

## 2. 注册与 dispatch

| 当前符号 | semanticId | 建议工作名 | 人话职责 | 证据 | 可改性 |
|---|---|---|---|---|---|
| `func_1042` | `depiction.registrationCoordinator` | `register_all_unit_tables` | 汇总四张注册表 | 只调用 `func_1043/1044/1045/1046` | D |
| `func_1043` | `depiction.actionHashRegistry` | `register_action_hash_handlers` | 登记 action hash 到 callback | 55 条 `func_241(hash,callback)` | D |
| `func_241` | `depiction.actionHashBinder` | `bind_action_hash_handler` | 把一个 action hash 写进 callback 表 | `sys_1(0x10002,0x2,arg0,arg1)` | D |
| `func_44` | `depiction.primaryActionDispatch` | `dispatch_primary_action_hash` | 把 primary action hash 调度到 ACTION callback | `global5 -> global3`，查 `sys_0(0x10002,0x2,global3)`，`sys_2(0,0x2,callback)` | D |
| `func_51` | overlay 未细分 | `advance_secondary_action_channel` | 推进 secondary/cancel action channel | `global6 -> global4` 前后维护，随后进入 `func_52` | D |
| `func_52` | `depiction.secondaryActionDispatch` | `dispatch_secondary_action_hash` | 把 secondary action hash 调度到 ACTION callback，并写方向 mask | `global172=global87&0x3c`，查 `sys_0(0x10002,0x2,global4)`，`sys_2(0,0x3,callback)` | D |

模组规则：

```text
func_1043 是找动作入口的第一站。
func_44/52 是证明“action hash 怎么进入 ACTION_*”的桥。
不要为了改一招的射程、速度、镜头去改 dispatch。
```

## 3. 射击 / 主射

| 当前符号 | semanticId | 建议工作名 | 人话职责 | 证据 | 可改性 |
|---|---|---|---|---|---|
| `ACTION_A_SHOT` | `action.mainShot.setup` | `setup_main_shot_runtime` | 安装主射 runtime callback 和 ammo slot | `global677=func_914`、`global680=func_915`、`global681=0` | B |
| `func_586` | `runtime.ranged.reset` | `reset_ranged_runtime` | 清 ranged runtime family | 主射 / 副射类 ACTION 共用 | C |
| `func_587` | `runtime.ranged.driver` | `run_ranged_phase_driver` | 驱动 `global677/680` 等 ranged callback | `func_913 -> func_587()` | C |
| `func_913` | overlay 未细分 | `run_main_shot_driver_wrapper` | 主射 wrapper，进入 ranged driver | 只调用 `func_587()` | C |
| `func_914` | `action.mainShot.startupSegment` | `main_shot_startup_segment` | 主射起手、shell 恢复、弹数检查、cancel 准备 | `global170=0`、`func_887()`、`func_610(...)`、`sys_0(0x90000,0,0)` | A |
| `func_915` | `action.mainShot.fireSegment` | `main_shot_fire_segment` | 主射实际发射请求段 | `sys_0(0x90000,0,0)`、`sys_4F(0,0,0xcc9f6df0)`、`func_123(...)` | A |

怎么改：

| 目标 | 优先 patch 点 | 不优先 |
|---|---|---|
| 换主射 projectile | `func_915 -> sys_4F(0,0,0xcc9f6df0)` | `ACTION_A_SHOT` |
| 改 ammo slot | `global681`、`sys_0(0x90000,slot,0)`、`sys_4F(0,slot,hash)` 一起看 | 只改一处 slot |
| 改发射前动作 | `func_914` | `func_586` |
| 改 BDC / BRズンダ手感 | `func_123`、`func_11`、实机 boost 状态 | 只改 `sys_4F` hash |

## 4. 援护 / 特射

| 当前符号 | semanticId | 建议工作名 | 人话职责 | 证据 | 可改性 |
|---|---|---|---|---|---|
| `ACTION_AC_SPECIAL_SHOT_DIRECTIONAL` | `action.specialShotAssist.setup` | `setup_directional_special_shot_assist` | 根据方向输入安装援护 segment | `global609=func_952`，`global200=(global87&0x3c)?1:0` | B |
| `func_951` | overlay 未细分 | `run_special_shot_assist_driver_wrapper` | 进入 special movement driver | `func_951 -> func_502()` | C |
| `func_952` | `action.specialShotAssist.spawnSegment` | `spawn_directional_assist_segment` | 在指定帧召唤援护并扣弹 | `sys_51(... index,type)`，`sys_4F(0x7,0x2,1)` | A |
| `func_488` | `runtime.meleeSpecial.reset` | `reset_melee_special_runtime` | 清 melee / special runtime family | 特射、特格、格斗共用 | C |
| `func_502` | `runtime.specialMovement.driver` | `run_special_movement_driver` | 驱动 `global609` 类 segment | 特射和部分特格共用 | C |

怎么改：

| 目标 | 优先 patch 点 |
|---|---|
| 改 N 特射援护 | `func_952` 中 `global200 == 0` 分支 |
| 改方向特射援护 | `func_952` 中 `global200 == 1` 分支 |
| 改援护 type | `sys_51(... index,type)` 最后一参 |
| 改扣弹 | `sys_4F(0x7,0x2,1)` |

## 5. 格斗 / 派生

| 当前符号 | semanticId | 建议工作名 | 人话职责 | 证据 | 可改性 |
|---|---|---|---|---|---|
| `ACTION_B_MELEE` | `action.bMelee.setup` | `setup_neutral_melee_runtime` | 安装 N 格 runtime 和参数 row | `func_219(0xde3d1477)`、`global602=func_966` | B |
| `func_965` | overlay 未细分 | `run_neutral_melee_driver_wrapper` | 进入 melee driver | `func_965 -> func_489()` | C |
| `func_489` | `runtime.melee.driver` | `run_melee_phase_driver` | 驱动 `global602` 类 melee segment | N 格、部分特格 alt 共用 | C |
| `func_966` | overlay 未细分 | `neutral_melee_first_segment` | N 格第一段 motion、shell 切换、cancel 准备 | `func_308(...)`、`func_531(func_967)`、`global170=1`、`func_887()` | A |
| `func_967` | `action.bMelee.branchSegment` | `neutral_melee_branch_window_segment` | N 格后续 motion、派生窗口、取消路线 | `func_532`、`func_535`、三条 `func_536`、`func_123/125` | A |
| `func_535` | `branch.windowRangeSetter` | `set_branch_window_range` | 写派生窗口范围 | `global401/402 = arg * 0x64` | C |
| `func_536` | `branch.callbackRegistrar` | `register_branch_callback` | 登记派生输入 mask、时间、目标 callback | `global140 |= mask`，保存 time/callback | C |
| `func_239` | `branch.inputResolver` | `resolve_branch_input` | 共用派生输入消费器 | 读 `global140/global87/global49/global92`，写 `global430` | C |

怎么改：

| 目标 | 优先 patch 点 | 不优先 |
|---|---|---|
| N 格派生提前 / 推迟 | `func_967` 的 `func_536(mask,time,callback)` | `func_239` |
| 改派生开放区间 | `func_967` 的 `func_535(start,end)` | `func_489` |
| 改 N 格动作 motion | `func_966/967` 的 `func_308` hash | `ACTION_B_MELEE` |
| 改取消路线 | `func_123/125` 调用点 | dispatch |

## 6. 特格 / 特殊移动 / 动作内位移

| 当前符号 | semanticId | 建议工作名 | 人话职责 | 证据 | 可改性 |
|---|---|---|---|---|---|
| `ACTION_BC_SPECIAL_MELEE` | `action.bcSpecialMelee.setup` | `setup_bc_special_side_move` | 安装特格横移 segment 和局部 movement defaults | `global609=func_940`、`global452/453/454` | B |
| `func_939` | overlay 未细分 | `run_bc_special_side_move_driver_wrapper` | 进入 special movement driver | `func_939 -> func_502()` | C |
| `func_940` | `action.bcSpecialMelee.directionalMovementSegment` | `bc_special_side_move_segment` | 按左右方向计算横移并输出 `sys_46` | 读 `global172&0x10/0x20`，`sys_46(0,global265)`、`sys_46(0x1/0x2,...)` | A |
| `ACTION_BC_SPECIAL_MELEE_ALT_2` | overlay 间接覆盖 | `setup_bc_special_transform_rush` | 安装变形突进 runtime 和动作参数 row | `func_219(0x769a714e)`、`global602=func_936` | B |
| `func_936` | overlay 未细分 | `enter_transform_rush_shell_segment` | 进入 alternate shell，播放 motion，进入后续段 | `func_888(0x7)`、`func_308(...)`、`func_531(func_937)` | A |
| `func_937` | `action.bcSpecialMeleeAlt.transformRushSegment` | `transform_rush_movement_segment` | 变形突进移动、派生窗口、镜头 preset | `sys_46(0x5,0,0x46,0x64)`、`func_532/535/536`、`func_321(0x651e4f06)` | A |

怎么改：

| 目标 | 优先 patch 点 |
|---|---|
| 左右横移距离 | `func_940` 中左右方向常量和 `global265` 计算 |
| 横移插值 / 收尾 | `func_940` 的 `sys_46(0x1/0x2,...)` |
| 变形突进初值 | `func_937 -> sys_46(0x5,0,0x46,0x64)` |
| 特格镜头 | `func_937 -> func_321(0x651e4f06)` |
| 特格 shell | `func_936 -> func_888(0x7)`，并找恢复 |

## 7. BD / boost / 普通移动边界

| 当前符号 | semanticId | 建议工作名 | 人话职责 | 证据 | 可改性 |
|---|---|---|---|---|---|
| `func_11` | `depiction.boostCancelGate` | `update_boost_cancel_gate` | 消费 engine gate 状态，维护脚本侧 cancel / boost gate | 读 `0xc000*`，写 `global23/43/45/54` | N |
| `sys_46` | overlay 未细分 | `movement_control_bus` | 动作内 movement 控制总线 | `func_44` 清场、`func_940/937` 输出移动 | N |
| `func_296` | overlay 未细分 | `set_movement_state_switch` | movement 状态开关 wrapper | 包装 `sys_46`，常量 `0x3e8..0x3eb` | N |
| `func_298..302` | overlay 未细分 | `set_movement_speed_scale` | movement 速度 / 倍率 wrapper 候选 | 包装 `sys_46(0x3,...)` | N |
| `speed_param` resource | resource | `base_boost_step_parameter_table` | 普通 BD / step 基础性能 | `command_mapping.md` 记录 `boost_dash_*`、`step_*` | N |

不要混淆：

```text
普通 BD 基础性能 -> speed_param / native
动作能不能 BDC -> func_123/125 + func_11 gate
某一招移动距离 -> ACTION segment 的 sys_46 / func_219 / func_532
```

## 8. 镜头与 shell

| 当前符号 | semanticId | 建议工作名 | 人话职责 | 证据 | 可改性 |
|---|---|---|---|---|---|
| `func_321` | `camera.presetWrapper` | `start_camera_preset` | 包装 camera preset 启动 | `sys_53(0x4,arg0,0x4650)` | C |
| `sys_53(0x5)` | syscall | `clear_camera_preset` | 停止 / 还原 camera preset 候选 | native `sys_53` 文档确认 `0x4/0x5` 启停模式 | A |
| `func_887` | `depiction.defaultShellLoadoutSelector` | `select_default_shell_loadout` | 按 `global170` 恢复默认 shell loadout | `global170 ? func_888(1) : func_888(0)` | C |
| `func_888` | `depiction.shellLoadoutDispatcher` | `dispatch_shell_loadout_mode` | 按 mode 分发 shell 组合 / 变形进出 | 分支 `0..8`，`0x7 -> func_1037`，`0x8 -> func_1038` | C |
| `func_1037` | overlay 未细分 | `enter_alternate_shell_mode` | 进入 alternate shell mode | `func_888(0x7)` 分支调用，写 `global143=1` | B |
| `func_1038` | overlay 未细分 | `return_base_shell_mode` | 回默认 shell mode | `func_888(0x8)` 分支调用，写 `global143=0/global170=0` | B |
| `sys_4B` | syscall | `shell_entry_control_bus` | active shell、attach/detach、entry 管理 | Notion + native `sys_4B` 文档 | A |
| `sys_47(0x10/0x11/0x12)` | syscall | `edit_bone_transform` | rotate / translate / scale | Notion 记录 | A |

模组规则：

```text
镜头：找到启动点以后必须找清理点。
shell：找到进入点以后必须找恢复点。
```

## 9. 按目标查最短函数组

| 目标 | 最短函数组 | 真正 patch 点 |
|---|---|---|
| 证明 `func_1` 初始化了什么 | `main -> func_1 -> func_386/272/877 -> func_1042/1043` | 不 patch，只做系统边界 |
| 找动作入口 | `func_1043 -> func_241(hash,callback)` | registry 只用于定位 |
| 改主射弹种 | `ACTION_A_SHOT -> func_914/915` | `func_915 -> sys_4F(0,slot,hash)` |
| 改 BRズンダ / BDC | `func_915 -> func_123`，`func_11`，`speed_param` | 按目标分层 patch |
| 改援护 | `ACTION_AC_SPECIAL_SHOT_DIRECTIONAL -> func_952` | `sys_51(... index,type)` |
| 改 N 格派生 | `ACTION_B_MELEE -> func_966/967` | `func_536(mask,time,callback)` |
| 改特格横移 | `ACTION_BC_SPECIAL_MELEE -> func_940` | `sys_46` 前的方向常量 / `global265` |
| 改变形突进 | `ACTION_BC_SPECIAL_MELEE_ALT_2 -> func_936/937` | `sys_46(0x5,...)`、`func_321(hash)` |
| 改镜头 | `func_321` 调用点 + `sys_53(0x5)` 清理点 | camera hash 与清理路径 |
| 改换装组件 | `func_877 -> func_887/888 -> loadout helper` | `sys_4B(2/3,...)`、`sys_47(0x10/11/12,...)` |

## 10. 记录格式

后续讨论时建议这样写，而不是只写“`func_915 = 主射`”：

```json
{
  "current_symbol": "func_915",
  "working_name": "main_shot_fire_segment",
  "semantic_id": "action.mainShot.fireSegment",
  "layer": "segment output",
  "patchability": "A",
  "evidence": [
    "ACTION_A_SHOT writes global680 = func_915",
    "func_915 checks sys_0(0x90000,0,0)",
    "func_915 emits sys_4F(0,0,0xcc9f6df0)"
  ],
  "patch_points": [
    "weapon hash",
    "ammo slot consistency",
    "cancel mask"
  ],
  "must_test": [
    "normal shot",
    "empty ammo",
    "BR zunda",
    "overheat"
  ]
}
```

这样 offset 或 `func_N` 变了，也能靠 evidence shape 重新定位。

## 11. 还不能强命名的部分

| 区域 | 当前只能叫 | 原因 |
|---|---|---|
| `sys_46` subcmd | movement control bus / script-side movement case | native handler 还没完全拆完 |
| `sys_0(0xc000*)` | engine boost/cancel state slot | 来源在 native / engine state |
| `func_532` | approach/contact/window helper candidate | 需要 hitbox / interaction native 证据 |
| `sys_47(0x7,sys_4B(1))` | hit/contact/motion-complete candidate | 需要更多实机和 native 交叉验证 |
| projectile damage / down / proration | resource-driven hit data | 要接 `arms_param`、`bullet_param`、hitgroup |

## 来源

- [MSC 模组开发操作手册：从 29664 行 `2.c` 读到可改点](./msc-modder-operating-manual.md)
- [0xBDBE6FEA / 2.c semantic overlay 解析视图](./resolved/0xBDBE6FEA-2.resolved-labels.md)
- [当前样本 semantic overlay JSON](./overlays/0xBDBE6FEA-2.semantic-overlay.json)
- [2.c 函数角色地图：把 `func_N` 翻成人话](./2c-function-role-map-for-modders.md)
- [MSC 模组开发 worked traces：从目标到 patch 点](./modder-worked-traces.md)
- Notion MSC 页：`https://app.notion.com/p/1601ebad394d8027a042df115e61b6dd`
- OverBoost wiki システム：`https://w.atwiki.jp/exvs2ob/pages/593.html`
- OverBoost wiki テクニック：`https://w.atwiki.jp/exvs2ob/pages/683.html`
