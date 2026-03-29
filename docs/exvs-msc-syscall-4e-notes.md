# EXVS MSC Syscall 4E Investigation Notes

## 概述

这份文档记录当前针对 `sys_4E` 的阶段性分析结果。

建议结合以下文档一起阅读：

- `docs/exvs-msc-analysis.md`
- `docs/exvs-msc-syscall-4f-notes.md`
- `docs/exvs-msc-syscall-4f-native-handler.md`
- `docs/exvs-msc-syscall-47-notes.md`

当前目标不是一次性把 `sys_4E` 所有子命令都完全命名，而是先回答下面几个更关键的问题：

- `sys_4E` 在 native 层最可能对应哪个 handler
- 它到底属于哪一类子系统
- 哪些子命令已经能稳定解释
- 哪些子命令目前仍然只能给出方向性判断

## 当前最强结论

基于已经建立的 handler table 偏移模型，`sys_4E` 当前最可能对应：

- `sub_1406840C0`

对应关系是：

- `slot 82 -> syscall 78 -> sys_4E`

这一点与此前用于定位 `sys_47 / sys_4F / sys_51` 的同一套映射模型一致：

- `syscall_id = slot_index - 4`

而在 `CDepictionScript` 构造阶段能看到连续安装：

- `slot 78 -> sys_4A`
- `slot 79 -> sys_4B`
- `slot 80 -> sys_4C`
- `slot 81 -> sys_4D`
- `slot 82 -> sys_4E`
- `slot 83 -> sys_4F`
- `slot 84 -> sys_50`
- `slot 85 -> sys_51`

因此，`sys_4E` 也属于和 `sys_47 / sys_4F / sys_51` 同一个 **depiction / shell / presentation** family，而不是底层通用数学接口。

## `sys_4E` 的总体形态

`sub_1406840C0` 是一个中等规模的分发表 syscall：

- 入口签名仍然是标准 handler 形态
- 内部通过 `switch (*a4)` 使用第一个脚本参数作为子命令
- 当前能看到 `case 0x00 ~ 0x15`
- 总计 22 个子命令

它的结构和 `sys_4F` 有明显不同：

- `sys_4F` 更偏 slot / gauge / charge / depiction entry
- `sys_47` 更像大型对象控制总入口
- `sys_4E` 介于两者之间，更像是：
  - 一组 **目标句柄槽位管理**
  - 一组 **状态 bit / 模式 request**
  - 一组 **对当前目标做距离 / 方位 / 朝向查询**

也就是说，`sys_4E` 不是单一功能 syscall，而是一个围绕“当前登记对象 / 目标对象”的混合接口。

## 目前能稳定看出来的三块结构

### 1. 目标槽位表

`case 0x09 ~ 0x0B`、`0x12 ~ 0x15` 都会访问：

- `*(_QWORD *)(*(_QWORD *)(a2 + 40) + 10680) + 648`

并配合一个很小的 helper：

- `sub_140683E20(base, out, index)`

它的行为非常直接：

- 从 `base + 8 * index + 4` 读取一个 32-bit handle

因此这里极像：

- 一个“目标 / 对象句柄槽位表”

脚本侧最像“写槽位”的是：

- `sys_4E(0x9, value, index)`

native 会执行：

- `slot[index] = value`

这说明 `sys_4E` 很可能会先把某个对象句柄登记进本地槽位，再围绕这个槽位做后续查询。

### 2. 状态 bitset / request 标记

`case 0x03 ~ 0x08`、`0x10`、`0x11` 都会频繁访问：

- `*(_QWORD *)(*(_QWORD *)(a2 + 40) + 10744)`

并且大量行为是：

- 对某个 bitset 位置 `OR 1`
- 某些情况下再同步设置镜像标志位

这说明前半段不是“立即执行动作”，而更像：

- 往 depiction / shell 子系统写入一批 **mode request / pending flag / dirty flag**

脚本里大量出现的：

- `sys_4E(0x8);`

从 native 看本质就是：

- 置某组固定 bit

它非常像一种：

- 打开某个对象相关模式
- 申请某个表现层状态
- 或者触发某个后续更新分支

但目前还不能仅靠 static analysis 给它下过窄的业务名。

