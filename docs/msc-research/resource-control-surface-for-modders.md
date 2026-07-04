# MSC 资源层 patch 指南：BD / step / boost / 射击 / 格斗该改哪些表

这页回答一个模组开发里很实际的问题：

```text
我已经知道 0.c 负责选 action，2.c 负责输出表现；
那普通 BD、step、boost、弹速、伤害、hitbox、格斗追踪这些东西，到底改脚本还是改资源？
```

结论：

```text
普通基础性能优先改资源表。
单个动作的特殊位移、镜头、挂件、发射时机优先改 2.c segment。
能不能按出来、空弹、OH、cancel gate 先看 0.c / 2.c gate。
```

## 1. 三层边界

| 层 | 代表文件 / 函数 | 负责什么 | 适合改什么 |
|---|---|---|---|
| input / action selector | `0.c func_2`、`0.c func_143`、`0.c func_95` | 读取输入和状态，选出 action hash | 按不按得出来、方向分支、空弹分支 |
| depiction script output | `2.c func_1043`、`ACTION_*`、segment、`sys_4F/51/46/53` | 动作表现、发射、援护、动作内移动、镜头、shell | 单招弹体、援护 index、特格横移、镜头、组件 |
| resource / param | `command_mapping.md` 的 `speed_param`、`arms_param`、`bullet_param`、`character_param`、`commandlist` | 基础机动、武装参数、弹体参数、角色全局倍率 | 普通 BD/step、boost、伤害、弹速、hitbox、追踪 |

人话：

```text
0.c 决定“能不能进入这个动作”。
2.c 决定“这个动作执行时请求什么表现”。
资源表决定“这个机体/武装/弹体的基础数值是多少”。
```

## 2. 快速决策表

| 目标 | 第一入口 | 第二入口 | 不要先碰 |
|---|---|---|---|
| 普通 BD 更远 | `speed_param.boost_dash_distance`、`boost_dash_duration_frame`、`boost_dash_distance_max` | `character_param.boost_dash_speed_rate` | 某个特格 `sys_46` |
| 普通 BD 更快 | `speed_param.boost_dash_initial_speed`、`boost_dash_sustained_speed`、`boost_dash_max_speed` | `character_param.boost_dash_speed_rate` | `2.c func_44` |
| BD 次数 / boost 量更多 | `speed_param.boost_gauge_capacity`、`boost_dash_count`、`boost_consumption_base` | `character_param.boost_gauge_max`、`boost_recovery_speed` | 主射脚本 |
| step 更远 / 更快 | `speed_param.step_distance`、`step_speed`、`fixed_step_distance` | `character_param.step_speed_rate` | 特格 segment |
| step 窗口 / 硬直 | `speed_param.step_cancel_frame`、`step_recovery_frame` | `character_param.step_tracking_angle_*` | `sys_4F` |
| 落地硬直 | `speed_param.landing_recovery_frame` | `character_param.landing_recovery_rate` | 主循环 `func_4` |
| 主射伤害 | `arms_param.damage` 或 `character_param.main_shot_damage` | `2.c func_915` 只定位 weapon hash | 只改 action hash |
| 主射弹速 | `bullet_param.speed_internal`、`speed_scale`、`arms_param.bullet_speed_rate` | `arms_param.range` | ammo slot |
| 弹体 hitbox | 普通弹体可先看 `bullet_param` 旧标签字段；长模型/特殊 task 必须追 native collision handler | `91000003` 已证明要走 `CShellCollision` 多球方向 | 只凭 `hitbox_width/height/depth` |
| 弹数 / reload | `arms_param.ammo_count`、`reload_time_total`、`reload_type`、`reload_per_shot_frame` | `0.c func_143` 空弹分支、`2.c sys_4F(0x7)` | 只改 `sys_4F(0,...)` |
| 援护类型 | `2.c sys_51(index,type)` | `arms_param` / assist resource | `speed_param` |
| 格斗伤害 | `character_param.melee_damage`、`special_melee_damage`、相关 damage multiplier | hit handler / hitgroup 仍需深化 | `func_536` |
| 格斗追踪 | `character_param.melee_tracking_angle`、`front_tracking_angle`、`rear_tracking_angle` | `2.c func_219(row)`、动作内 `sys_46` | `arms_param` |
| 格斗派生时间 | `2.c func_535/536` | motion timeline | damage 资源 |
| 特格横移距离 | `2.c func_940` 的方向常量和 `sys_46` | `speed_param` 只在要改全机动时看 | `character_param.main_shot_damage` |
| 镜头 | `2.c func_321` / `sys_53(0x4)` | camera/native preset | `arms_param` |

