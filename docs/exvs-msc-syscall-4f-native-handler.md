# EXVS MSC Syscall 4F Native Handler Notes

## 概述

这份文档记录当前针对 `sys_4F` native handler 的进一步分析结果。

建议配合以下文档一起阅读：

- `docs/exvs-msc-analysis.md`
- `docs/exvs-msc-syscall-4f-notes.md`
- `docs/exvs-msc-input-action-weapon-pipeline.md`

本文件的重点不是解释 MSC 本身，而是回答下面几个更具体的问题：

- `sys_4F` 在 native 层最可能对应哪个函数
- 为什么此前把 `sub_14067F620` 当作 `sys_4F` handler 是不够严谨的
- 当前最强证据为什么指向 `sub_140684F00`
- `sys_4F` 支持哪些子命令
- 每个子命令当前能恢复到什么程度

## 关键修正

此前有一个阶段性判断：

- 把 `CDepictionScript` 构造过程中设置的 `a1[79] = sub_14067F620`
- 直接理解成 “`sys_4F (79)` -> `sub_14067F620`”

这个判断后来证明 **不够严谨**。

原因是：

- `CMotionScriptAbstract` 基类在构造时已经把三个基础 handler 放在：
  - `+0x20`
  - `+0x28`
  - `+0x30`
- 这三个位置非常强烈地对应 `sys_0 / sys_1 / sys_2`

也就是说，handler table 很可能不是从 `a1[0]` 开始按 syscall id 直接映射，而是：

- 从 `a1[4]` 开始对应 `sys_0`

如果这个模型成立，那么：

- `syscall_id = slot_index - 4`

于是：

- `slot 82 -> syscall 78 -> sys_4E`
- `slot 83 -> syscall 79 -> sys_4F`
- `slot 84 -> syscall 80 -> sys_50`
- `slot 85 -> syscall 81 -> sys_51`

这会把真正的 `sys_4F` handler 指向：

- `sub_140684F00`

而不是：

- `sub_14067F620`

## 为什么这个映射模型可信

### 1. 基类位置和 `sys_0 / sys_1 / sys_2` 高度吻合

在 `CMotionScriptAbstract` 初始化中，已经能看到三项早期 handler：

- `+0x20` 位置对应 `sub_1406915E0`
- `+0x28` 位置对应 `sub_140694730`
- `+0x30` 位置对应 `sub_140694640`

而此前分析已经显示：

- `sub_140694730` 明确处理 `0x10000 / 0x10001 / 0x10002 / 0x10004`
- 这和脚本里的 `sys_1(...)` 使用模式高度一致

这说明：

- handler table 起始位置很可能确实不是对象开头
- `sys_0` 并不落在 `a1[0]`

### 2. `sys_51` 的脚本行为和 `sub_1406856A0` 明确对上

脚本中存在这种调用：

- `sys_51(0x20001, 0x8)`

而当前 candidate `sub_1406856A0` 的行为非常关键：

- 它切换的是 `0x20000` 和 `0x20001`
- 这与脚本侧 `sys_51` 的参数模式高度一致

如果使用：

- `slot 85 -> sys_51`

那么整个映射就能自然闭合：

- `slot 85 = sub_1406856A0`
- `sys_51 = sub_1406856A0`

于是同一区间里的：

- `slot 83 = sub_140684F00`

就自然对应：

- `sys_4F`

### 3. 整个 `0x4A ~ 0x51` 家族都落在 `CDepictionScript`

`CDepictionScript` 构造函数 `sub_140664F70` 中会安装一整段连续 handler：

- `slot 78 = sub_14067E060`
- `slot 79 = sub_14067F620`
- `slot 80 = sub_140682A30`
- `slot 81 = sub_1406836C0`
- `slot 82 = sub_1406840C0`
- `slot 83 = sub_140684F00`
- `slot 84 = sub_140683420`
- `slot 85 = sub_1406856A0`

如果换算成 syscall id：

- `slot 78 -> sys_4A`
- `slot 79 -> sys_4B`
- `slot 80 -> sys_4C`
- `slot 81 -> sys_4D`
- `slot 82 -> sys_4E`
- `slot 83 -> sys_4F`
- `slot 84 -> sys_50`
- `slot 85 -> sys_51`

这正好与脚本里经常成组出现的：

- `sys_4A`
- `sys_4B`
- `sys_4C`
- `sys_4E`
- `sys_4F`
- `sys_50`
- `sys_51`

