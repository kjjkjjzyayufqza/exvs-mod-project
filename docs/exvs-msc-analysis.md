# EXVS MSC Architecture Overview

## 一句话结论

MSC 是 EXVS 的脚本字节码层（VM 层），不是原始源码；`2.c` 是反编译后的 C 风格中间表示，不是游戏原始 C 源。

---

## Short Overview

- MSC 文件是脚本容器，里面是多段脚本函数和 VM 指令流。
- 脚本通过 `sys_*` 调用桥接到 native 引擎逻辑。
- 你在脚本里看到的 `sys_4E / sys_4F / sys_47`，本质是“syscall id”，不是 native 里的真实函数名。
- 逆向核心不在“还原原始脚本语言”，而在“定位 syscall dispatch table + 对应 native handler”。

---

## 你要的重点：从哪里挂载这些内容

这部分是后续分析最稳定的入口。

### 1) 关键类与命名空间线索

当前已识别的相关类/类型，不只两个，完整入口清单如下（按用途分层）：

- 核心入口基类：
  - `VDK::GAM::CMotionScriptAbstract`
- 当前主分析挂载点：
  - `VDK::GAM::CDepictionScript`
- 同 family/同子系统高相关类型：
  - `VDK::GAM::CShellAbstract`
- MotionScript 体系相关类：
  - `MSC::CMotionScript`
  - `VDK::GAM::CMotionScriptDepot`
  - `VDK::GAM::CAnimationScript`
  - `VDK::GAM::CBehaviourScript`
  - `VDK::GAM::CCharacterScript`
  - `VDK::GAM::CActorStatus_BaseMSC`
  - `VDK::GAM::CUnitTaskActorMSCAbstract`

实践上可先这样理解：

- `CMotionScriptAbstract`：脚本 handler table 基类入口（映射模型从这里成立）。
- `CDepictionScript`：`0x4A ~ 0x51` 这一段 syscall family 的主要挂载类。
- `CShellAbstract`：`sys_4E / sys_4F / sys_47` 周围 helper 的高频对象类型。
- 其余 MotionScript 体系类：用于扩展不同脚本域（动画/行为/角色/状态/任务），后续可沿同一“构造函数挂载表”方法继续拆。

### 2) 关键构造函数（挂载入口）

当前最重要入口函数是：

- `sub_140664F70`

它会连续把一批 handler 函数写入对象表（table）：

- `a1[74] = sub_1406807C0`
- `a1[75] = sub_14067B5F0`
- `a1[76] = sub_140681910`
- `a1[77] = sub_140685530`
- `a1[78] = sub_14067E060`
- `a1[79] = sub_14067F620`
- `a1[80] = sub_140682A30`
- `a1[81] = sub_1406836C0`
- `a1[82] = sub_1406840C0`
- `a1[83] = sub_140684F00`
- `a1[84] = sub_140683420`
- `a1[85] = sub_1406856A0`
- `a1[86] = sub_1406827A0`
- `a1[87] = sub_140682BF0`
- `a1[88] = sub_140683070`
- `a1[89] = sub_1406837C0`
- `a1[90] = nu::IsolatedAllocator::GetFreeNode`
- `a1[91] = sub_140683A40`
- `a1[92] = sub_140685A90`
- `a1[93] = sub_1406829C0`
- `a1[94] = sub_140682760`
- `a1[95] = sub_1406834F0`
- `a1[96] = sub_140683880`
- `a1[97] = sub_140683550`

这就是“syscall native 实现挂载”的直接证据。

补充关键引用关系（IDA）：

- `sub_140664E80`（`CDepictionScript` ctor）会直接调用 `sub_140664F70`。
- `sub_140664F70` 先调用 `sub_14067A890`，安装基类三个 handler：
  - `a1[4] = sub_1406915E0`
  - `a1[5] = sub_140694730`
  - `a1[6] = sub_140694640`

这意味着后续追 syscall 时，建议永远把这三层一起看：

- `sub_14067A270`（base ctor）
- `sub_14067A890`（base handler install）
- `sub_140664F70`（depiction family handler install）

### 3) slot 到 syscall 的映射模型

基于当前已经反复验证的模型：

- `syscall_id = slot_index - 4`

所以这段区间可读为：

- `slot 75 -> syscall 71 -> sys_47 -> sub_14067B5F0`
- `slot 82 -> syscall 78 -> sys_4E -> sub_1406840C0`
- `slot 83 -> syscall 79 -> sys_4F -> sub_140684F00`
- `slot 84 -> syscall 80 -> sys_50 -> sub_140683420`
- `slot 85 -> syscall 81 -> sys_51 -> sub_1406856A0`
- `slot 86 -> syscall 82 -> sys_52 -> sub_1406827A0`
- `slot 87 -> syscall 83 -> sys_53 -> sub_140682BF0`
- `slot 88 -> syscall 84 -> sys_54 -> sub_140683070`
- `slot 89 -> syscall 85 -> sys_55 -> sub_1406837C0`

这就是目前最可靠的“脚本调用 -> native 函数”映射入口。

---

## IDA 函数引用地图（详细版）

### A) 对象创建链（谁创建了这些脚本类）