## 3. 普通 BD / step / boost：优先 `speed_param`

来源：`docs/command_mapping.md` 的 `speed_param (041cpm, cmd=74, entry_size=304)`。

### 3.1 BD 常用字段

| 字段 | Hash | Offset | 用途 |
|---|---|---:|---|
| `boost_gauge_capacity` | `0x0B9EBECE` | `0x00C` | boost gauge 上限 |
| `boost_recovery_delay_frame` | `0x0CF37AD7` | `0x010` | boost 开始恢复前延迟 |
| `boost_recovery_speed` | `0x0D5BB2EF` | `0x014` | boost 恢复速度 |
| `boost_dash_initial_speed` | `0x11FFDDB4` | `0x01C` | BD 初速 |
| `boost_dash_sustained_speed` | `0x2EAE942B` | `0x038` | BD 持续速度 |
| `boost_dash_startup_frame` | `0x4031CB84` | `0x048` | BD 起始帧 |
| `boost_dash_recovery_frame` | `0x41DABEC5` | `0x04C` | BD 恢复帧 |
| `boost_dash_distance` | `0x5481CCF4` | `0x060` | BD 基础距离 |
| `boost_dash_type` | `0x5EF705B7` | `0x070` | BD 行为类型 |
| `boost_consumption_base` | `0x7CD3A712` | `0x098` | boost 消耗基准 |
| `boost_dash_max_speed` | `0x7D79F6FA` | `0x09C` | BD 最高速 |
| `boost_dash_duration_frame` | `0xA49287B9` | `0x0CC` | BD 持续帧 |
| `boost_dash_count` | `0xE590DFE2` | `0x100` | BD 次数上限 |
| `boost_dash_distance_max` | `0xFEC6069F` | `0x128` | BD 最大距离 |

### 3.2 step 常用字段

| 字段 | Hash | Offset | 用途 |
|---|---|---:|---|
| `step_distance` | `0x17A9D82D` | `0x020` | step 位移距离 |
| `step_startup_frame` | `0x2DF7AF95` | `0x034` | step 起始帧 |
| `step_speed` | `0x4D601E55` | `0x058` | step 速度 |
| `step_recovery_frame` | `0x4F705BAD` | `0x05C` | step 恢复 |
| `step_type` | `0x58313EF7` | `0x068` | step 类型 |
| `step_cancel_frame` | `0x97BE8DFC` | `0x0BC` | step cancel 窗口 |
| `fixed_step_distance` | `0xA7CBBC07` | `0x0D4` | 固定 step 距离 |
| `guard_step_type` | `0xCF452D59` | `0x0EC` | guard step 类型 |

### 3.3 角色全局倍率

来源：`character_param`。

| 字段 | Hash | Offset | 用途 |
|---|---|---:|---|
| `boost_gauge_pct` | `0x01F15731` | `0x008` | boost gauge 百分比 |
| `boost_gauge_max` | `0x080AF70C` | `0x018` | boost gauge 最大值 |
| `boost_recovery_speed` | `0x0911077E` | `0x02C` | boost 恢复速度 |
| `movement_speed_base` | `0x14F89980` | `0x044` | 基础移动速度 |
| `boost_dash_speed_rate` | `0x22169CCE` | `0x080` | BD 速度倍率 |
| `landing_recovery_rate` | `0x25384033` | `0x090` | 落地硬直倍率 |
| `step_speed_rate` | `0x26BC945D` | `0x098` | step 速度倍率 |
| `step_cancel_count` | `0xB5FDC339` | `0x22C` | step cancel 限制 |
| `boost_gauge_initial` | `0xB7D5327E` | `0x230` | 初始 boost |

模组建议：

```text
只想改普通 BD / step 基础手感：优先 speed_param。
想改全局角色倍率：再看 character_param。
想改某个动作里的横移 / 突进：回到 2.c ACTION segment。
```

必测：

- 地面 BD、空中 BD、BD 次数、OH 后落地。
- 前后左右 step、step cancel、绿锁 / 红锁。
- 普通移动、跳、落地硬直。
- 主射 BDC 和格斗 step cancel 是否异常。

## 4. 射击 / 弹体：`2.c` 定位 hash，资源表改数值

脚本链：

