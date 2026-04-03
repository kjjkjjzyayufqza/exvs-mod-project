# EXVS MSC Syscall 47 Investigation Notes

## 概述

这份文档记录当前针对 `sys_47` 的阶段性分析结果。

建议结合以下文档一起阅读：

- `docs/exvs-msc-analysis.md`
- `docs/exvs-msc-syscall-4f-notes.md`
- `docs/exvs-msc-syscall-4f-native-handler.md`
- `docs/exvs-msc-input-action-weapon-pipeline.md`

当前目标不是一次性把 `sys_47` 全部解释完，而是先确认：

- 它在 native 层对应哪个 handler
- 它属于什么子系统
- 它是“单一功能 syscall”还是“超大分发表 syscall”
- 哪些子命令已经能比较稳定地命名

## 当前最强结论

基于当前 handler table 偏移模型，`sys_47` 当前最可能对应：

- `sub_14067B5F0`

理由如下：

### 1. handler table 偏移关系

当前已有较强证据表明：

- `CMotionScriptAbstract` 的 syscall table 不是从 `a1[0]` 开始
- 更可能是从 `a1[4]` 对应 `sys_0`

因此：

- `slot_index - 4 = syscall_id`

在 `CDepictionScript` 构造函数中，相关区间为：

- `slot 74 = sub_1406807C0`
- `slot 75 = sub_14067B5F0`
- `slot 76 = sub_140681910`
- `slot 77 = sub_140685530`
- `slot 78 = sub_14067E060`
- `slot 79 = sub_14067F620`
- `slot 80 = sub_140682A30`
- `slot 81 = sub_1406836C0`
- `slot 82 = sub_1406840C0`
- `slot 83 = sub_140684F00`
- `slot 84 = sub_140683420`
- `slot 85 = sub_1406856A0`

换算后：

- `slot 75 -> syscall 71 -> sys_47`

所以当前最合理的映射是：

- `sys_47 -> sub_14067B5F0`

## `sys_47` 的总体特征

`sub_14067B5F0` 和 `sys_4F` 完全不同。

`sys_4F` 是一个相对集中、业务上偏“武装槽位/蓄力条/表现 entry”的系统。  
而 `sys_47` 明显是一个更大的 umbrella syscall。

当前直接可见的特征：

- 它内部有 **92 个子命令 case**
- case 范围至少覆盖：
  - `0`
  - `1`
  - `2`
  - ...
  - `91`
- 它频繁解析脚本传入的对象 id
- 然后通过对象取：
  - `+0x68`
  - `+0x70`
  这一类下级对象
- 后续大量调用 shell / spatial / control 相关 helper

因此当前对 `sys_47` 的理解不应该是：

- 一个单独“表示某件事”的 syscall

而更应该是：

- **一个大型对象查询与操作分发表**

换句话说：

- `sys_47` 可能是 EXVS 里围绕“场上对象 / shell / 空间参数 / 某类战斗对象控制”的总入口

## 脚本侧特征

从 `2.c` 里可以看到，`sys_47` 的调用非常密集，而且参数模式非常分散：

- 查询型：
  - `sys_47(0, sys_4B(0x1))`
  - `sys_47(0x1, sys_4B(0x1))`
  - `sys_47(0x7, sys_4B(0x1))`
  - `sys_47(0x44, global20)`
  - `sys_47(0x45, global20)`
  - `sys_47(0x46, global20, 0x1)`
  - `sys_47(0x47, global20, global298)`

- 控制型：
  - `sys_47(0x3, global20, arg0, 0x1)`
  - `sys_47(0x4, global20, arg0)`
  - `sys_47(0x10, global20, ...)`
  - `sys_47(0x16, global20, ...)`
  - `sys_47(0x20, global20, ...)`
  - `sys_47(0x21, global20, ...)`
  - `sys_47(0x22, global20, ...)`
  - `sys_47(0x24, global20, ...)`
  - `sys_47(0x2E, global20)`
  - `sys_47(0x2F, global20)`

这再次说明：

- `sys_47` 不是单纯 getter
- 也不是单纯 setter
- 它同时承担：
  - 查询
  - 控制
  - 事件/表现触发
  - 位置/空间参数读写

## 当前较有把握的 case 级分析

下面按照“当前证据强度”来写。

## 重点分析：`0x10 / 0x11 / 0x12`

### 运行时验证结论

