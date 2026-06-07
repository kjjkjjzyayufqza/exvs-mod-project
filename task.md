# EXVS2 MSC IDA-Grounded Rewrite — Task Brief

## 工作区

在 `E:\research\msc_reserch\msc_human_rewrite` 上继续开发（不要从零新建）。
所有新代码只放在 `E:\research\msc_reserch\` 下。

对照与样本：

- `E:\TAURI_PROJECT\tools\`（mscdec / msclang / disasmlib）— **仅回归对照，不复制架构**
- `E:\research\msc_reserch\EXVS2_msc\` — 真实 MSC 语料（当前 16 个文件）
- 已入库 IDA 证据：`data/ida/vsac27_release_msc_handlers.json`（`vsac27_Release.exe`）

## 要解决的问题

现有 jam1garner / pymsc 衍生管线（含 TAURI `mscdec` 产出的 .c）是 **file/binary 驱动**：
syscall 以全局 `sys_XX` 命名，不反映 EXVS2 运行时 **script domain、offer set、constructor 安装的 handler 表**。
同一数字 id 在不同版本、不同 domain 下语义可以完全不同（例如不能假设全局 `sys_22` 含义固定）。

新管线必须是 **IDA + game exe grounded**，以逆向还原原系统设计为准，而不是倒推现有 decompiler 结构。

## 双层目标（必须分开）

### 层 1 — 无损载体（已实现，继续维护）

```text
.mscsb / .bscex / .cscex / .dscex
  <-> 无损 JSON IR
  <-> mscsrc（VM 级、offset 锚定、可 fail-closed 编辑）
```

验收：对语料库 **逐字节** roundtrip；未编辑路径 decode→repack 与原始文件一致。

**这一层不以 C 为权威 IR，不以 jam1garner 语义表为来源。**

### 层 2 — 人类可读投影（本阶段重点，只读）

```text
无损 JSON IR + IDA ground-truth + CFG 栈分析
  -> 原生 API 风格的伪 C 源码（只读，不参与 repack）
```

**只走「原生 API 假名」一种风格**，不要 jam1garner 式全局 `sys_XX` 表，也不要裸 `sys(argc, id)` 作为最终阅读格式。

期望阅读形态示例：

```c
/* @domain VDK::GAM::CDepictionScript */
/* @evidence sub_14067A890, vsac27_release_msc_handlers.json */

void fn_00000068(void) {
    shell_entry_set_active(0x00000001);
    bone_rotate(model_id, sys_4B_result, 0x00001770, ...);
    ...
}
```

命名规则：

- 仅当 IDA/game-exe 已证明 handler + 子命令语义时，才输出 `shell_entry_*`、`bone_*` 等 API 假名。
- 必须附带 `domain`、`evidence`（IDA 函数、ground-truth 记录、置信度）。
- **未取证不得猜**：输出 `native_call_unresolved(domain, handler_id, subcmd, ...)` 或保留结构化参数，禁止套用全局 syscall 名表。
- 控制流尽量结构化为 `if` / `while` / `for`；无法可靠还原时允许 `goto fn_0x........`，并标注「CFG 未结构化」。

**层 2 不要求、也不承诺 `伪 C -> MSC` 逐字节回写。** 若需改字节，仍走层 1 的 mscsrc / JSON IR。

## IDA 集成

通过 provider 边界接入（parser 不直接依赖 IDA）：

- 已导出 JSON 为可重复测试基线
- `ida-pro-mcp` 用于增量取证与新 handler 子命令挖掘
- 语义解析必须带 **runtime domain**（如 `VDK::GAM::CDepictionScript`）及 offer set / 继承关系

## 开发方法

- TDD：`python -m unittest discover -s tests`
- 还原顺序：loader → `sub_14030DB30`（指令定长）→ `sub_14030E270`（VM）→ offer set / handler 安装 → native 子命令
- 可检索 jam1garner msc、pymsc、公开 GitHub 了解历史；**新语义仅以 EXVS2 exe + IDA 为准**

## 非目标

- 不以 C 反编译 IR 为权威（不克隆 pymsc / mscdec 架构）
- 不用 jam1garner 全局 `sys_XX` 作为默认阅读名
- 不把「伪 C 投影」当作 repack 输入
- 不猜测未取证的原生行为

## 当前优先级

1. 在 `mscflow` / `annotate` 之上新增 **native API 伪 C 只读导出**（新命令，如 `api-projection` 或 `c-read/export`）
2. 扩展 ground-truth：优先 `sys_4B`、`sys_47`、`sys_4F`、`sys_55`，再扩 `sys_53`/`sys_54` 等
3. 新 exe revision 使用独立 VM profile，不原地篡改 VSAC27 证据
4. 与 `E:\TAURI_PROJECT\tools\mscdec.py` 输出做**并排对照**，证明 IDA API 名与 binary 表名差异（文档化，不合并两套语义）
