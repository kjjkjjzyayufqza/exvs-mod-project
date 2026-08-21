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
// Extra English lines may name the original global / func / sys trap.
// Origin: AI-assisted MSC edit; evidence/source in English.
modified_or_added_code();
// End, origin is AI-assisted MSC edit; evidence/source in English.
```

要求：

- 开头必须是 `// AI decision (YYYY-MM-DD): ...`。
- 结束必须是 `// End, origin is ...`。
- 每个 block 都必须有一行 `// Origin: ...`。
- 第一行是短标题。标题下面可以再写若干行英文，说明这段逻辑依赖哪些原始 `global` / `func_*` / `sys_*`，以及不能每 tick 重跑什么。
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

## 逻辑注释：写 original `global` / `func_*` / `sys_*`

AI 新增的语义名（例如 `rebellion_bird_n_melee_pending`）本身就是注释，不要再写
“set pending so we melee” 这种复述。人类真正需要的是原始反编译符号在这段
patch 里做什么：`global143`、`func_167`、`sys_46`、syscall 参数。

规则：

- 标题行之后、以及具体语句旁边，优先注释 **original** 符号：`globalNN`、
  `func_N`、`sys_XX`，以及它们的 flag / 参数（例如 `sys_46(0xF)`、
  `global143 == 0x2`）。
- 不要给 AI 自己起的语义名再加旁白。赋值、清零、one-shot flag 靠名字表达。
- 危险路径要写清楚 **不要做什么**：例如不要每 tick 重跑 `func_167` /
  `sys_46` 的清零参数，否则会把刚设的空中状态打掉。
- 对照来源写进注释（例如 `like ACTION_BC_SPECIAL_MELEE`），不要只写
  “fix movement”。
- 行内注释贴在 original 符号那一行，不要贴在语义名那一行。

反例（复述自己起的名字，original 符号没有任何说明）：

```c
// AI decision (2026-08-20): bird N melee setup.
// Origin: AI-assisted MSC edit; source is bird melee N followup.
if (global143 == 0x2)
{
    // Set pending so we remember to melee.
    rebellion_bird_n_melee_pending = 0x1;
}
if (rebellion_bird_n_melee_pending)
{
    // Now we are coming from flight.
    rebellion_bird_n_melee_from_flight = 0x1;
    // Clear pending.
    rebellion_bird_n_melee_pending = 0;
}
// End, origin is AI-assisted MSC edit; source is bird melee N followup.
```

正例（注释打在 `global143` / `func_167` / `sys_46` 上；语义名不旁白）：

```c
// AI decision (2026-08-20): bird N melee one-shot air setup + WR FX.
// Do NOT re-run func_167 / sys_46 zeros every tick; that resets air
// state each frame so the attack never plays. Brake leftover fly
// speed once with sys_46(0xF) like ACTION_BC_SPECIAL_MELEE.
// Origin: AI-assisted MSC edit; user: no reaction after per-tick hold.
if (global143 == 0x2)
{
    rebellion_bird_n_melee_pending = 0x1;
}
if (rebellion_bird_n_melee_pending)
{
    // global143: Rebellion bird form id (0x2). This gate is form, not action hash.
    // func_167: one-shot air setup. Recalling it every tick zeros the attack.
    func_167();
    // sys_46(0xF): brake leftover fly speed once, same as ACTION_BC_SPECIAL_MELEE.
    sys_46(0xF);
    rebellion_bird_n_melee_from_flight = 0x1;
    rebellion_bird_n_melee_pending = 0;
}
// End, origin is AI-assisted MSC edit; user: no reaction after per-tick hold.
```

上面的 `func_167()` / `sys_46(0xF)` 只是注释落点示范，真实 patch 要用该函数
里的实际参数。检查器仍然只校验 `AI decision` / `Origin:` / `End, origin is`
成对，不检查注释质量。

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

命名示例（AI 新增状态用语义名，不要 `global777`）：

```c
// AI decision (2026-06-19): cloned Delta Kai funnels need script-side dock state.
// Origin: AI-assisted MSC edit; source is Delta Kai slot-2 funnel shell sync research; shell order is known, side is not.
deltaKaiFunnelShell0IsOut = 0;
deltaKaiFunnelShell1IsOut = 0;
deltaKaiFunnelShell0ReturnTimer = 0;
deltaKaiFunnelShell1ReturnTimer = 0;
// End, origin is AI-assisted MSC edit; source is Delta Kai slot-2 funnel shell sync research.
```

逻辑注释示例见上一节：标题说明 trap，行内注释打在 `global` / `func_*` / `sys_*` 上。

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
- 只要 patch 碰到 original `global` / `func_*` / `sys_*`，block 里就要写出
  这些符号在这段逻辑里的作用，以及不能每 tick 重跑的路径。
- 不要写只复述 AI 语义名的旁白（`set pending`、`clear the flag`）。
- 如果一段 AI block 已经被实机验证为正式方案，可以保留 block，并在研究文档里记录验证结果；不要直接删掉来源信息。