形成一个完整 family。

## 当前最强结论

基于上述三条证据，当前最强、最一致的结论是：

- `sys_4F` 的 native handler 当前最可能是 `sub_140684F00`

当前不再优先把：

- `sub_14067F620`

当作 `sys_4F`

而更应该把它理解为：

- 同一 family 中更靠前的其他 syscall（大概率是 `sys_4B`）的处理器

## `sys_4F` 所属子系统

`sys_4F` 所在 handler family 明确落在：

- `VDK::GAM::CDepictionScript`

而且在邻近函数中还能看到大量与：

- `VDK::GAM::CShellAbstract *`

相关的 lambda 和调度逻辑。

因此，当前对 `sys_4F` 子系统的判断已经比较明确：

- 它属于 **depiction / shell / presentation** 这一层
- 它更像是“表现层对象控制接口”
- 它不是底层通用数学、文件或物理接口

换句话说，`sys_4F` 更像是在操纵：

- 表现对象
- 画面层元素
- 壳层对象
- 演出/过场/切入相关的图形条目
- UI / overlay / shell entry / depiction entry

## `sys_4F` 的总体形态

`sub_140684F00` 的函数签名表现为：

- 一个标准的 syscall handler
- 接收：
  - 脚本对象
  - 上下文对象
  - 参数个数 `argc`
  - 参数数组 `a4`

它内部是：

- `switch (*a4)`

也就是：

- 用第一个用户参数作为 `sys_4F` 的子命令号

当前已确认它支持：

- `0x00` 到 `0x19`

总计 26 个子命令。

## `sys_4F` 子命令表

下面的表格分成三类内容：

- **Confirmed**：可以直接从 native 行为看出来的
- **High confidence**：语义虽然没有官方名，但基本可以确定用途方向
- **Tentative**：只能做方向性判断

### `subcmd 0x00`

- 参数形态：
  - `arg1`: entry/group id
  - `arg2`: hashed resource / object id
  - `arg3`: optional bool
  - `arg4`: optional u32
- native 行为：
  - 调用 `sub_1405DEBD0(v7, arg1, arg2, bool, extra)`
- 结论：
  - **High confidence**
  - 用于向 `depiction` 管理器中创建/绑定/激活一个按 hash 标识的 entry

### `subcmd 0x01`

- 参数形态：
  - `arg1`: slot / entry id
  - `arg2`: mode-like value
  - `arg3`: optional bool
  - `arg4`: optional float-like int
  - `arg5`: optional packed flags
- native 行为：
  - 取 `manager[slot].entry` 对应对象
  - 组织一段 0x20 配置结构
  - 将 `arg2`、若干布尔位、以及 `arg5` 解包后的 flags 一起写入
  - 最终调用 `sub_1405BD300`
- 结论：
  - **High confidence**
  - 这不是简单的“播放一个表现”
  - 它更像是“给指定 slot 安装/刷新一组配置”
  - 目前非常像防御槽位、反射槽位、或武装表现槽位的配置入口

### `subcmd 0x02`

- 参数形态：
  - `arg1`: entry id
- native 行为：
  - `sub_1405BC5A0(entry)`
- 结论：
  - **Tentative**
  - 很像 stop / clear / disable 当前 entry

### `subcmd 0x03`

- 参数形态：
  - `arg1`: entry id
- native 行为：
  - `sub_1405BD410(entry)`
- 结论：
  - **Tentative**
  - 很像另一个生命周期控制动作，可能是 pause / detach / rewind

### `subcmd 0x04`

- 参数形态：
  - `arg1`: entry id
- native 行为：
  - `sub_1405BC690(entry)`
- 结论：
  - **Tentative**
  - 很像 resume / finalize / another state transition

### `subcmd 0x05`

- 参数形态：
  - `arg1`: entry id
- native 行为：
  - `sub_1405DEC60(manager, arg1)`
- 结论：
  - **High confidence**
  - 对 manager 级对象按 id 做删除/注销/移除

### `subcmd 0x06`

- 参数形态：
  - 无额外必要参数
- native 行为：
  - `sub_1405DEBF0(manager)`
- 结论：
  - **High confidence**
  - manager 级别的全局清空/重置/停止

### `subcmd 0x07`

- 参数形态：
  - `arg1`: entry id
  - `arg2`: optional bool