- `sub_1406335F0` -> 调用 `sub_14062E460`（`CMotionScriptDepot` 构造核心）
- `sub_14062E460` 内部会创建并挂接多个脚本对象：
  - `sub_140664C60` -> `VDK::GAM::CAnimationScript::vftable`
  - `sub_140664CD0` -> `VDK::GAM::CBehaviourScript::vftable`
  - `sub_140664E00` -> `VDK::GAM::CCharacterScript::vftable`
  - `sub_140664E80` -> `VDK::GAM::CDepictionScript::vftable`
  - `sub_140665130` -> `VDK::GAM::CChrsysCommandChecker::vftable`

这条链解释了“为什么 Animation / Behaviour / Character / Depiction 是同一个 depot 体系下的脚本域”。

### B) `CDepictionScript` 挂载链

- `sub_140664E80`（size `0x3D`）：
  - 调 `sub_14067A270(a1, 9)` 初始化 `CMotionScriptAbstract`
  - 写 `CDepictionScript` vftable
  - 调 `sub_140664F70` 安装 family handler

### C) 基类挂载链

- `sub_14067A270`（base ctor）：
  - 初始化 `CMotionScriptAbstract::vftable`
  - 分配 line-work 和 handler 相关结构
  - 安装 `a1[32/40/48]` 对应基础 handler（等价 `a1[4/5/6]`）
- `sub_14067A890`（base install helper）：
  - 明确写 `a1[4] = sub_1406915E0`
  - 明确写 `a1[5] = sub_140694730`
  - 明确写 `a1[6] = sub_140694640`

### D) 已验证的关键 handler 数据引用点（最实用）

以下 data xref 是“确认 slot 挂载是否正确”的最快锚点：

- `sys_47` handler `sub_14067B5F0` <- `0x140664FE0`
- `sys_4E` handler `sub_1406840C0` <- `0x140665042`
- `sys_4F` handler `sub_140684F00` <- `0x140665050`
- `sys_50` handler `sub_140683420` <- `0x14066505E`
- `sys_51` handler `sub_1406856A0` <- `0x14066506C`
- `sys_52` handler `sub_1406827A0` <- `0x14066507A`
- `sys_53` handler `sub_140682BF0` <- `0x140665088`
- `sys_54` handler `sub_140683070` <- `0x140665096`
- `sys_55` handler `sub_1406837C0` <- `0x1406650A4`

### E) 复杂度参考（预估分析工作量）

- `sub_14067B5F0`（`sys_47`）size `0x2A70`：超大分发表，子命令很多。
- `sub_1406840C0`（`sys_4E`）size `0xD54`：中大型分发表（约 22 个 subcmd）。
- `sub_140684F00`（`sys_4F`）size `0x624`：中型分发表（约 26 个 subcmd）。
- `sub_140683420`（`sys_50`）size `0xD0`：小型控制接口。
- `sub_1406856A0`（`sys_51`）size `0x3EC`：参数族接口（出现 `0x100xx/0x200xx` 域）。
- `sub_140682BF0`（`sys_53`）size `0x47C`：7 分支分发表，混合“preset 启停 + 多通道插值”。
- `sub_140683070`（`sys_54`）size `0x3A4`：4 分支分发表，聚焦“镜头姿态/角度限制”。
- `sub_1406837C0`（`sys_55`）size `0xBA`：小型分类状态接口（set/query/reset）。

---

## 推荐的逆向入口流程（IDA）

后续分析新 syscall，建议固定用这条流程：

1. 在脚本侧确认目标 syscall id（例如 `0x4E`）。
2. 用映射模型算 table slot（`slot = id + 4`）。
3. 在 `sub_140664F70` 里拿到该 slot 对应 handler。
4. 进入 handler 看 `switch(*a4)`，先恢复 subcmd 分发表。
5. 对每个 subcmd 继续追 helper 和调用方，最后和脚本实测交叉验证。
6. 回到 data xref 锚点（如 `0x140665042`）复核一次 slot 对应关系。

这样做的好处是：

- 不依赖反编译产物里的人造名字（如 `sys_4E`）
- 不会把“字符串搜索”误当成唯一入口
- 可稳定复制到 `sys_4A ~ sys_51` 整个 family

补充一条实操建议：

- 先从 `sub_14062E460` 看对象创建，再看 `sub_140664E80 -> sub_140664F70` 挂载，再进具体 handler；这样不容易在“同名/近名函数”里走偏。

---

## 当前入口锚点（可直接复用）

后续要继续分析时，可以先从这些函数下断点/下书签：

- 挂载入口：`sub_140664F70`
- `sys_47` handler：`sub_14067B5F0`
- `sys_4E` handler：`sub_1406840C0`
- `sys_4F` handler：`sub_140684F00`
- `sys_50` handler：`sub_140683420`
- `sys_51` handler：`sub_1406856A0`
- `sys_53` handler：`sub_140682BF0`
- `sys_54` handler：`sub_140683070`
- `sys_55` handler：`sub_1406837C0`

---

## See Also

- `docs/exvs-msc-input-action-weapon-pipeline.md`
- `docs/exvs-msc-syscall-4e-notes.md`
- `docs/exvs-msc-syscall-53-notes.md`
- `docs/exvs-msc-syscall-54-notes.md`
- `docs/exvs-msc-syscall-55-notes.md`
- `docs/exvs-msc-syscall-4f-notes.md`
- `docs/exvs-msc-syscall-4f-native-handler.md`
- `docs/exvs-msc-syscall-47-notes.md`
