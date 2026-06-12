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

## 目标形态（单一方向）

**我们要的是 jam1garner / pymsc 那种人类可读的 C 源码**——函数体、`if` / `while` / `switch`、带语义的调用，开发者可以直接打开 `.c` 阅读与 diff。

**明确丢弃、不再作为产品方向维护的中间层：**

- 无损 JSON IR（offset/opcode 字段的序列化载体）
- `mscsrc`（VM 级、offset 锚定、定宽指令行的文本格式）
- 以 VM 指令表、字节偏移、stack slot 为主视角的任何「人类可读」投影

上述格式接近底层字节码/虚拟机，适合 roundtrip 编辑，但**不是**我们想要的阅读与协作界面。它们可以作为内部实现细节或历史实验保留，但**不得**再作为对外主 IR 或验收终点。

```text
.mscsb / .bscex / .cscex / .dscex
  -> CFG 栈分析 + IDA ground-truth
  -> 人类可读 C 源码（jam1garner 风格，IDA 语义增强）
```

与 jam1garner 原版的关键差异：**命名与 syscall 语义必须 IDA + domain grounded**，不能照搬全局 `sys_XX` 表；阅读体验仍应是正常 C，而不是裸 `sys(argc, id)` 或 VM 助记符。

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

**本阶段以「MSC → 可读 C」为主**；`C → MSC` 重编译（msclang 方向）可后续再做，但不是当前验收前提。

## IDA 集成

通过 provider 边界接入（parser 不直接依赖 IDA）：

- 已导出 JSON 为可重复测试基线
- `ida-pro-mcp` 用于增量取证与新 handler 子命令挖掘
- 语义解析必须带 **runtime domain**（如 `VDK::GAM::CDepictionScript`）及 offer set / 继承关系

## 开发方法

- TDD：`python -m unittest discover -s tests`
- 还原顺序：loader → 指令解码 → CFG / 栈模拟 → offer set / handler 安装 → native 子命令 → **C 反编译输出**
- 可检索 jam1garner msc、pymsc、公开 GitHub 了解 **C 反编译形态与阅读惯例**；**新语义仅以 EXVS2 exe + IDA 为准**

## 非目标

- 不以 JSON IR / mscsrc / VM 级文本作为对外主载体或长期维护目标
- 不以 C 反编译 IR 为权威（不克隆 pymsc / mscdec 架构）
- 不用 jam1garner 全局 `sys_XX` 作为默认阅读名（须 domain-grounded）
- 不猜测未取证的原生行为

## 当前优先级

1. 在 `mscflow` / `annotate` 之上新增或强化 **jam1garner 风格可读 C 导出**（如 `c-decompile` / `api-projection`），输出为首要交付物
2. 扩展 ground-truth：优先 `sys_4B`、`sys_47`、`sys_4F`、`sys_55`，再扩 `sys_53`/`sys_54` 等
3. 新 exe revision 使用独立 profile，不原地篡改 VSAC27 证据
4. 与 `E:\TAURI_PROJECT\tools\mscdec.py` 输出做**并排对照**——对齐阅读体验（结构化 C），同时文档化 IDA API 名与 binary 表名差异（不合并两套语义）