- native 行为：
  - `sub_1405BC170(entry, bool)`
- 结论：
  - **Tentative**
  - 某个 entry flag 的开关，可能是 visible / active / enable

### `subcmd 0x08`

- 参数形态：
  - `arg1`: entry id
  - `arg2`: optional bool
- native 行为：
  - `sub_1405BC070(entry, bool)`
- 结论：
  - **Tentative**
  - 另一个 entry flag 的开关

### `subcmd 0x09`

- 参数形态：
  - `arg1`: entry id
  - `arg2`: int
- native 行为：
  - `sub_1405BC7F0(arg2)`
  - 然后 `sub_1405BC170(entry, 0)`
- 结论：
  - **Tentative**
  - 很像带参数的切换/刷新/切帧操作

### `subcmd 0x0A`

- 参数形态：
  - `arg1`: entry id
- native 行为：
  - `sub_1405BC040(entry)`
- 结论：
  - **Tentative**
  - 看起来像 reset/update 一类动作

### `subcmd 0x0B`

- 参数形态：
  - `arg1`: entry id
  - `arg2`: int
  - `arg4`: optional mode mapped by `sub_140684EC0()`
- native 行为：
  - 调用 `sub_1405DE3E0(..., mode, ..., variant=0)`
- 结论：
  - **High confidence**
  - 某种“带模式映射”的 entry 配置动作

### `subcmd 0x0C`

- 参数形态：
  - 与 `0x0B` 类似
- native 行为：
  - 调用 `sub_1405DE3E0(..., mode, ..., variant=1)`
- 结论：
  - **High confidence**
  - 与 `0x0B` 成对的另一种配置动作

### `subcmd 0x0D`

- 参数形态：
  - `arg1`: entry id
  - `arg2`: bool
- native 行为：
  - `entry[319] = bool`
- 结论：
  - **Confirmed**
  - 这是一个显式的布尔 flag 设置接口
- 脚本侧证据：
  - `sys_4F(0xD, 0, 0x1);`
  - `sys_4F(0xD, global96, 0);`
- 方向判断：
  - 很像 enable / disable slot

### `subcmd 0x0E`

- 参数形态：
  - `arg1`: entry id
- native 行为：
  - `sub_1405BD140(entry)`
- 结论：
  - **Tentative**
  - 单 entry 状态动作

### `subcmd 0x0F`

- 参数形态：
  - `arg1`: entry id
- native 行为：
  - `sub_1405BD2B0(entry)`
- 结论：
  - **Tentative**
  - 单 entry 状态动作

### `subcmd 0x10`

- 参数形态：
  - `arg1`: entry id
- native 行为：
  - `sub_1405BC060(entry)`
- 结论：
  - **Tentative**
  - 单 entry 状态动作

### `subcmd 0x11`

- 参数形态：
  - `arg1`: entry id
  - `arg2`: bool
- native 行为：
  - `sub_140684E70(entry, bool)`
  - 该 helper 会在值变化时调用 `sub_1405BC040(entry, bool)` 并同步 byte `320`
- 结论：
  - **Confirmed**
  - 又一个显式布尔开关，并且变化时会触发附加行为

### `subcmd 0x12`

- 参数形态：
  - `arg1`: entry id
- native 行为：
  - `sub_1405BCEB0(entry)`
  - 同时在某些模式下设置 bitset 标记
- 结论：
  - **High confidence**
  - 单 entry 的 release / stop / end 生命周期动作
- 脚本侧证据：
  - `sys_4F(0x12, global682);`
- 脚本侧补充（2026-08-17，Rebellion N 特射墙黏照射）：
  - 开火若在 slot `0x5`，必须 `sys_4F(0x12, 0x5)`，只 release ammo 槽 `global681` 停不掉。
  - 照射已经打在墙上之后，**只 `0x12` 往往还留着活梁**。回收段真正收口要再加 `sys_4E(0)`，而且必须在任何 yaw / 切段之前。
  - 详细顺序与失败案例见 `docs/msc-research/alt2-gerobi-stop-and-followup.md`。

### `subcmd 0x13`

- 参数形态：
  - 无必须额外参数
- native 行为：
  - `sub_1405DED00(manager)`
  - 对 manager 中所有 336-byte entry 执行 `sub_1405BD0C0`
- 结论：
  - **Confirmed**
  - manager 级的全局 reset / stop / clear