### 3. 空间查询

`case 0x0B`、`0x12`、`0x13`、`0x14`、`0x15` 明显属于空间查询组。

这组 case 的共同流程是：

1. 从目标槽位表读取 handle。
2. 验证该 handle 是否仍然有效。
3. 通过全局对象容器把 handle 解析成对象指针。
4. 读取目标对象的位置 / 朝向基向量 / 旋转矩阵。
5. 计算相对本机的距离或角度。
6. 最终把结果转成脚本常用的整数返回值。

这组行为已经足够说明：

- `sys_4E` 的后半段确实在做“当前目标几何关系查询”

## 子命令分层结论

下面按证据强度来写。

### `subcmd 0x00`

native 行为：

- 对 `+10744` 处的 bitset 开总开关
- 对 `+10800` 处的状态块设置 `byte = 1`
- 如果某个 `dword` 非 0，则强制改成 `1`

脚本侧高频上下文：

- 初始化
- 状态切换
- 某些动作开始前

当前判断：

- **高置信度：某种“总开关 / 初始化触发 / 激活目标相关子系统”的接口**

当前不建议把它直接命名成“锁定开启”或“追踪开启”，因为还缺运行时验证。

### `subcmd 0x01`

native 行为：

- `ctx + 336 = a4[1]`

当前判断：

- **Tentative：设置一个 mode / id / context selector**

### `subcmd 0x02`

native 行为：

- `ctx + 336 = 0`

当前判断：

- **Tentative：清空 `0x01` 设置的 mode / selector**

### `subcmd 0x03`

native 行为：

- 根据 `arg1` 映射到 bitset group `9 ~ 15`
- 根据 `arg2` 选择 bank `0 / 1 / 2`
- 然后置位

当前判断：

- **High confidence：向一个分组 bitset 写入 request flag**

### `subcmd 0x04`

native 行为：

- 根据 `arg1` 选择 bank `0 / 1 / 2`
- 向固定区域置位
- 如果是 bank `0`，还会同步设置一个镜像总位

脚本侧样例：

- `sys_4E(0x4);`

当前判断：

- **High confidence：触发某个固定类别的 request / latch**

### `subcmd 0x05`

native 行为：

- 根据 `arg1` 做一层 case 映射
- 某些分支会使用 `arg2`
- 最终映射到不同 bitset group 和 bit position

脚本侧已见样例：

- `sys_4E(0x5, 0);`
- `sys_4E(0x5, 0x2);`
- `sys_4E(0x5, 0x3, 0x1);`

当前判断：

- **High confidence：这是一个“模式族选择器”，本质仍是写 request bit，但比 `0x04 / 0x08` 更细分**

### `subcmd 0x06`

native 行为：

- 与 `0x04 / 0x07 / 0x08` 结构相同
- 只是写入的 bitset 偏移不同

当前判断：

- **Tentative：固定类别 request bit**

### `subcmd 0x07`

native 行为：

- 与 `0x06 / 0x08` 同类

当前判断：

- **Tentative：固定类别 request bit**

### `subcmd 0x08`

native 行为：

- 若 `argc < 2`，默认 `bank = 0`
- 若传入第二参数，则只接受：
  - `0`
  - `1`
  - `2`
- 然后把 `+10744` 这块结构中：
  - `row 4`
  - `bit bank`
  置 1
- 若 `bank == 0`，还会把这一行对应的 mirror bit 也置 1

更直白地说，`0x8` 不是“直接执行某个动作”，而是在写一块请求矩阵：

- 每行像是一类 request group
- 每列的低几位像是 `bank 0 / 1 / 2`
- `0x8` 当前固定写的是第 4 行

native 侧新增证据：

- `sub_140689AB0` 证明这块结构本质上是一个大约 `16 x 40-bit` 的 request matrix
- `sub_1406A5040` 会读取同类矩阵的一行，并按：
  - `bit 1`
  - `bit 2`
  - `bit 4`
  决定进入不同分支
- 这说明 `sys_4E(0x8)` 写进去的内容，后续确实会被对象状态机消费，而不是死标记

脚本侧高频样例：

- 在多个动作开始时调用
- 经常紧跟 `sys_51(0x20001, 0x8)`、`sys_55(...)` 这一类表现层控制
- 很多调用都出现在 `if (global584 == 0)` 这种“动作入口条件”下

