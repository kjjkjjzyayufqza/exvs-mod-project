# `func_1044` 模拟重命名稿

本文基于 [`func1044-slot-callback-atlas.md`](./func1044-slot-callback-atlas.md)
的调用链证据，模拟 TestEditor Auto Rename 应如何重命名德尔塔 Plus
`0xBDBE6FEA/2.c` 中 `func_1044` 直接涉及的函数。

这不是原始符号恢复，也不是建议直接批量替换源文件。这里的名字是当前研究阶段的
**语义显示名**：TestEditor 应先对当前样本重新匹配证据，再把名字叠加到编辑视图。

## 相关文档

- [MSC Research 阅读入口](./README.md)
- [`func_1044` slot callback 全链路逆向](./func1044-slot-callback-atlas.md)：本稿的
  调用链与行为证据来源。
- [动态命名与 JSON overlay 方案](./dynamic-naming-overlay.md)：跨版本 semantic ID、
  generated facts、overlay 和 resolved view 的总体设计。
- [结构化分析 JSON 工作流](./generated-analysis-workflow.md)：生成当前样本事实层。
- [MSC Auto-Rename 外部文件分析](../agent-sessions/msc-workspace-redesign/auto-rename-external-file-analysis.md)：
  现有 TestEditor rename 路径与 action hash 来源限制。

## 命名原则

1. 函数名表达 callback 的职责，不把 `func_N` 当作跨版本主键。
2. `slot` 只表示 `0x10001 / group 0x2` 表项；不要把所有 callback 都叫 action。
3. 高置信名称可以直接显示；中置信名称应显示 `LIKELY` 标记；低置信名称必须保留
   `UNCONFIRMED` 和 slot 编号。
4. `sys_1` 是 native syscall，当前不尝试恢复其原始函数名。伪代码中的
   `register_depiction_slot()` 只是阅读辅助。
5. `func_1036` 注册在 group `0xA`，不属于普通 group `0x2` motion slot；不能把它
   和 `func_850..876` 混成同一类动画 callback。

## 一眼看懂的重命名结果