- 脚本侧证据：
  - `sys_4F(0x13);`

### `subcmd 0x14`

- 参数形态：
  - `arg1`: bool-like
- native 行为：
  - 若 `arg1 != 0`，将某个“当前值”传给 `sub_1405DEEE0`
  - 否则传 `-1`
  - `sub_1405DEEE0` 会对 manager 全体 entry 应用一组状态映射
- 结论：
  - **High confidence**
  - manager 级“按当前上下文切换模式/状态”的接口
- 脚本侧证据：
  - `sys_4F(0x14, 0x1);`
  - `sys_4F(0x14, 0);`

### `subcmd 0x15`

- 参数形态：
  - `arg1`: entry id
  - `arg2`: bool
  - `arg3`: optional indirection selector
- native 行为：
  - 写入 byte `318`
- 结论：
  - **Confirmed**
  - 另一个显式布尔 flag 开关

### `subcmd 0x16`

- 参数形态：
  - `arg1`: entry id
  - `arg2`: bool
- native 行为：
  - 写入 byte `322`
- 结论：
  - **Confirmed**
  - 显式布尔 flag 开关

### `subcmd 0x17`

- 参数形态：
  - `arg1`: entry id
  - `arg2`: bool
- native 行为：
  - 写入 byte `323`
- 结论：
  - **Confirmed**
  - 显式布尔 flag 开关

### `subcmd 0x18`

- 参数形态：
  - `arg1`: entry lookup key
- native 行为：
  - 通过 `sub_140684E20(manager, key)` 找 336-byte entry
  - 再调用 `sub_1405BBD90(entry, current_context_ptr)`
- 结论：
  - **High confidence**
  - 用当前上下文对象同步/绑定到指定 entry

### `subcmd 0x19`

- 参数形态：
  - `arg1`: entry lookup key
- native 行为：
  - 通过 `sub_140684E20` 找 entry
  - 再调用 `sub_1405BD450(entry)`
- 结论：
  - **Tentative**
  - 对特殊 entry 执行终止/完成/提交类动作

## 与实测结论的交叉验证

下面这部分专门对照当前已有的游戏侧实测结论，避免只靠 decompile 做过度解释。

### 1. `sys_4F(0, slot, hash, ...)`

当前用户侧实测结论：

- `args1` 固定 `0`
- `args2` 表示消耗哪个栏位的弹药
- `args3` 是弹药 id
- 弹药 id 对应另一套 FHM2D 资源系统

native 侧当前观察：

- `sub_140684F00` 的 `case 0`
- 会把：
  - `arg1 = a4[1]`
  - `arg2 = a4[2]`
  - `arg3 = optional bool`
  - `arg4 = optional extra`
  传给 `sub_1405DEBD0`
- `sub_1405DEBD0` 会进一步调用：
  - `sub_1405BCF00(entry_for_arg1, arg2, bool, extra)`
- `sub_1405BCF00` 内部会：
  - 用 `arg2` 去查一张全局表
  - 查表时使用常量键 `0x6A62D65E`
  - 将查到的结果转成 float 数值
  - 再调用 `sub_1405BC170(entry, amount, false)`

而 `sub_1405BC170` 的核心行为是：

- 从 entry 的 `float` 值 `+0xD8` 中减去传入 amount
- 若扣空，则进入另一组状态切换逻辑

因此这一项现在可以比较明确地修正为：

- **`sys_4F(0, slot, hash, ...)` 的确非常像“按 slot 使用某个 hash 标识的弹药/资源定义，并消耗对应计量值”。**

也就是说，你关于：

- `args2 = 弹药栏位`
- `args3 = 弹药 id / 资源 hash`

这个方向，**和 native 结果是高度一致的**。

当前还没完全确认的只有一点：

- `arg0 = 0` 是不是“射击动作”的固定子命令名

但从结构上看，它至少已经不是抽象的“创建 depiction entry”，而更像：

- **通过 hash 取资源定义，然后从指定 slot 扣除/触发一次发射相关资源项**

### 2. `sys_4F(0x7, index, 0x1)`

当前用户侧实测结论：

- 发射空槽位子弹

native 侧当前观察：

- `sub_140684F00` 的 `case 7`
- 会读取：
  - `arg1 = a4[1]` 作为 entry index
  - `arg2 = a4[2]` 并转成 float
  - `arg3 = optional bool`