```text
0.c func_143
  -> func_95(0xf48d2d49,...)

2.c func_1043
  -> ACTION_A_SHOT

2.c ACTION_A_SHOT
  -> global680 = func_915
  -> global681 = 0

2.c func_915
  -> sys_4F(0, 0, 0xcc9f6df0)
```

读法：

```text
2.c func_915 告诉你主射请求哪个 weapon hash。
真正的伤害、reload、弹速、hitbox，多数在 arms_param / bullet_param。
```

### 4.1 `arms_param` 常用字段

来源：`arms_param (041cpm, cmd=48, entry_size=200)`。

| 字段 | Hash | Offset | 用途 |
|---|---|---:|---|
| `is_enabled` | `0x020A35DD` | `0x000` | 武装启用 |
| `is_continuous_fire` | `0x0496C136` | `0x008` | 连射 flag |
| `reload_start_frame` | `0x04A2CFD6` | `0x00C` | reload 开始帧 |
| `reload_time_total` | `0x103171AE` | `0x010` | reload 总时间 |
| `reload_type` | `0x11DEE0C8` | `0x014` | reload 类型 |
| `ammo_count` | `0x4961274C` | `0x030` | 弹数 |
| `damage` | `0x4C84F7C0` | `0x040` | 基础伤害 |
| `down_value` | `0x4E692ACD` | `0x048` | down 值 |
| `startup_frame` | `0x73A5FF40` | `0x058` | 发生 |
| `active_frame` | `0x74C83B59` | `0x05C` | 有效帧 |
| `recovery_frame` | `0x89382014` | `0x060` | 后摇 |
| `boost_consumption_rate` | `0xA2CF099B` | `0x070` | boost 消耗 |
| `range` | `0xA353F222` | `0x074` | 有效距离 |
| `bullet_type` | `0xBB93D195` | `0x098` | 弹体类型 |
| `bullet_speed_rate` | `0xD5C8390D` | `0x0A0` | 弹速倍率 |
| `bullet_count_per_shot` | `0xF8AEEC77` | `0x0BC` | 每次发射弹数 |
| `firing_interval_frame` | `0xF8E59F33` | `0x0C0` | 连射间隔 |

### 4.2 `bullet_param` 常用字段

来源：`bullet_param (041cpm, cmd=80, entry_size=320)`。

注意：这里的 `hitbox_*` 是旧 parser 标签。对 Gyan Suibaku/custom
`91000003`，IDA 已证明其中至少宽/高字段被当作角度/姿态输入消费，不是
长船物理碰撞体积控制；长模型碰撞要追 native `CShellCollision`。

| 字段 | Hash | Offset | 用途 |
|---|---|---:|---|
| `max_range` | `0x05D5D30D` | `0x004` | 最大射程 |
| `move_type` | `0x06E90346` | `0x008` | 弹体移动类型 |
| `hitbox_width` | `0x13662C98` | `0x014` | 旧标签；Suibaku 路径不是已证明碰撞宽 |
| `hitbox_height` | `0x138B3675` | `0x018` | 旧标签；Suibaku 路径不是已证明碰撞高 |
| `hitbox_depth` | `0x13C6C469` | `0x01C` | 旧标签；特殊 projectile 需追 native consumer |
| `homing_range` | `0x20FEDE31` | `0x024` | 诱导距离 |
| `visual_scale` | `0x28BA5665` | `0x028` | 视觉大小 |
| `spawn_offset_forward` | `0x2F446A4F` | `0x030` | 前向生成位置 |
| `lifetime` | `0x32ACABFB` | `0x038` | 存活帧 |
| `homing_type` | `0x3CDF1516` | `0x04C` | 诱导类型 |
| `bullet_effect_hash` | `0x41435BE6` | `0x050` | 弹体特效 |
| `pierce_count` | `0x4B492895` | `0x060` | 贯通次数 |
| `acceleration_value` | `0x4C55EA3D` | `0x064` | 加速度 |
| `bullet_action_hash` | `0x4D6BF281` | `0x068` | 弹体 runtime action |
| `speed_internal` | `0x6481E0F7` | `0x084` | 内部速度 |
| `homing_duration` | `0x67921CDD` | `0x08C` | 诱导持续 |
| `delay_frame` | `0x6A62D65E` | `0x094` | 生成延迟 |
| `gravity_rate` | `0x74F469FA` | `0x098` | 重力 |
| `speed_scale` | `0x7696F452` | `0x09C` | 速度倍率 |

模组建议：