| 当前符号 | 模拟名称 | 注册位置 | 置信度 | 人话含义 |
|---|---|---:|---|---|
| `func_1044` | `register_depiction_slot_callbacks` | registry | 高 | 建立表现 slot callback 表，并注册一个 group `0xA` 辅助 callback。 |
| `func_849` | `slot_0x33_no_op` | `0x33` | 高（行为）/低（语义） | 当前机体为空函数；只能确认它是显式 no-op，不能推断 slot `0x33` 的通用用途。 |
| `func_850` | `slot_ground_idle_motion` | `0x01` | 高 | 地面待机表现。 |
| `func_851` | `slot_ground_walk_start_directional` | `0x02` | 高 | 按相对移动方向选择走行起步 motion。 |
| `func_852` | `slot_ground_walk_loop_directional` | `0x03` | 高 | 地面走行循环与方向 blend。 |
| `func_853` | `slot_ground_walk_stop` | `0x04` | 高 | 无方向输入后的走行停止。 |
| `func_854` | `slot_ground_boost_jump_start` | `0x05` | 中高 | 地面按 boost 后的起跳/上升前段。 |
| `func_855` | `slot_air_boost_rise_start` | `0x06` | 中高 | 空中再次按 boost 后的上升前段。 |
| `func_856` | `slot_boost_ascent_loop` | `0x07` | 中高 | boost 上升持续表现。 |
| `func_857` | `slot_air_boost_release_transition_likely` | `0x08` | 中 | 松开 boost 后、稳定下落前的空中过渡；资源原名仍未知。 |
| `func_858` | `slot_air_fall_loop` | `0x09` | 高 | 空中无其他动作时的 neutral/fall loop。 |
| `func_859` | `slot_landing_recovery` | `0x0A` | 高 | 落地硬直/恢复表现。 |
| `func_860` | `slot_0x0b_recovery_variant_unconfirmed` | `0x0B` | 低 | 播放备用恢复 motion，但当前样本没有可靠选择路径。 |
| `func_861` | `slot_step_start_directional` | `0x0D..0x10`, `0x15..0x18` | 高 | 地面/空中四方向 step 主段。 |
| `func_862` | `slot_step_recovery_directional` | `0x11..0x14`, `0x19..0x1C` | 高 | 地面/空中四方向 step 收尾。 |
| `func_863` | `slot_boost_dash_start_directional` | `0x1D` | 高 | BD 起步，按相对方向选择 motion。 |
| `func_864` | `slot_boost_dash_loop` | `0x1E` | 高 | BD 持续/循环段。 |
| `func_865` | `slot_boost_dash_end` | `0x1F` | 高 | BD 释放或减速后的收尾。 |
| `func_866` | `slot_guard_start_ground_or_air` | `0x28`, `0x2B` | 高 | 防御开始，自动选择地面或空中资源。 |
| `func_867` | `slot_guard_hold_ground_or_air` | `0x29`, `0x2C` | 高 | 防御维持循环。 |
| `func_868` | `slot_guard_release_ground_or_air` | `0x2A`, `0x2D` | 高 | 防御解除与返回基础姿势。 |
| `func_869` | `slot_guard_hit_recoil_likely` | `0x2E` | 中高 | 防御命中后的反冲或紧邻语义的 interaction reaction。 |
| `func_870` | `slot_transform_entry` | `0x23` | 高 | 切换飞机装配并播放变形进入表现。 |
| `func_871` | `slot_transform_flight_loop` | `0x24` | 高 | 飞机形态持续飞行循环。 |
| `func_872` | `slot_transform_release` | `0x25` | 高 | 解除飞机形态、恢复普通装配并进入空中下落。 |
| `func_873` | `slot_result_pose_a_normal` | `0x34` | 高 | result pose A 的普通配置。 |
| `func_874` | `slot_result_pose_a_variant` | `0x34` | 高 | result pose A 的条件变体，使用另一套装配、镜头和效果。 |
| `func_875` | `slot_result_pose_b` | `0x35` | 高 | 第二套 result pose。 |
| `func_876` | `slot_result_pose_c_unconfirmed` | `0x36` | 中高 | 第三套/特殊 result motion；尚不能断言它是否就是败北姿势。 |
| `func_186` | `get_result_pose_variant_selector` | condition | 高（局部职责） | 选择 slot `0x34` callback，并同步选择 resource index `0x4E` 的资源变体。 |
| `func_1036` | `aux_group_a_slot_2_timed_cancel_callback` | group `0x0A`, key `0x02` | 中（结构）/低（玩法名） | 播放按装配状态变化的 motion，在参数时间点开放 `0x3BF` cancel，结束后退出。 |

## 模拟重命名后的 registry

下面只模拟显示结果。`register_depiction_slot()` 和
`register_aux_depiction_callback()` 是为了读起来清楚而使用的伪 wrapper，不是已经恢复的
engine API，也不能原样交给 `msclang.py` 编译。