- 然后调用：
  - `sub_1405BC170(entry, float(arg2), bool)`

而 `sub_1405BC170` 明确会：

- 扣减 entry 的 `+0xD8` 浮点计量
- 若归零则切换状态
- 若可选 bool 为真，在耗尽时再触发 `sub_1405BD2B0`

因此这一项和纯字面理解有一点偏差：

- 它 **不是简单的“发射空槽位子弹”**
- 从 native 结构看，更像是：
  - **对某个 slot/entry 人工扣减指定量**
  - 并可选地在耗尽后触发额外行为

如果游戏现象确实表现成“空槽位子弹”，更可能的解释是：

- `arg2 = 1` 正好对应一次最小扣减
- 扣到 0 后的状态机副作用会触发你观察到的“空槽位发射/空射”表现

所以这一项目前更稳妥的表述应该是：

- **`sys_4F(0x7, index, amount [,flag])` 是一个 slot gauge / ammo count 的主动扣减接口。**

### 3. `sys_4F(0xA, 0x4)`

当前用户侧实测结论：

- 清空 `0x4 (5)` 号位置的蓄力条，变成蓄力 0

native 侧当前观察：

- `sub_140684F00` 的 `case 0xA`
- 直接调用：
  - `sub_1405BC040(entry)`

`sub_1405BC040` 的行为非常清楚：

- 先检查 `entry + 0x7C` 是否非 0
- 若非 0，则把：
  - `entry + 0xF0 = 0`
  - `entry + 0xF8 = 0`

这是一个非常明确的“内部计数/计时值归零”动作。

因此这一项和你的实测结果 **高度一致**：

- **`sys_4F(0xA, index)` 非常像清空该 slot 的蓄力/累计值。**

### 4. `sys_4F(0x11, 0x4, 0)`

当前用户侧实测结论：

- 移除 `0x4 (5)` 号位置的蓄力条

native 侧当前观察：

- `sub_140684F00` 的 `case 0x11`
- 会调用：
  - `sub_140684E70(entry, bool)`

而 `sub_140684E70` 会：

- 比较 `entry + 320` 当前值和目标 bool
- 如果状态变化，则调用：
  - `sub_1405BC040(entry)`
- 然后更新 byte `320`

也就是说：

- 它不是单纯“设置一个 bool”
- 它在切换状态时还会连带清空 `+0xF0 / +0xF8`

这和你说的“移除蓄力条”是非常吻合的：

- **`sys_4F(0x11, index, 0/1)` 很可能是在切换该 slot 的 charge bar 显示/存在状态。**
- 同时它会在状态切换时把内部蓄力计数清零。

### 5. `sys_4F(0x1, 0x6, global138, 0, 0, global139)`

当前用户侧实测结论：

- 这一条与“反射敌方投射物”有关
- `global138 = 0x3` 时表现为“不反射，全身防御”
- `global138 = 0x6` 时表现为“防御背后”

当前脚本侧事实：

- 当前样本中 `global138` 只明确初始化为 `0x3`
- 这说明 `0x3` 至少是一个默认模式值
- 这个样本里没有直接看到 `global138 = 0x6`，因此 `0x6` 可能来自：
  - 运行时赋值
  - 其他脚本文件
  - 其他版本样本

native 侧当前观察：

- `sub_140684F00` 的 `case 1` 会：
  - 取 `slot = a4[1]`
  - 取 `mode_like = a4[2]`
  - 读取 `a4[3]` 作为布尔项
  - 读取 `a4[4]` 作为 float-like 数值
  - 将 `a4[5]` 解包成 packed flags
  - 然后交给 `sub_1405BD300`

`sub_1405BD300` 进一步会：

- 新建/刷新一个 0x20 小结构体
- 把这些字段写入该结构
- 再调用 `sub_1405BD230`

而 `sub_1405BD230` 会把这些值写入：

- `entry_base + 0x428 + 16 * index`

也就是说，这一套更像是：

- 往 slot 对应的 entry 内部写一组模式配置
- 而不是简单的“立即播放一个动作”

因此这一条目前最合理的解释是：

- **`sys_4F(0x1, slot, mode, bool, float, packedFlags)` 是对某个 slot 的高级配置接口。**
- 在 `slot = 0x6` 时，这个配置很可能对应你观察到的“反射/防御”子系统。

对你给出的具体结论，当前我认为：

