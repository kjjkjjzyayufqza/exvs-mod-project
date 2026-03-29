# EXVS MSC Syscall 4F Investigation Notes

## 概述

这份文档用于记录当前针对 `sys_4F` 的分析结果，并作为 `docs/exvs-msc-analysis.md` 的补充说明。

主文档负责解释：

- MSC 是什么
- EXVS 为什么要把高层逻辑编译成 MSC
- `mscdec.py` / `msclang.py` / `mscdec_msc.py` 各自负责什么

本文件专门聚焦：

- `sys_4F` 在反编译代码中的含义
- `sys_4F` 在 MSC 二进制中的真实编码方式
- 当前在 IDA 中已经确认的 native 侧线索
- 后续应该如何继续追 native handler

进一步的 native handler 分析见：

- `docs/exvs-msc-syscall-4f-native-handler.md`

## 关键纠正

一个非常重要的点是：

- `sys_4F` 不是 MSC 原始文件中的字符串名。
- `sys_4F` 是反编译器给 syscall `0x4F` 取的可读别名。
- 在 MSC 二进制里，它本质上是 `sys` 指令的一个参数值，而不是独立 opcode。

也就是说，不能把它理解成：

- “MSC opcode 0x4F”

更准确的理解应该是：

- MSC opcode `0x2D` 表示 `sys`
- `0x4F` 是这个 `sys` 指令的 syscall id

## 来自 Python 工具链的直接证据

### 1. `sys` 指令本身是 opcode `0x2D`

在 `tools/mscdec_msc.py` 中：

- `COMMAND_IDS["sys"] = 0x2D`
- `COMMAND_FORMAT[0x2D] = 'BB'`

这表示 `sys` 指令本体是：

- 1 byte opcode
- 后面跟 2 个 1 byte 参数

按照这套工具链的约定，这两个参数分别是：

- 参数个数 `argc`
- syscall 编号 `sysId`

### 2. `sys_4F` 在编译时会变成 `Command(0x2d, [argc, 79])`

在 `tools/msclang.py` 中：

- `syscalls["sys_4F"] = 79`
- 编译 syscall 时会生成 `Command(0x2d, [len(node.args.exprs), sysNum])`

因此：

- 反编译结果里的 `sys_4F(...)`
- 在二进制里并不是字符串 `"sys_4F"`
- 而是 `sys` 指令加上 syscall 编号 `79`

也就是十六进制：

- `0x2D`
- `0x4F`

## `sys_4F` 在 `2.bin` 中的实际编码方式

基于对 `E:\XB\解包\com\file\0xF1EF3B32\2.bin` 的直接扫描，当前已经确认：

- 文件中存在大量符合 `(opcode & 0x7F) == 0x2D` 且第三个字节为 `0x4F` 的位置
- 当前样本中共扫到 `87` 处 `sys_4F` 指令实例

这说明：

- `sys_4F` 在原始 MSC 中确实是一个高频 syscall
- 它不是通过字符串查找到的
- 它应该通过指令编码模式来定位

### 当前观测到的原始模式

当前样本中，`sys_4F` 常见的原始模式可以表达为：

- `[0x2D][argc][0x4F]`

如果某些 `sys` 调用带返回值并设置了 push bit，那么理论上也可能出现：

- `[0xAD][argc][0x4F]`

因为 MSC 的 command byte 会把最高位拿来表达 push bit。

在当前样本扫描中，前几条命中大致表现为：

- `0x1739: 0x2D 0x01 0x4F`
- `0x1746: 0x2D 0x02 0x4F`
- `0x1AEC: 0x2D 0x02 0x4F`
- `0x2618: 0x2D 0x03 0x4F`
- `0x3C4E: 0x2D 0x06 0x4F`

这正好和 `2.c` 中 `sys_4F` 参数个数不固定的现象一致。

## 这对 IDA 搜索策略意味着什么

这件事非常关键，因为它直接决定了逆向方法。

如果只在 native 程序里搜：

- `sys_4F`

通常不会有结果，或者结果极少，因为这是反编译器生成的名字，不是宿主引擎内部原名。

更合理的方式是从下面几层去追：

### 1. 先在 MSC 二进制里定位 syscall 编码

优先搜索：

- `0x2D ?? 0x4F`
- `0xAD ?? 0x4F`

这样可以先确认：

- 哪些脚本位置在调用 `sys_4F`
- 每次调用的参数个数是多少
- 哪些脚本函数最重度依赖 `sys_4F`

### 2. 再从反编译结果映射回脚本上下文

对照 `2.c`：

- 找出调用 `sys_4F` 的函数
- 观察它附近使用了哪些全局变量
- 看 `sys_4F` 是否和某些 `sys_4E / sys_50 / sys_51` 成组出现

### 3. 最后再回到 IDA 里找 native dispatcher

正确问题不是：

- “哪里有字符串 `sys_4F`？”

而应该是：