```c
void register_depiction_slot_callbacks()
{
    register_depiction_slot(0x01, slot_ground_idle_motion);
    register_depiction_slot(0x33, slot_0x33_no_op);
    register_depiction_slot(0x02, slot_ground_walk_start_directional);
    register_depiction_slot(0x03, slot_ground_walk_loop_directional);
    register_depiction_slot(0x04, slot_ground_walk_stop);
    register_depiction_slot(0x05, slot_ground_boost_jump_start);
    register_depiction_slot(0x06, slot_air_boost_rise_start);
    register_depiction_slot(0x07, slot_boost_ascent_loop);
    register_depiction_slot(0x08, slot_air_boost_release_transition_likely);
    register_depiction_slot(0x09, slot_air_fall_loop);
    register_depiction_slot(0x0A, slot_landing_recovery);
    register_depiction_slot(0x0B, slot_0x0b_recovery_variant_unconfirmed);

    register_depiction_slot(0x0D, slot_step_start_directional);
    register_depiction_slot(0x0F, slot_step_start_directional);
    register_depiction_slot(0x0E, slot_step_start_directional);
    register_depiction_slot(0x10, slot_step_start_directional);
    register_depiction_slot(0x11, slot_step_recovery_directional);
    register_depiction_slot(0x13, slot_step_recovery_directional);
    register_depiction_slot(0x12, slot_step_recovery_directional);
    register_depiction_slot(0x14, slot_step_recovery_directional);

    register_depiction_slot(0x15, slot_step_start_directional);
    register_depiction_slot(0x17, slot_step_start_directional);
    register_depiction_slot(0x16, slot_step_start_directional);
    register_depiction_slot(0x18, slot_step_start_directional);
    register_depiction_slot(0x19, slot_step_recovery_directional);
    register_depiction_slot(0x1B, slot_step_recovery_directional);
    register_depiction_slot(0x1A, slot_step_recovery_directional);
    register_depiction_slot(0x1C, slot_step_recovery_directional);

    register_depiction_slot(0x1D, slot_boost_dash_start_directional);
    register_depiction_slot(0x1E, slot_boost_dash_loop);
    register_depiction_slot(0x1F, slot_boost_dash_end);

    register_depiction_slot(0x28, slot_guard_start_ground_or_air);
    register_depiction_slot(0x29, slot_guard_hold_ground_or_air);
    register_depiction_slot(0x2A, slot_guard_release_ground_or_air);
    register_depiction_slot(0x2B, slot_guard_start_ground_or_air);
    register_depiction_slot(0x2C, slot_guard_hold_ground_or_air);
    register_depiction_slot(0x2D, slot_guard_release_ground_or_air);
    register_depiction_slot(0x2E, slot_guard_hit_recoil_likely);

    register_depiction_slot(0x23, slot_transform_entry);
    register_depiction_slot(0x24, slot_transform_flight_loop);
    register_depiction_slot(0x25, slot_transform_release);
    register_depiction_slot(0x26, 0);
    register_depiction_slot(0x27, 0);

    register_depiction_slot(0x36, slot_result_pose_c_unconfirmed);
    register_aux_depiction_callback(
        0x02,
        aux_group_a_slot_2_timed_cancel_callback
    );

    if (get_result_pose_variant_selector() == 0x1)
    {
        register_depiction_slot(0x34, slot_result_pose_a_variant);
    }
    else
    {
        register_depiction_slot(0x34, slot_result_pose_a_normal);
    }

    register_depiction_slot(0x35, slot_result_pose_b);
}
```

## 保留原 syscall 的可编译风格模拟

如果 TestEditor 只重命名 callback 标识符，不引入伪 wrapper，显示结果应更接近下面这样：