| 目标 | 先改 |
|---|---|
| 主射换弹体 | `2.c sys_4F(0,slot,weaponHash)` |
| 主射伤害 | `arms_param.damage`，再看 `character_param.main_shot_damage` |
| 主射弹速 | `bullet_param.speed_internal/speed_scale`，再看 `arms_param.bullet_speed_rate` |
| 主射 hitbox | 普通弹体可先看 `bullet_param` 旧标签字段；先确认 native consumer |
| 主射 reload | `arms_param.reload_*` 和 `ammo_count` |
| 主射空弹分支 | `0.c func_143` 的 `sys_0(0x90000,0)` |
| 主射扣弹 | `2.c sys_4F(0x7,slot,1)`，如果存在 |

必测：

- 命中、盾、防御、绿锁、红锁。
- BDC 后再射。
- 空弹、reload、觉醒、OH。
- 弹体是否穿模、是否过大、是否多段异常。

## 5. 格斗：资源改数值，脚本改窗口和动作段

脚本链：

```text
0.c func_143
  -> func_95(0x178d1109,...)

2.c func_1043
  -> ACTION_B_MELEE

2.c ACTION_B_MELEE
  -> func_219(0xde3d1477)
  -> global602 = func_966
  -> func_489 driver

2.c func_967
  -> func_532 / func_535 / func_536
```

读法：

```text
格斗“进哪个动作、什么时间能派生”在脚本。
格斗“基础伤害、追踪角、全局倍率”在 character_param 等资源。
hitbox / proration 的最终 native 链还没完全硬命名。
```

### 5.1 `character_param` 格斗 / damage 相关字段

| 字段 | Hash | Offset | 用途 |
|---|---|---:|---|
| `melee_damage` | `0x333722B6` | `0x0CC` | 基础格斗伤害 |
| `special_melee_damage` | `0x2DA8874F` | `0x0B8` | 特格 / 特殊格斗伤害 |
| `melee_tracking_angle` | `0x379D0C45` | `0x0D4` | 格斗追踪角 |
| `front_tracking_angle` | `0x08218288` | `0x01C` | 前方追踪角 |
| `rear_tracking_angle` | `0x08A0ADE8` | `0x024` | 后方追踪角 |
| `melee_combo_limit` | `0x2CF49283` | `0x0B4` | 格斗 combo 限制 |
| `melee_damage_correction_rate` | `0xF15C6A7F` | `0x2F4` | 格斗补正倍率 |
| `damage_proration_rate` | `0xE9F462F6` | `0x2DC` | 伤害 proration |
| `down_value_per_hit` | `0xE3E5D41D` | `0x2C4` | 每 hit down 值 |
| `down_value_threshold` | `0x1C936B77` | `0x068` | down 阈值 |

### 5.2 脚本侧仍要改的东西

| 目标 | 脚本入口 |
|---|---|
| 换格斗 motion | `2.c func_966/967` 的 `func_308` |
| 改派生时间 | `func_535(start,end)`、`func_536(mask,time,callback)` |
| 改派生去向 | `func_536` 的 callback |
| 改动作内突进 | `func_532`、动作内 `sys_46`、`func_219(row)` |
| 改 shell / 外观变化 | `global170`、`func_887/888` |

必测：

- 命中、空挥、绿锁、红锁。
- 早按、晚按、连打派生。
- step cancel、BDC、OH、被打断。
- combo damage、down、补正、盾。

## 6. `commandlist`：把玩家语义对回动作类别

来源：`commandlist`。

| `command_type` | English | 输入 |
|---:|---|---|
| `1` | Main Shot | A |
| `2` | Melee | B |
| `3` | Sub Weapon | A+B |
| `4` | Special Shot | A+C |
| `5` | Special Melee | B+C |
| `6` | Burst Attack | A+B+C |
| `7` | Charge Shot | charge shot |
| `8` | Charge Melee | charge melee |

它的用途：

```text
commandlist 帮你把玩家语义和资源条目分类；
0.c func_143 帮你看输入如何选 action hash；
2.c func_1043 帮你看 action hash 进入哪个 ACTION_*；
2.c segment / resource 表决定真正改点。
```

## 7. 典型工作流

### 7.1 改普通 BD 更远

不要从 `2.c func_940` 开始。

```text
1. 找 speed_param 当前机体条目。
2. 小幅调整 boost_dash_distance / boost_dash_duration_frame / boost_dash_distance_max。
3. 如果只是速度不够，再看 boost_dash_initial_speed / sustained_speed / max_speed。
4. 如果 boost 不够，再看 boost_gauge_capacity / boost_dash_count / boost_consumption_base。
5. 实机测普通 BD、step、OH、落地、主射 BDC。
```