- “MSC syscall 编号 `79` 在 native 的哪条分发链里被消费？”

这两者的逆向效率差别很大。

## 当前在 IDA 中已确认的 MSC native 运行时

在当前 IDA 数据库 `vsac27_Release.exe.i64` 中，已经确认存在下列与 MSC 强相关的 native 类：

- `MSC::CMotionScript`
- `VDK::GAM::CMotionScriptAbstract`
- `VDK::GAM::CMotionScriptDepot`
- `VDK::GAM::CAnimationScript`
- `VDK::GAM::CBehaviourScript`
- `VDK::GAM::CCharacterScript`
- `VDK::GAM::CDepictionScript`
- `VDK::GAM::CActorStatus_BaseMSC`
- `VDK::GAM::CUnitTaskActorMSCAbstract`

这说明：

- MSC 在 EXVS 中不是边缘资源格式
- 它在宿主程序里有正式的对象模型和处理链

## 已确认的 MSC 装载点

当前已经确认 `sub_14030DEF0` 是一个很像 MSC 文件加载/初始化函数的 native 实现。

它会：

- 检查文件头 `B2 AC BC BA`
- 校验版本字段
- 初始化运行时结构

因此我们已经能确认：

- EXVS 确实在 native 层主动解析 MSC
- `2.bin` 不是仅被动存储的数据块

## 当前已识别的一组 syscall 宿主处理器线索

目前已经识别到一组高度可疑、并且和脚本里 `sys_0 / sys_1 / sys_2` 调用习惯强相关的 native 函数：

- `sub_1406915E0`
- `sub_140694730`
- `sub_140694640`

其中最关键的是 `sub_140694730`。

它内部显式处理了这些值：

- `0x10000`
- `0x10001`
- `0x10002`
- `0x10004`

这与 `2.c` 中的调用模式高度一致，例如：

- `sys_1(0x10000, ...)`
- `sys_1(0x10001, ...)`
- `sys_1(0x10002, ...)`

因此当前非常可能的判断是：

- `sub_1406915E0` 类似 `sys_0` 宿主处理器
- `sub_140694730` 类似 `sys_1` 宿主处理器
- `sub_140694640` 类似 `sys_2` 宿主处理器

这还不是最终命名，但已经足以证明：

- MSC syscall 在 native 层确实存在集中分发逻辑

## 当前对 `sys_4F` 的阶段性判断

### 可以确定的部分

- `sys_4F` 是 syscall id `79`
- 它不是原始字符串名
- 它在 `2.bin` 中是高频 syscall
- 它不是单一动作接口，而是一个带多个子命令的系统入口

### 从脚本侧看到的子命令模式

当前样本中常见这些调用形态：

- `sys_4F(0, group, hash, ...)`
- `sys_4F(0x1, arg0, arg1)`
- `sys_4F(0x2, arg0)`
- `sys_4F(0xA, arg0)`
- `sys_4F(0xD, index, flag)`
- `sys_4F(0x12, handle)`
- `sys_4F(0x13)`
- `sys_4F(0x14, flag)`

这说明：

- `sys_4F` 更像“某个子系统的总入口”
- `0x0 / 0x1 / 0x2 / 0xA / 0xD / 0x12 / 0x13 / 0x14` 是它的子命令

### 从参数形态看出的倾向

很多 `sys_4F` 调用都带有：

- group id
- slot/index
- handle
- 32 位 hash 值

因此它更像在做：

- 某个表现系统中的对象/条目控制
- 某类按 hash 标识的资源或行为注册
- 某组 slot 的 enable / disable / clear / trigger

而不像：

- 纯计算函数
- 基础输入
- 文件 I/O
- 单一简单音频 API

## 当前最合理的继续分析路线

后续如果要真正把 `sys_4F` 对上 native 实现，建议按下面顺序做：

1. 先从 `2.bin` 按原始编码继续提取所有 `sys_4F` 调用位置
2. 把这些位置映射回脚本函数，建立 `sys_4F` 使用热区表
3. 将子命令 `0x0 / 0x1 / 0x2 / 0xA / 0xD / 0x12 / 0x13 / 0x14` 分组
4. 再在 IDA 中寻找“消费 syscall id 79 的总调度器”
5. 最后把每个子命令与 native 内部对象或行为绑定

## 当前最重要的结论

对 `sys_4F` 来说，正确的搜索关键词不是：

- `sys_4F`

而应该是：

- MSC `sys` opcode `0x2D`
- syscall id `0x4F`
- 或者在二进制中直接搜索 `0x2D ?? 0x4F`

因此，真正的逆向路径应该是：

- 从 `2.bin` 的原始编码出发
- 再映射到 `2.c`
- 再回到 IDA 中找 native dispatcher

而不是直接希望在 EXE 里存在一个叫 `sys_4F` 的原生函数名。

## 参考

- 主文档：`docs/exvs-msc-analysis.md`