- `global138` 作为 `mode_like` 值，**非常像防御姿态/反射模式编号**
- `global139` 不像普通 id，更像 **packed flags / packed option bits**

也就是说：

- `global138 = 3` / `6` 更可能是在选“防御模式”
- `global139` 更可能是在补充这个模式的附加选项，而不是单独资源 id

当前这一条和你的实测结论并不冲突，反而是互相加强：

- 你的实测告诉我们 `mode value` 的业务语义
- native 告诉我们它确实是在给一个固定 slot 写“模式配置”

## 当前与实测结果的综合结论

经过这轮交叉验证，当前可以把 `sys_4F` 的理解明显收窄到：

- 它不是泛泛的 depiction 控制接口
- 它更像是 **武装栏位 / 弹药 / 蓄力条 / HUD 表现** 相关的表现控制系统

更精确一点：

- `case 0` 很像“按资源 hash 执行一次射击/弹药消耗”
- `case 7` 很像“主动扣减某个 slot 的计量值”
- `case 0xA` 很像“把该 slot 的计量值清零”
- `case 0x11` 很像“切换该 slot 的 charge bar 状态，并在切换时清零”

这意味着 `sys_4F` 后续完全可以作为：

- **武装 HUD / 弹药槽 / 蓄力槽系统**

来继续反推其他 syscall，而不应只把它当“抽象 presentation 系统”处理。

## 关于“实际触发游戏什么内容”的当前判断

从几个层面综合判断，`sys_4F` 当前最像是在驱动：

- `depiction entry`
- `shell object`
- `presentation layer object`

而不是在驱动：

- 物理
- 输入
- 底层文件
- 普通数值逻辑

判断依据如下：

### 1. 它归属于 `CDepictionScript`

这已经把问题从“通用 syscall”缩到了“表现脚本 syscall”。

### 2. 周围 helper 和 lambda 明确出现 `CShellAbstract`

这说明它直接在和 shell / depiction 层对象打交道。

### 3. 它操作的是一组固定大小 entry 和 manager

例如：

- `336-byte entry`
- manager 批量 reset
- entry flag byte `318/319/320/322/323`

这更像一套：

- 壳层对象列表
- 表现节点列表
- 演出对象容器

### 4. 脚本侧用法也更像“表现控制”而不是“玩法逻辑”

例如：

- `sys_4F(0, group, hash)`
- `sys_4F(0x12, handle)`
- `sys_4F(0x13)`
- `sys_4F(0x14, 1)`
- `sys_4F(0xD, index, flag)`

这些都非常符合：

- 添加表现条目
- 清理条目
- 全局重置
- 切换当前模式
- 打开/关闭某个表现 slot

## 当前最务实的解释

在当前证据下，可以把 `sys_4F` 暂时理解为：

- **EXVS 的 depiction/shell presentation entry controller**

更口语一点：

- 它是一个“表现对象管理入口”
- 负责按 id/hash 创建、切换、停止、清理、打标记
- 影响的是画面表现层对象，而不是通用底层系统

## 当前剩余的不确定点

虽然已经基本定位到 handler，但以下内容还不能 100% 官方命名：

- 每个 byte flag `318/319/320/322/323` 的真实业务名字
- `sub_1405BC5A0 / sub_1405BD410 / sub_1405BC690` 分别到底是 stop / pause / resume 还是其他状态动作
- `0x0B / 0x0C` 里的 mode 映射值 `0 / 7 / 15 / 3 / 4 / 12` 各自代表什么模式
- `0x18 / 0x19` 操作的特殊 entry 是否是“当前人物壳层对象”、“当前表现槽位”，还是别的 presentation 对象

## 当前总结

截至目前，针对 `sys_4F` 的结论可以更新为：

1. 它不是字符串名，而是 MSC `sys` 指令的 syscall id `0x4F`。
2. 它最强的 native handler 候选不再是 `sub_14067F620`，而是 `sub_140684F00`。
3. 这个结论由 `CMotionScriptAbstract` handler table 偏移模型和 `sys_51 -> sub_1406856A0` 的对照共同支持。
4. `sys_4F` 所属子系统是 `CDepictionScript` / `CShellAbstract` 一侧的表现层系统。
5. 它本质上是一个多子命令的 presentation entry control 接口。

## 参考

- `docs/exvs-msc-analysis.md`
- `docs/exvs-msc-syscall-4f-notes.md`