基于当前用户侧实测，这三项现在可以从“中性轨道命名”提升为更明确的业务语义：

- `sys_47(0x10, modelId, boneId, x, y, z)`：`rotate`
- `sys_47(0x11, modelId, boneId, x, y, z)`：`translate`
- `sys_47(0x12, modelId, boneId, x, y, z)`：`scale`

当前最有代表性的实测样例是：

- `sys_47(0x12, 0x46ea22fb, 0x6, 0x64, 0x64, 0x64);`

其效果是：

- 对指定模型的指定骨骼部位应用缩放
- 也就是“放大某个部位”

因此这三项的参数顺序目前可以先明确记为：

- `arg0`: subcmd
- `arg1`: model id
- `arg2`: bone id
- `arg3`: x
- `arg4`: y
- `arg5`: z
- `arg6`: optional extra / mode / duration-like value（仅部分调用使用）

注意：

- 这里的“模型 id”与脚本中传入的对象标识有关，实际 native 层会先解析 object/shell，再在其下级结构里定位到目标条目。
- “骨头 id”在脚本里通常表现为一个整数槽位或 hash 解析后的索引。
- `x/y/z` 在脚本中通常是按百分比或内部定点缩放后再换算成 float。

这是当前最值得优先拆的一组三连 case，因为它们：

- 参数形态高度一致
- 都带有 hash-like id
- 都显式接收三到四个数值参数
- 很像在操作“按 hash 标识的三维参数条目”

从 native 结构看，这三项不是普通 getter，而是 **对对象内部某个参数表写入向量/参数**。

### 总体共同结构

三者的共同模式都是：

1. 先拿第一个参数当对象 id，调用 `sub_14035D8D0` 解析对象。
2. 再取对象下级结构，进入一个参数/条目管理器。
3. 把第二个参数当作 **条目 key / hash id**。
4. 把后面的整数参数按比例换算成 float。
5. 再调用一组 helper，把这些值写进某个 keyed entry。

因此，这三项非常像：

- `set keyed vector/curve/slot parameter`

而不是：

- 单纯事件触发
- 单纯状态查询

### `sys_47(0x10, object, key, x, y, z, extra)`

native 对应：

- `case 16`
- 主要分支地址：`0x14067CE8A`
- 最终调用：`sub_140334920(...)`

参数结构观察：

- `arg1`: object id
- `arg2`: key / hash
- `arg3`: x-like value
- `arg4`: y-like value
- `arg5`: z-like value
- `arg6`: optional extra float-like value
- `arg7`: optional mode，通过 `sub_1406824B0` 映射为 `0/1/2`

关键 helper：

- `sub_140334920`
- `sub_140334260`
- `sub_140335110`

`sub_140334920` 的行为：

- 使用 `key + mode` 在一张 96-byte entry 数组里定位或新建一个条目
- 再把一组 float/int 参数写入该条目

当前判断：

- **Validated by runtime**
- `sys_47(0x10, ...)` 对应 `rotate`
- 也就是对指定模型/骨骼写入旋转参数

### `sys_47(0x11, object, key, x, y, z, extra)`

native 对应：

- `case 17`
- 主要分支地址：`0x14067CF63`
- 最终调用：`sub_1403349C0(...)`

参数结构观察：

- 和 `0x10` 几乎完全一致
- 也是：
  - object id
  - key / hash
  - 3 维数值
  - 可选 extra
  - 可选 mode

关键 helper：

- `sub_1403349C0`
- `sub_140333EA0`
- `sub_140333DF0`
- `sub_140335110`

这里和 `0x10` 的关键区别是：

- `sub_1403349C0` 最终走的是 `*(manager + 40)`
- 而 `0x10` 对应的 `sub_140334920` 最终走的是 `*(manager + 56)`

这说明：

- `0x10` 和 `0x11` 不是“同一个参数重复写”
- 而是写入 **同一类 keyed 条目系统中的不同通道/不同表**

当前判断：

- **Validated by runtime**
- `sys_47(0x11, ...)` 对应 `translate`
- 也就是对指定模型/骨骼写入平移参数

### `sys_47(0x12, object, key, x, y, z, extra)`

native 对应：

- `case 18`
- 主要分支地址：`0x14067D004`
- 最终调用：`sub_1403349D0(...)`

参数结构观察：

- 与 `0x10 / 0x11` 仍然高度一致
- 同样是 keyed 3D 参数写入

关键 helper：

