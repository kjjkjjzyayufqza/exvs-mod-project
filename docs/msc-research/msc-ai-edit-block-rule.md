# MSC AI 修改块注释规范

本页是 `X.c` MSC 反编译代码的 AI 修改标记规范。

适用范围：

- AI 直接修改 `0.c`、`1.c`、`2.c` 等 MSC 反编译 C 风格文件。
- AI 给出 patch，由人类复制进 MSC `X.c` 文件。
- AI 在已有 MSC patch 上继续追加、收紧、回滚或替换逻辑。

不适用范围：

- 原始游戏脚本自带逻辑。
- 纯研究 Markdown。
- 参数二进制、模型、贴图、effect 文件。它们应该在研究文档中记录来源和备份，不在二进制中写注释。

## 强制格式

每一段 AI 新增或 AI 修改过的 MSC 代码，都必须用 AI block 包起来：

```c
// AI decision (YYYY-MM-DD): short reason in English.
// Origin: AI-assisted MSC edit; evidence/source in English.
modified_or_added_code();
// End, origin is AI-assisted MSC edit; evidence/source in English.
```

要求：

- 开头必须是 `// AI decision (YYYY-MM-DD): ...`。
- 结束必须是 `// End, origin is ...`。
- block 内可以是 1 行或多行代码。
- 注释必须使用英文，因为项目规则要求代码和代码注释不写中文。
- 不要在代码里写项目禁用标记。未完成事项用 `Future work:`，不要用禁用词。
- 如果一个函数里有多段互不连续的 AI 修改，每段都单独包 block。
- 如果 AI 只改了原始代码中的一个条件，也要包住被改条件所在的最小代码块。

## 推荐 origin 写法

`origin` 要说明这个修改从哪里来，方便以后判断能不能删除或替换：

```c
// Origin: AI-assisted MSC edit; source is Delta Kai slot-2 funnel shell sync research.
// End, origin is AI-assisted MSC edit; source is Delta Kai slot-2 funnel shell sync research.
```

如果是从某个原始函数对照推出来的：

```c
// Origin: AI-assisted MSC edit; source is RX-78-2 slot-2 assist gate comparison.
// End, origin is AI-assisted MSC edit; source is RX-78-2 slot-2 assist gate comparison.
```

如果只是临时 runtime guard：

```c
// Origin: AI-assisted MSC edit; source is func_593 runtime guard audit.
// End, origin is AI-assisted MSC edit; source is func_593 runtime guard audit.
```

## 语义命名强制规则

AI 修改 MSC 时必须像逆向分析者一样命名。目标不是让代码“能编译就行”，而是让人类后来能从名字看出这段状态代表什么。

规则：

- 保留原始反编译已有的 `globalNN` / `func_N` 名字，用于定位旧代码。
- AI 新增变量、函数、辅助符号时，不要使用新的 `global777`、`global778`、`var42` 这类无意义占位名。
- AI 新增符号必须使用语义名，名字来自已证明的角色、资源、slot、shell id、action hash 或调用链。
- 不确定的语义不要装成确定结论；用 `maybe`、`candidate`、`approx`、`scriptSide` 等词，或把不确定性写进 `Origin:`。
- 如果只知道序号，不知道左右 / 前后，不要命名成 `left` / `right`；用 `0` / `1` 或 shell id 相关名字。
- 如果工具链或迁移场景临时必须保留 `globalNN`，必须在同一个 AI block 或相邻研究注释里写出 `globalNN -> semantic meaning`，并把它标成需要下一次清理的兼容限制。

反例：

```c
// AI decision (2026-06-19): cloned Delta Kai funnels need script-side dock state.
// Origin: AI-assisted MSC edit; source is Delta Kai slot-2 funnel shell sync research.
int global777;
int global778;
int global779;
int global780;
// End, origin is AI-assisted MSC edit; source is Delta Kai slot-2 funnel shell sync research.
```

正例：

```c
// AI decision (2026-06-19): cloned Delta Kai funnels need script-side dock state.
// Origin: AI-assisted MSC edit; source is Delta Kai slot-2 funnel shell sync research; shell order is known, side is not.
int deltaKaiFunnelShell0IsOut;
int deltaKaiFunnelShell1IsOut;
int deltaKaiFunnelShell0ReturnTimer;
int deltaKaiFunnelShell1ReturnTimer;
// End, origin is AI-assisted MSC edit; source is Delta Kai slot-2 funnel shell sync research.
```

## 示例

```c
// AI decision (2026-06-19): cloned Delta Kai funnels need script-side dock state.
// Origin: AI-assisted MSC edit; source is Delta Kai slot-2 funnel shell sync research; shell order is known, side is not.
deltaKaiFunnelShell0IsOut = 0;
deltaKaiFunnelShell1IsOut = 0;
deltaKaiFunnelShell0ReturnTimer = 0;
deltaKaiFunnelShell1ReturnTimer = 0;
// End, origin is AI-assisted MSC edit; source is Delta Kai slot-2 funnel shell sync research.
```

## 为什么必须这样做

MSC `X.c` 是反编译中间表示，不是原始源码。AI 修改如果只留下普通注释，后续很难区分：

- 哪些是原始反编译逻辑。
- 哪些是 AI 推测型 patch。
- 哪些 patch 依赖当前 offset / 当前样本函数编号。
- 哪些 patch 能在找到 native 真相后删除。

AI block 的目标是让每段修改都能被搜索、审计、回滚和迁移。

## 搜索与审计

常用搜索：

```powershell
rg -n "AI decision|End, origin is" E:\XB\解包\com\file\0xBDBE6FEA\2.c
```

每次修改 MSC `X.c` 后至少检查：

```powershell
python .\tools\check_msc_ai_blocks.py "<modified X.c>"
rg -n "AI decision|End, origin is" <modified X.c>
rg -n "TODO|FIXME" <modified X.c>
python .\tools\msclang.py "<modified X.c>" -o "$env:TEMP\msc_ai_edit_check.mscsb"
```

审计规则：

- `AI decision` 和 `End, origin is` 数量应该成对。
- 每个 AI block 都必须包含 `Origin:`。
- 每个 AI block 都应尽量包住最小必要代码。
- 每个 AI 新增符号都必须有语义名；搜索到新出现的 `globalNN` / `varNN`
  应当视为需要返工，除非同段 AI block 明确说明工具链兼容原因。
- 如果一段 AI block 已经被实机验证为正式方案，可以保留 block，并在研究文档里记录验证结果；不要直接删掉来源信息。