```c
void REGISTER_DEPICTION_SLOT_CALLBACKS()
{
    sys_1(0x10001, 0x2, 0x1, SLOT_CB_GROUND_IDLE_MOTION);
    sys_1(0x10001, 0x2, 0x33, SLOT_CB_0X33_NO_OP);
    sys_1(0x10001, 0x2, 0x2, SLOT_CB_GROUND_WALK_START_DIRECTIONAL);
    sys_1(0x10001, 0x2, 0x3, SLOT_CB_GROUND_WALK_LOOP_DIRECTIONAL);
    sys_1(0x10001, 0x2, 0x4, SLOT_CB_GROUND_WALK_STOP);
    sys_1(0x10001, 0x2, 0x5, SLOT_CB_GROUND_BOOST_JUMP_START);
    sys_1(0x10001, 0x2, 0x6, SLOT_CB_AIR_BOOST_RISE_START);
    sys_1(0x10001, 0x2, 0x7, SLOT_CB_BOOST_ASCENT_LOOP);
    sys_1(0x10001, 0x2, 0x8, SLOT_CB_AIR_BOOST_RELEASE_TRANSITION_LIKELY);
    sys_1(0x10001, 0x2, 0x9, SLOT_CB_AIR_FALL_LOOP);
    sys_1(0x10001, 0x2, 0xA, SLOT_CB_LANDING_RECOVERY);
    sys_1(0x10001, 0x2, 0xB, SLOT_CB_0X0B_RECOVERY_VARIANT_UNCONFIRMED);

    sys_1(0x10001, 0x2, 0xD, SLOT_CB_STEP_START_DIRECTIONAL);
    sys_1(0x10001, 0x2, 0xF, SLOT_CB_STEP_START_DIRECTIONAL);
    sys_1(0x10001, 0x2, 0xE, SLOT_CB_STEP_START_DIRECTIONAL);
    sys_1(0x10001, 0x2, 0x10, SLOT_CB_STEP_START_DIRECTIONAL);
    sys_1(0x10001, 0x2, 0x11, SLOT_CB_STEP_RECOVERY_DIRECTIONAL);
    sys_1(0x10001, 0x2, 0x13, SLOT_CB_STEP_RECOVERY_DIRECTIONAL);
    sys_1(0x10001, 0x2, 0x12, SLOT_CB_STEP_RECOVERY_DIRECTIONAL);
    sys_1(0x10001, 0x2, 0x14, SLOT_CB_STEP_RECOVERY_DIRECTIONAL);

    sys_1(0x10001, 0x2, 0x15, SLOT_CB_STEP_START_DIRECTIONAL);
    sys_1(0x10001, 0x2, 0x17, SLOT_CB_STEP_START_DIRECTIONAL);
    sys_1(0x10001, 0x2, 0x16, SLOT_CB_STEP_START_DIRECTIONAL);
    sys_1(0x10001, 0x2, 0x18, SLOT_CB_STEP_START_DIRECTIONAL);
    sys_1(0x10001, 0x2, 0x19, SLOT_CB_STEP_RECOVERY_DIRECTIONAL);
    sys_1(0x10001, 0x2, 0x1B, SLOT_CB_STEP_RECOVERY_DIRECTIONAL);
    sys_1(0x10001, 0x2, 0x1A, SLOT_CB_STEP_RECOVERY_DIRECTIONAL);
    sys_1(0x10001, 0x2, 0x1C, SLOT_CB_STEP_RECOVERY_DIRECTIONAL);

    sys_1(0x10001, 0x2, 0x1D, SLOT_CB_BOOST_DASH_START_DIRECTIONAL);
    sys_1(0x10001, 0x2, 0x1E, SLOT_CB_BOOST_DASH_LOOP);
    sys_1(0x10001, 0x2, 0x1F, SLOT_CB_BOOST_DASH_END);

    sys_1(0x10001, 0x2, 0x28, SLOT_CB_GUARD_START_GROUND_OR_AIR);
    sys_1(0x10001, 0x2, 0x29, SLOT_CB_GUARD_HOLD_GROUND_OR_AIR);
    sys_1(0x10001, 0x2, 0x2A, SLOT_CB_GUARD_RELEASE_GROUND_OR_AIR);
    sys_1(0x10001, 0x2, 0x2B, SLOT_CB_GUARD_START_GROUND_OR_AIR);
    sys_1(0x10001, 0x2, 0x2C, SLOT_CB_GUARD_HOLD_GROUND_OR_AIR);
    sys_1(0x10001, 0x2, 0x2D, SLOT_CB_GUARD_RELEASE_GROUND_OR_AIR);
    sys_1(0x10001, 0x2, 0x2E, SLOT_CB_GUARD_HIT_RECOIL_LIKELY);

    sys_1(0x10001, 0x2, 0x23, SLOT_CB_TRANSFORM_ENTRY);
    sys_1(0x10001, 0x2, 0x24, SLOT_CB_TRANSFORM_FLIGHT_LOOP);
    sys_1(0x10001, 0x2, 0x25, SLOT_CB_TRANSFORM_RELEASE);
    sys_1(0x10001, 0x2, 0x26, 0);
    sys_1(0x10001, 0x2, 0x27, 0);

    sys_1(0x10001, 0x2, 0x36, SLOT_CB_RESULT_POSE_C_UNCONFIRMED);
    sys_1(0x10001, 0xA, 0x2, AUX_CB_GROUP_A_SLOT_2_TIMED_CANCEL);

    if (GET_RESULT_POSE_VARIANT_SELECTOR() == 0x1)
    {
        sys_1(0x10001, 0x2, 0x34, SLOT_CB_RESULT_POSE_A_VARIANT);
    }
    else
    {
        sys_1(0x10001, 0x2, 0x34, SLOT_CB_RESULT_POSE_A_NORMAL);
    }

    sys_1(0x10001, 0x2, 0x35, SLOT_CB_RESULT_POSE_B);
}
```

这里使用全大写名称，是为了和当前 `ACTION_A_SHOT` 的 TestEditor 显示风格一致。
如果以后编辑器支持“函数定义名”和“语义标签”分开显示，则函数定义本身更适合使用
前一节的小写 `slot_*` 名称，侧栏标签再显示 `SLOT_CB_*`。

## 每个名称应如何动态匹配

Auto Rename 不能保存 `func_850 -> SLOT_CB_GROUND_IDLE_MOTION` 这种固定字典。至少应
同时验证以下证据：