脚本侧关联证据：

- 在同一套状态机里，先出现 `sys_4E(0x8)`
- 后面再出现：
  - `sys_4E(0xA)` 检查目标是否存在
  - `sys_4E(0xB)` 检查目标距离是否小于某阈值

这个调用链说明：

- `0x8` 很可能不是单纯 UI / shell 开关
- 它更像是在请求某种 **目标相关状态刷新**
- 也可能是在请求：
  - 目标搜索
  - 锁定候选更新
  - 或某个 target slot 的自动填充流程

当前判断：

- **高置信度：动作开始时常用的第 4 行 request bit，且很可能与目标搜索 / 锁定刷新有关**

当前仍然不建议直接把它命名成：

- `lock_on_start`
- `search_enemy_now`
- `enable_homing`

因为目前 static analysis 还没有找到“第 4 行”被最终消费成哪一个明确业务枚举名。

这是当前 `2.c` 样本里最常见的 `sys_4E` 子命令。

### `subcmd 0x09`

native 行为：

- `slot[arg2] = arg1`

当前判断：

- **Confirmed：把某个对象 handle / target handle 写入本地槽位表**

### `subcmd 0x0A`

native 行为：

- 从槽位表取出 handle
- 验证该 handle 是否有效且仍能在全局对象容器中找到
- 返回 `0 / 1`

当前判断：

- **Confirmed：检查槽位中的目标对象是否存在 / 是否有效**

脚本侧典型样例：

- `if (sys_4E(0xA)) { ... }`

这与 native 返回布尔值完全吻合。

### `subcmd 0x0B`

native 行为：

- 取槽位对象位置
- 可选叠加 `(arg2, arg3, arg4)` 对应的局部位移
- 计算该点与当前 actor 位置的距离
- 返回值为 `distance * 100`

当前判断：

- **Confirmed：返回当前 actor 到目标槽位对象的距离**

脚本侧典型样例：

- `if (sys_4E(0xB) < 0x1388)`

即：

- 如果距离小于 `0x1388 / 100 = 50.00`

这和 native 的距离换算完全对得上。

### `subcmd 0x0C`

native 行为：

- 读取 `+10744 + 576 + 4 * arg1`

当前判断：

- **Tentative：读取某类状态值 / 计数值 / mode value**

### `subcmd 0x0D`

native 行为：

- 调用 `sub_140684060(list, arg1)`
- 若 `arg1 != 0`，则把它加入一个上限 8 项的小列表
- 若已存在则不重复追加

当前判断：

- **Confirmed：把非零 handle / id 加入一个小型登记列表**

### `subcmd 0x0E`

native 行为：

- 调用 `sub_140683FF0(list, arg1)`
- 检查该小型登记列表里是否存在可匹配项

当前判断：

- **Confirmed：查询 `0x0D` 使用的小型登记列表**

### `subcmd 0x0F`

native 行为：

- `byte_878 = 1`

当前判断：

- **Tentative：打开某个局部状态开关**

### `subcmd 0x10`

native 行为：

- `byte_878 = 0`
- 若 `+10832` 非空则触发 `sub_1406277D0()`
- 然后再置两组 bit

当前判断：

- **High confidence：关闭 `0x0F` 的局部开关，并触发一次后续同步 / 刷新**

### `subcmd 0x11`

native 行为：

- 从 `a2 + 136` 读取一个 “index -> (group, bit)” 映射表
- 再去当前 bitset 中检测该位是否置位

当前判断：

- **Confirmed：按逻辑 id 查询某个 request / state flag 是否已置位**

### `subcmd 0x12`

native 行为：

- 取目标对象位置
- 减去当前 actor 位置
- 调用 `sub_140683E30`
- 返回 `degrees * 100`

`sub_140683E30` 的数学形式是：

- `atan2(x, z)`
- 再减去当前 actor 的 yaw
- 最后规约到标准角域

当前判断：

- **Confirmed：返回“我面向目标点”的水平偏角**

更直观地说，它回答的是：

- 目标相对我在左边还是右边
- 水平夹角有多大

### `subcmd 0x13`

native 行为：