失败判断：

- 只有特格变化：改错层，改到了 action-local `sys_46`。
- 所有动作 cancel 变怪：可能碰到了 `func_11` gate 或 `dash_cancel_type`。
- 普通 BD 变强但 OH/落地异常：检查 boost 消耗和落地参数。

### 7.2 改主射弹速和 hitbox

```text
1. 用 0.c func_143 确认主射 action hash：0xf48d2d49。
2. 用 2.c func_1043 确认进入 ACTION_A_SHOT。
3. 用 2.c func_915 确认 weapon hash：sys_4F(0,0,0xcc9f6df0)。
4. 在 arms_param 查对应 weapon entry，改 damage / ammo / reload / bullet_speed_rate。
5. 在 bullet_param 查弹体 entry，普通弹体可先改 speed_internal / speed_scale；hitbox 字段必须先确认 native consumer。
6. 实机测命中、盾、BDC、空弹、reload、绿锁、红锁。
```

失败判断：

- 单发正常但 BDC 异常：回到 `func_123` / `func_11`。
- 弹数 UI 异常：回到 `arms_param.ammo_count`、`0.c func_143` 空弹检查、`2.c sys_4F(0x7)`。
- 弹体太大或多段异常：回到 native hit handler、`bullet_param` 旧 hitbox 标签和 hit interval 一起验证。

### 7.3 改特格横移更远

不要先改 `speed_param`，除非目标是全机体移动。

```text
1. 用 0.c func_143 看特格方向分支：
   - 左右方向 -> 0x193fe550 -> ACTION_BC_SPECIAL_MELEE
   - 其他 -> 0x6ab12717 -> ACTION_BC_SPECIAL_MELEE_ALT_2
2. 打开 2.c ACTION_BC_SPECIAL_MELEE。
3. 追到 global609 = func_940。
4. 在 func_940 看 global172 & 0x10/0x20 的方向常量和 sys_46(0,global265)。
5. 小幅改方向常量或持续衰减参数。
6. 实机测 N/前/后/左/右、红锁/绿锁、OH、BDC、被打断。
```

失败判断：

- 普通 BD 也变了：改到了资源或全局 gate。
- 只有左右一侧异常：方向 bit 或 sign 改错。
- 动作结束速度残留：需要检查 `sys_46(0x1/0x2,...)` 收尾。

### 7.4 改 N 格派生更早

```text
1. 0.c func_143 -> 0x178d1109。
2. 2.c func_1043 -> ACTION_B_MELEE。
3. ACTION_B_MELEE -> func_219(0xde3d1477) + global602 = func_966。
4. func_966 -> func_531(func_967)。
5. func_967 -> func_535 / func_536。
6. 改 func_536 的 time 或 callback。
7. 实机测命中、空挥、早按、晚按、连打、step cancel。
```

如果目标是伤害，不从 `func_536` 改，回到 `character_param.melee_damage` 或 native hit/resource 链。

## 8. 当前硬边界

| 区域 | 现在能指导什么 | 还不能硬写什么 |
|---|---|---|
| 普通 BD / step | `speed_param` 和 `character_param` 的主要字段 | native movement handler 的最终字段名 |
| 动作内移动 | `2.c sys_46` callsite 的 patch 层 | `sys_46` 每个 case 的最终 native 语义 |
| 射击弹体 | `sys_4F` 定位 weapon hash，`arms/bullet` 改数值 | weapon hash 到所有子资源的完整自动解析 |
| 格斗伤害/判定 | `character_param` 和脚本窗口入口 | hitbox / proration / hit handler 的完整 native 链 |
| action 能不能进 | `0.c func_143` 和 `func_95` | `global48` 每一位到物理按键的最终 native 名 |

## 9. 交叉引用

- input/action 边界：[0c-to-2c-input-action-boundary.md](./0c-to-2c-input-action-boundary.md)
- `2.c` 源码走读：[2c-source-proof-walkthrough-for-modders.md](./2c-source-proof-walkthrough-for-modders.md)
- 系统控制面矩阵：[system-control-surface-matrix.md](./system-control-surface-matrix.md)
- BD / 移动工作簿：[movement-bd-modding-workbook.md](./movement-bd-modding-workbook.md)
- `sys_46` 参数地图：[sys46-script-parameter-atlas.md](./sys46-script-parameter-atlas.md)
- 资源字段总表：[../command_mapping.md](../command_mapping.md)