| 模拟名称 | 必要匹配证据 |
|---|---|
| `REGISTER_DEPICTION_SLOT_CALLBACKS` | 大量 `sys_1(0x10001, 0x2, slot, callback)`；同时注册基础移动、step、BD、guard 和 result slot。 |
| `SLOT_CB_0X33_NO_OP` | 被 group `0x2` slot `0x33` 注册；函数体为空。这里只能命名行为，不能传播成跨机体玩法名。 |
| `SLOT_CB_GROUND_IDLE_MOTION` | slot `0x01`；首帧选择 resource index `0`；由 action hash `0x6D00AEAA` 的 handler 链进入。 |
| `SLOT_CB_GROUND_WALK_START_DIRECTIONAL` | slot `0x02`；按相对方向选择 resource `2/3/4`；由 hash `0x9CF36E1B` 进入。 |
| `SLOT_CB_GROUND_WALK_LOOP_DIRECTIONAL` | slot `0x03`；持续调用方向 blend helper；由 hash `0x868EC571` 进入。 |
| `SLOT_CB_GROUND_WALK_STOP` | slot `0x04`；resource `8`；由 hash `0xA8AB2AC9` 进入。 |
| `SLOT_CB_GROUND_BOOST_JUMP_START` | slot `0x05`；resource `0x0E`；地面 boost action hash `0x4DE2206B`。 |
| `SLOT_CB_AIR_BOOST_RISE_START` | slot `0x06`；resource `0x0F`；空中 boost action hash `0x41443BA0`。 |
| `SLOT_CB_BOOST_ASCENT_LOOP` | slot `0x07`；按来源选择 resource `0x10/0x11`；hash `0x901C3623`。 |
| `SLOT_CB_AIR_BOOST_RELEASE_TRANSITION_LIKELY` | slot `0x08`；resource `0x12`；hash `0x679F48C2`；必须保留中置信标记。 |
| `SLOT_CB_AIR_FALL_LOOP` | slot `0x09`；resource `0x13`；空中 fallback hash `0xF5F21169`。 |
| `SLOT_CB_LANDING_RECOVERY` | slot `0x0A`；resource `0x14`；上级 handler 按剩余 boost 计算落地恢复。 |
| `SLOT_CB_0X0B_RECOVERY_VARIANT_UNCONFIRMED` | slot `0x0B`；resource `0x15`；当前样本缺少可靠选择者，禁止去掉 `UNCONFIRMED`。 |
| `SLOT_CB_STEP_START_DIRECTIONAL` | 同一 callback 注册到两组各四个 slot；按空中位和方向选择 `0x16..0x19` 或 `0x1E..0x21`。 |
| `SLOT_CB_STEP_RECOVERY_DIRECTIONAL` | 同一 callback 注册到两组各四个 slot；选择 `0x1A..0x1D` 或 `0x22..0x25`。 |
| `SLOT_CB_BOOST_DASH_START_DIRECTIONAL` | slot `0x1D`；方向资源 `0x26/0x27/0x28`；hash `0x86D45295`。 |
| `SLOT_CB_BOOST_DASH_LOOP` | slot `0x1E`；从 resource `0x26` 的中段开始，再切 `0x29`；hash `0x910F3FA7`。 |
| `SLOT_CB_BOOST_DASH_END` | slot `0x1F`；resource `0x2C`；hash `0xB28C1647`。 |
| `SLOT_CB_GUARD_START_GROUND_OR_AIR` | slots `0x28/0x2B`；按空中位选择 `0x46/0x49`；guard start hash `0xDABB0543`。 |
| `SLOT_CB_GUARD_HOLD_GROUND_OR_AIR` | slots `0x29/0x2C`；循环 `0x47/0x4A`；guard hold hash `0x68790B03`。 |
| `SLOT_CB_GUARD_RELEASE_GROUND_OR_AIR` | slots `0x2A/0x2D`；资源 `0x48/0x4B`；guard release hash `0xEEE34191`。 |
| `SLOT_CB_GUARD_HIT_RECOIL_LIKELY` | slot `0x2E`；resource `0x4C`；interaction type `0x258` 经 damage/interaction dispatcher 到达。 |
| `SLOT_CB_TRANSFORM_ENTRY` | slot `0x23`；resource `0x37`；切换飞机装配；action hash `0x9475130E`。 |
| `SLOT_CB_TRANSFORM_FLIGHT_LOOP` | slot `0x24`；循环 resource `0x38`；action hash `0x77B100FF`。 |
| `SLOT_CB_TRANSFORM_RELEASE` | slot `0x25`；resource `0x3B`；恢复普通装配并转下落；action hash `0xA02D57DC`。 |
| `SLOT_CB_RESULT_POSE_A_NORMAL` | slot `0x34` 的默认分支；resource `0x4E`；普通装配与对应镜头。 |
| `SLOT_CB_RESULT_POSE_A_VARIANT` | slot `0x34` 的 selector `== 1` 分支；同一 resource index，但装配、镜头、效果不同。 |
| `SLOT_CB_RESULT_POSE_B` | slot `0x35`；resource `0x4F`；独立 result 镜头。 |
| `SLOT_CB_RESULT_POSE_C_UNCONFIRMED` | slot `0x36`；resource `0x50`；只能确认 result 族，具体标签未锁死。 |
| `GET_RESULT_POSE_VARIANT_SELECTOR` | 返回 `sys_0(0xB0004, 0x1)`；结果同时决定 slot `0x34` callback 和 resource `0x4E` hash。 |
| `AUX_CB_GROUP_A_SLOT_2_TIMED_CANCEL` | group `0x0A`, key `0x02`；按装配状态选择 motion hash；在 `func_248()*0x64` 时调用 `func_123(0x3BF)`；由统一结束判定退出。 |