- `sub_1403349D0`
- `sub_140333EA0`
- `sub_140333DF0`
- `sub_140335110`

和 `0x11` 的关系：

- `sub_1403349D0` 与 `sub_1403349C0` 只差一个内部目标偏移
- `0x11` 用 `*(manager + 40)`
- `0x12` 用 `*(manager + 48)`

所以：

- `0x11` 和 `0x12` 很可能也是一对相邻通道

当前判断：

- **Validated by runtime**
- `sys_47(0x12, ...)` 对应 `scale`
- 当前样例已经能确认它可以直接放大指定骨骼部位

## 这三项之间最重要的共同结论

截至目前，`0x10 / 0x11 / 0x12` 这三个 case 可以统一理解成：

- **对指定模型的指定骨骼写入 TRS 参数**

也就是：

- `0x10 = rotation`
- `0x11 = translation`
- `0x12 = scale`

它们共同的业务模型是：

- 先定位模型对象
- 再定位骨骼/部位
- 最后写入该骨骼的三维 TRS 量

这也解释了为什么脚本里常见：

- 三个轴参数一起出现
- `0x64, 0x64, 0x64`
- `0, 0, 0`

这些写法。

## 当前命名建议

既然运行时结果已经支持更明确的命名，当前建议直接使用：

- `sys_47(0x10, ...)`: `set_model_bone_rotate(...)`
- `sys_47(0x11, ...)`: `set_model_bone_translate(...)`
- `sys_47(0x12, ...)`: `set_model_bone_scale(...)`

如果后续发现 `modelId` 并不是严格意义上的“模型实例 id”，再回退成更中性的：

- `set_object_bone_rotate(...)`
- `set_object_bone_translate(...)`
- `set_object_bone_scale(...)`

## 与脚本上下文的业务级推测

从脚本里目前看到的典型调用：

- `sys_47(0x10, global20, 0x1, x, y, z, 0);`
- `sys_47(0x11, global20, 0xf8bbafa8, 0, 0, 0x28, 0x1f4);`
- `sys_47(0x12, global20, 0xa1108d59, 0x64, 0x64, 0x64, 0);`

结合当前运行时验证，现在可以改写为：

- `0x10`：写入某个模型骨骼的旋转参数
- `0x11`：写入某个模型骨骼的平移参数
- `0x12`：写入某个模型骨骼的缩放参数

其中：

- `0x12` 的 `0x64, 0x64, 0x64` 是最典型的缩放百分比写法
- `0, 0, 0` 则对应将该方向上的缩放压回默认/零增量状态

### Case `0x00`

脚本用法：

- `if (sys_47(0, sys_4B(0x1)) >= global402)`
- `if (sys_47(0, sys_4B(0x1)) > global403)`

native 观察：

- 先通过对象 id 取对象
- 再取对象下级结构
- 调用：
  - `sub_140618BD0`
  - `sub_140618BC0`
- 最终把一个 float 转成脚本 int

当前判断：

- **High confidence**
- 这是某种“当前量”的查询接口
- 很可能是一个和对象状态相关的实时数值
- 当前还不宜直接命名成 HP、距离、蓄力或时间，需更多上下文

### Case `0x01`

脚本用法：

- `global260 = sys_47(0x1, sys_4B(0x1)) / 0x64 + global260;`

native 观察：

- 和 case `0x00` 共用相同的对象解析路径
- 也会调用：
  - `sub_140618BD0`
- 然后走向与 case `0x00` 相近的数值返回路径

当前判断：

- **High confidence**
- 也是某种对象状态数值查询
- 很可能与 case `0x00` 配对，分别表示：
  - 当前值 / 另一种规范化值
  - 或者当前值 / 上限值

### Case `0x07`

脚本用法：

- `if (sys_47(0x7, sys_4B(0x1)))`

native 观察：

- 同样先解析对象
- 读取两个相关数值
- 最后做比较并返回布尔值

当前判断：

- **High confidence**
- 这是一个“对象是否满足某个阈值条件”的布尔查询接口
- 不是纯事件触发

### Case `0x0A`

脚本用法：

- `sys_47(0xA, global20);`

native 观察：

- 会取对象下级结构
- 再构造 lambda，交给 `sub_14067AED0`
- 呈现出“对某个 shell/object 施加操作”的模式

当前判断：

- **Tentative**
- 更像控制型 case，而不是查询型 case

### Case `0x44` / `0x45`