- 取目标对象位置
- 计算目标点相对当前 actor 的向量
- 调用 `sub_140683F10`
- 返回 `degrees * 100`

`sub_140683F10` 的数学形式是：

- `atan2(-y, horizontalDistance)`
- 再减去当前 actor 的 pitch

当前判断：

- **Confirmed：返回“我看向目标点”的俯仰偏角**

也就是：

- 目标在我上方还是下方
- 需要抬头 / 低头多少

### `subcmd 0x14`

native 行为：

- 不是取目标位置
- 而是直接取目标对象的一个基向量 `+240`
- 再调用 `sub_140683E30`

当前判断：

- **High confidence：返回目标对象朝向向量的水平角**

它更像是在问：

- 目标“正朝哪里看 / 朝哪里飞”

而不是问：

- 目标“在我什么方向”

### `subcmd 0x15`

native 行为：

- 对目标对象的姿态基矩阵做 Euler 分解
- `sub_1403888D0` 返回 3 个角
- 当前只取第一个角并转成 `degrees * 100`

当前判断：

- **High confidence：返回目标对象某个 Euler 角分量**
- 最像 roll / bank 一类姿态角

这一项目前还不建议直接写死成“横滚角”，因为还缺运行时验证。

## 脚本侧调用分布

当前 `2.c` 样本里，`sys_4E` 已见的调用主要集中在：

- `sys_4E(0);`
- `sys_4E(0x4);`
- `sys_4E(0x5, ...)`
- `sys_4E(0x8);`
- `sys_4E(0xA)`
- `sys_4E(0xB)`

目前没有在这个样本里直接看到：

- `sys_4E(0x12)`
- `sys_4E(0x13)`
- `sys_4E(0x14)`
- `sys_4E(0x15)`

这说明后四项虽然 native 语义已经比较清楚，但它们未必在 `2.bin -> 2.c` 这一份样本里频繁使用。

## 当前最值得记住的几个结论

如果只保留目前最有价值的结论，我会建议先记这几条：

1. `sys_4E` 当前最可能对应 `sub_1406840C0`。
2. 它属于 `CDepictionScript` 这一组表现 / shell family。
3. `sys_4E(0x9, value, index)` 很像 “写目标句柄到本地槽位”。
4. `sys_4E(0xA, index)` 是 “该槽位目标是否存在/有效”。
5. `sys_4E(0xB, index [,x,y,z])` 是 “当前 actor 到该目标点的距离 * 100”。
6. `sys_4E(0x12, index [,x,y,z])` 是 “相对目标点的水平偏角”。
7. `sys_4E(0x13, index [,x,y,z])` 是 “相对目标点的俯仰偏角”。
8. `sys_4E(0x14, index)` 更像 “目标自身朝向的水平角”。
9. `sys_4E(0x15, index)` 更像 “目标姿态的单轴 Euler 角”。
10. `sys_4E(0x0 ~ 0x8, 0x10, 0x11)` 这批前半段接口本质上大概率是在写状态 bit / request flag，而不是直接返回业务值。

## 目前仍然缺的关键证据

下面这些点如果补上，`sys_4E` 会快很多从“高置信度”变成“可命名”：

- 运行时验证 `0x12 / 0x13 / 0x14 / 0x15` 的数值变化方向
- 找到 `0x09` 的实际写入来源，确认它登记的是敌机、友机、投射物还是泛对象
- 顺着 `+10744` 这块 bitset 的消费方继续追，确认 `0x04 / 0x05 / 0x08` 各自最终驱动了哪个业务分支
- 补更多脚本样本，看看 `sys_4E(0x11)` 的逻辑 id 是怎么定义的

## 当前阶段结论

截至目前，`sys_4E` 已经可以从“未知 family 成员”提升为下面这个层级的理解：

- 它不是纯 setter，也不是纯 getter
- 它围绕一个“目标对象槽位表”工作
- 它一边负责写表现层 request / flag
- 一边负责返回和目标对象相关的空间几何信息

如果要给它一个当前阶段最稳妥的总称，我会倾向写成：

- **target slot + depiction state + spatial query syscall**

这个名字虽然不官方，但已经比单纯叫“未知 syscall 4E”更接近它的真实职责。