## 不应自动改成的名字

以下名称看似更自然，但现有证据不足：

| 不建议名称 | 原因 |
|---|---|
| `SLOT_CB_LANDING_B` | `func_860` 没有可靠选择路径，无法证明它是第二套落地。 |
| `SLOT_CB_AIR_BRAKE` | `func_857` 的区间语义成立，但资源原名可能是 jump end、float 或其他过渡名。 |
| `SLOT_CB_GUARD_BREAK` | `func_869` 更像 guard hit recoil；尚无证据证明发生了 guard break。 |
| `SLOT_CB_LOSE_POSE` | `func_876` 属于 result 族，但尚未把 slot `0x36` 和明确的胜负枚举闭环。 |
| `SLOT_CB_TRANSFORM_ATTACK` | `func_870..872` 是形态进入、维持、解除，不是某个攻击 action。 |
| `SLOT_CB_SLOT_33_COMMON_*` | 德尔塔 Plus 的 slot `0x33` 是 no-op，但 RX-78-2 同 slot callback 非空，证明其通用玩法语义不能从当前函数体得出。 |
| `AUX_CB_RESPAWN` / `AUX_CB_WAKEUP` | group `0x0A` callback 的阶段结构可确认，但当前还没有输入或状态枚举证明其具体玩法名称。 |

## 建议的 Auto Rename 输出层级

TestEditor 最终可分三档显示：

```text
high confidence
  func_850  -> SLOT_CB_GROUND_IDLE_MOTION

medium confidence
  func_857  -> SLOT_CB_AIR_BOOST_RELEASE_TRANSITION_LIKELY

low confidence
  func_860  -> SLOT_CB_0X0B_RECOVERY_VARIANT_UNCONFIRMED
```

编辑器保存的 overlay 应使用稳定语义 ID，而不是保存上面的当前函数编号：

```json
{
  "semanticId": "depiction.slot.boostDash.startDirectional",
  "displayName": "SLOT_CB_BOOST_DASH_START_DIRECTIONAL",
  "confidence": "high",
  "match": {
    "registry": { "table": "0x10001", "group": "0x2", "slots": ["0x1d"] },
    "actionHashes": ["0x86d45295"],
    "resourceIndicesAny": ["0x26", "0x27", "0x28"],
    "requiresDirectionalBranch": true
  }
}
```

这样即使下一版 MSC 中 `func_863` 变成 `func_872`，Auto Rename 仍可依靠 registry
位置、action hash、resource index 和分支结构重新识别，而不是沿用过期的函数编号。

## 当前结论

当前样本中可以直接采用的核心名称是基础移动、step、BD、guard 和变形三段 callback。
`func_857`、`func_860`、`func_869`、`func_876`、`func_1036` 应继续携带置信度信息；
尤其不能为了让代码“看起来完整”而删除 `LIKELY` / `UNCONFIRMED`。

这份模拟稿描述的是 Auto Rename 的期望显示结果。真正实现时，应把识别规则放进
TestEditor 的 rename utility/semantic overlay 流程，不使用 `--exvsMapping`，也不直接修改
反编译器生成的稳定事实层。