脚本用法：

- `var2 = func_101(sys_47(0x44, global20) + 0x4650);`
- `var1 = -sys_47(0x45, global20);`

native 观察：

- `case 68 (0x44)`：
  - 从对象下级结构读取 `[+0xE4]`
  - 再经过一套浮点缩放转脚本整数
- `case 69 (0x45)`：
  - 从对象下级结构读取 `[+0xE0]`
  - 再走同一套缩放逻辑

当前判断：

- **Confirmed**
- 这两项非常像对象位置或方向向量中的两个分量
- 当前更像：
  - 某个平面坐标的两个轴
  - 或者位置/速度向量中的两个分量

因为脚本中一项还带负号：

- `-sys_47(0x45, global20)`

这很符合“坐标系换轴”的现象。

### Case `0x46` / `0x47`

脚本用法：

- `sys_47(0x46, global20, 0x1)`
- `sys_47(0x47, global20, global298)`

native 观察：

- 当前注释里：
  - `case 70` 对应地址 `0x14067C77D`
  - `case 71` 对应地址 `0x14067C84C`
- 两者都：
  - 解析对象
  - 通过对象管理器取某个 target/group
  - 再在一个列表中查目标项
  - 最终读取不同 offset 的 float，再转为脚本 int

当前判断：

- **High confidence**
- 这两个 case 很像“从对象关联目标/部位/锁定对象上读取某个空间参数”
- 可能与：
  - 目标距离
  - 目标偏移
  - 某部位位置
  - 某锁定点坐标
 相关

### Case `0x48` / `0x49`

脚本用法：

- `sys_47(0x48, global20, arg1, arg0);`
- `sys_47(0x49, global20, arg1, arg0);`

native 观察：

- `case 72`：
  - 先通过对象管理器找到一组节点/元素
  - 再对主目标和列表元素调用 `sub_14032F3B0`
- `case 73`：
  - 结构类似，但调用的是 `sub_14032F590`

当前判断：

- **High confidence**
- 这两项是一对“对目标组施加某种连续参数”的控制接口
- 很可能分别控制两个相关但不同的空间/表现分量

## 当前对 `sys_47` 的业务级理解

截至目前，`sys_47` 最合理的总体描述不是：

- “一个功能”

而是：

- **对象状态查询 + 对象空间/表现控制的大型分发表**

它大概率围绕以下对象展开：

- shell object
- 场上单位对象
- 锁定对象 / 部位对象 / 子节点对象
- 关联的表现控制器

也就是说，`sys_47` 更像：

- “战斗对象 API 大全”

而不是：

- 单一 subsystem API

## 当前最重要的 caution

不能像 `sys_4F` 那样，太快给 `sys_47` 一个非常具体的统一名字。

因为 `sys_47` 目前表现出来的范围太大：

- 查询坐标
- 查询状态值
- 查询布尔条件
- 触发对象控制
- 修改目标组参数

它很可能本来就是 EXVS 脚本层的一个超级入口。

## 当前可复用的方法

这次分析 `sys_47` 再次证明了一件事：

1. 先用 handler table 把 syscall id 映射到 native handler
2. 再挑脚本侧最常见、最可验证的 subcmd
3. 结合脚本调用习惯与 native case 结构逐项命名

这个流程是可复用的。

## 下一步建议

对 `sys_47`，当前最值得优先继续深挖的是这几个 case：

1. `0x00` 和 `0x01`
   - 先确定它们到底是“当前值/上限值”还是“距离/剩余量”

2. `0x07`
   - 找出它比较的两个量，确认它到底在判定什么阈值

3. `0x44 ~ 0x49`
   - 这是最容易和游戏中的位置、方向、锁定点、部位点对应起来的一组

4. `0x1A ~ 0x1D`
   - 脚本里经常成组出现，非常像区域/边界/窗口参数

## 当前总结

截至目前，可以把 `sys_47` 暂时理解为：

- `CDepictionScript` 中一个非常大的对象查询与控制接口
- 它覆盖大量与对象状态、位置参数、目标组操作相关的功能
- 它不是单一语义 syscall

其中：

- `0x44 / 0x45` 很像读取对象两个空间分量
- `0x46 / 0x47` 很像读取对象关联目标/部位的空间参数
- `0x48 / 0x49` 很像对目标组施加参数
- `0x00 / 0x01 / 0x07` 更像对象状态数值/阈值查询
