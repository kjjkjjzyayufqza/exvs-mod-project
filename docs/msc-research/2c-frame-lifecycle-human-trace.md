# 2.c 逐帧生命周期：从玩家动作到 MSC 输出

样本：

```text
E:\XB\解包\com\file\0xBDBE6FEA\2.c
```

这页专门回答一个问题：

> 我打开一份 29,664 行的反编译 `2.c`，怎么知道 `func_1`、`func_4`、`func_44`、`ACTION_A_SHOT`、`func_489`、`func_887` 分别处在什么层？我想改 BD、移动、镜头、动作、射击、格斗时，应该沿哪条链路走？

结论先放前面：`2.c` 不是“按钮处理源码”，也不是“syscall common 表”。它是本机体 depiction / action script 层。它每帧消费 engine 已经整理好的 action、方向、boost、weapon slot、状态位，然后把它们变成 motion、weapon、movement、camera、shell、effect 等输出。

## 1. 五层心智模型

把 `2.c` 拆成五层，比把 1,047 个函数平铺成 `func_N` 更可读：

```text
Layer 0: engine / native 通用层
  原始按键、BD 二连、step 二连、boost gauge、lock、hit、landing、overheat

Layer 1: MSC 可读状态总线
  sys_0(0x10000, ...) action / input / state
  sys_0(0x90000, ...) ammo / weapon slot
  sys_0(0xc000*) boost / cancel / movement gate

Layer 2: 2.c 主循环和 action 调度
  func_4
  func_21/24/25
  func_11
  func_44 / func_52

Layer 3: action runtime
  ACTION_* setup
  ranged runtime: func_586 + global676..681 + func_587/593 等
  melee runtime: func_488 + global602/608/609/610 + func_489/502 等

Layer 4: 输出到表现 / 游戏对象
  motion: func_79 / func_308 / func_309 / func_610
  shooting: sys_4F
  assist: sys_51
  movement: sys_46 / func_532 / func_535 / func_536
  camera: sys_53 / func_321
  shell/model/effect: sys_4B / sys_47 / sys_4A / sys_58
```

所以读一个函数时先问：

```text
它是在启动时只跑一次，还是每帧跑？
它是在读 sys_0 状态，还是写 sys_1 注册表？
它是在把 action hash 查成 callback，还是在真正发射 / 位移 / 播动作？
它是不是只设置 runtime callback，真正行为在后续 segment？
```

## 2. 从启动到一帧结束的故事

### 2.1 启动只发生一次

源码锚点：`2.c:779-841`。

```text
main
  -> sys_2(... func_3/26/27)
  -> func_1()
  -> callFunc3(func_4)
```

人话：

- `main` 不是业务逻辑，它把几个脚本 callback 挂到 VM / engine 槽。
- `func_1` 是本机体脚本初始化。
- `func_4` 才是后面的主 action update loop。

这就是判断 `func_1` 的第一条证据：它在主循环前执行。

### 2.2 `func_1` 初始化了哪些系统

源码锚点：`2.c:789-841`。

`func_1` 的副作用覆盖面很大，不能命名成某个单点系统：

| 片段 | 人话解释 | 它初始化的系统 |
|---|---|---|
| 清 `global1..11` | 清空顶层 callback、当前 action、pending action | 主循环状态 |
| `func_61()` / `func_62()` | 初始化 cancel / action gate 的基础状态 | 动作门控 |
| `func_386()` | 大量 runtime global 归零和默认值 | 射击、格斗、移动、shell、方向、状态缓存 |
| `func_272()` | 另一组系统状态初始化 | 外部状态 / 资源侧状态 |
| `sys_1(0x10002,0x2,hash,func)` | 写 action callback 注册表 | 基础 action handler |
| `func_835()` / `func_836()` / `func_18()` | 样本特有资源和 hash 表 | 资源 / 武装 / 表现 |
| `sys_47(...)` / `sys_50(...)` | 写 native 表现或 shell 参数 | 初始姿态 / 表现参数 |
| `func_877()` | active shell、resource slot、action 表 | 本机 depiction 初始化 |

建议工作名：

```text
func_1 = init_depiction_script_runtime
```

命名理由不是“看起来像 init”，而是：

- 它发生在 `func_4` 前。
- 它清顶层状态。
- 它注册 action callback。
- 它进入 `func_877` 初始化 shell / resource / action registry。

### 2.3 `func_877` 是本机 depiction 初始化的第二段

源码锚点：`2.c:25407-25429`。

```text
func_877
  -> sys_4B(0, baseShellHash)
  -> global20 = sys_4B(1)
  -> global142 = resourceGroupHash
  -> sys_4F(0xb, slot, hash)
  -> global170 = 0
  -> func_887()
  -> func_1042()
  -> global1 = func_878
```

人话：

- `sys_4B(0, ...)` 激活一个基础 shell / model entry。
- `global20` 保存 active shell id，后面 motion、骨骼、命中判断大量用它。
- `sys_4F(0xb, slot, hash)` 像是在注册武装 / HUD / resource 槽。
- `global170=0` 后 `func_887()` 应用默认外观 loadout。
- `func_1042()` 注册 action 表和资源表。
- `global1=func_878` 把本机每帧 depiction 维护挂到顶层 callback。

所以 `func_877` 可以叫：

```text
init_unit_depiction_shell_and_action_tables
```

它不是单纯“换装”，因为它还注册 action / resource 表。

### 2.4 `func_1042/1043` 把玩家动作变成 callback 表

源码锚点：`2.c:29405-29470`、`2.c:6225-6240`。

```text
func_1042
  -> func_1043 action hash -> ACTION_* callback
  -> func_1044 slot callback table
  -> func_1045 resource hash table
  -> func_1046 extra resource / effect table

func_241(hash, callback)
  -> sys_1(0x10002, 0x2, hash, callback)
  -> 写 availability flag
```

关键点：

```text
func_241(0xf48d2d49, ACTION_A_SHOT)
```

不能翻译成“按 A 直接调用 `ACTION_A_SHOT`”。更准确是：

```text
如果这一帧 engine / action selector 交给 2.c 的 action hash 是 0xf48d2d49，
2.c 就从注册表取出 ACTION_A_SHOT 并调度。
```

当前样本常用入口：

| hash | callback | 玩家侧语义 |
|---|---|---|
| `0xf48d2d49` | `ACTION_A_SHOT` | 主射候选 |
| `0x31f61d6c` | `ACTION_AB_SUB` | 副射候选 |
| `0x23df217e` | `ACTION_AC_SPECIAL_SHOT_DIRECTIONAL` | 特射 / 援护候选 |
| `0x6ab12717` | `ACTION_BC_SPECIAL_MELEE_ALT_2` | 特格 / 特殊移动候选 |
| `0x193fe550` | `ACTION_BC_SPECIAL_MELEE` | 特格另一入口 |
| `0x178d1109` | `ACTION_B_MELEE` | N 格候选 |
| `0x8ae55bb1` | `ACTION_ABC_FINAL_ATTACK` | 觉醒技候选 |

## 3. 每一帧 `func_4` 怎么跑

源码锚点：`2.c:873-1002`。

把 `func_4` 读成流水线：

```text
func_4
  1. func_19()
       -> func_20()
          -> func_21() 读方向 / action mask
          -> func_22() 读 weapon slot / ammo-like 状态
          -> func_23() 读 sys_55 表现 / gauge 状态
          -> func_24() 读 primary action candidate 到 global5
          -> func_25() 读 secondary action candidate 到 global6

  2. func_879()
       -> 每帧 shell / depiction 维护

  3. func_5()
       -> 从 action queue / 状态里选择本帧 pending action

  4. func_11()
       -> boost / cancel / landing / overheat 相关 gate

  5. func_12() / func_13() / func_273()
       -> 外部转移、强制中断、状态维护

  6. func_51()
       -> secondary action channel commit

  7. func_44()
       -> primary action channel commit

  8. func_880() / func_264()
       -> 帧尾维护
```

### 3.1 状态读取：`func_21/24/25`

源码锚点：`2.c:1767-1883`。

`func_21`：

```text
global87 = sys_0(0x10000, 0, 0x7)
global48 = sys_0(0x10000, 0, 0x8)
...
```

读法：

- `global87` 是当前方向 / movement mask 候选。
- Notion 记录里 `global172/global175` 用 `0x4/0x8/0x10/0x20` 表示前后左右；本样本 `func_52` 会写 `global172 = global87 & 0x3c`。
- `global200` 是“按着方向”的分支标记候选，特射援护会用它区分 N / 方向版本。

`func_24`：

```text
global5 = sys_0(0x10000, 0, 0x10)
global9 = sys_0(0x10000, 0, 0x13)
```

读法：

- `global5` 是 primary action candidate。
- 后面由 `func_44` commit。

`func_25`：

```text
global6 = sys_0(0x10000, 0, 0x11)
global10 = sys_0(0x10000, 0, 0x14)
global67/global52/global50 = route metadata
```

读法：

- `global6` 是 secondary / route / interrupt action candidate。
- 后面由 `func_51/52` commit。

### 3.2 boost / cancel gate：`func_11`

源码锚点：`2.c:1325-1516`。

OverBoost wiki 的玩家侧语义：

- BD 是跳键二连，能取消大多数射击 / 格斗，并消耗 boost。
- step 是同方向二连，用来切诱导和枪口修正。
- boost 空后进入 overheat，落地硬直更长。

在 `2.c` 里不要找“跳键二连”的原始判断。更合理的分层是：

```text
raw input / boost gauge / step 判定
  -> engine 层
  -> sys_0(0x10000 / 0xc000*) 暴露给 MSC
  -> func_11 根据这些状态维护脚本侧 gate
```

`func_11` 的当前工作名：

```text
update_boost_cancel_gate
```

它维护：

| 变量 / 状态槽 | 当前工作含义 |
|---|---|
| `global23` | gate 是否处于 active |
| `global43` | 本帧进入 gate 的 edge |
| `global45` | 本帧退出 gate 的 edge |
| `global46` | forced re-entry latch |
| `global54` | movement bonus / gate edge 候选 |
| `sys_0(0xc0001)` | gate continuation permission 候选 |
| `sys_0(0xc0003)` | gate mode selector 候选 |
| `sys_0(0xc0005)` | restricted-state permission 候选 |
| `sys_0(0xc000c)` | movement bonus edge 候选 |

模组意义：

- 想改某个动作“能不能被 BD cancel”，先看该 `ACTION_*` 的 `func_123(mask)` / route / action gate，再看 `func_11` 是否全局拦截。
- 想改普通 BD 速度，通常不应该先改 `func_11`。普通移动更多在 native / resource / `speed_param`。
- 想改某个特格突进速度，先看这个 `ACTION_*` 的 `func_219(row)`、`sys_46(...)`、`func_532/535/536`。

### 3.3 action commit：`func_44` 和 `func_52`

源码锚点：`2.c:2615-2830`。

`func_44` commit primary action：

```text
if global5 == 0: return
global7 = global3
global3 = global5
清 movement/action runtime 状态
sys_46(0x1, channel, 0, 0, 0) 多次清 movement 通道
if sys_0(0x10003, 0x2, global3):
  callback = sys_0(0x10002, 0x2, global3)
sys_2(0, 0x2, callback)
```

人话：

- `global5` 被确认为本帧 primary action。
- 进入新 action 前会清一批 action / movement runtime。
- 通过注册表把 action hash 查成 callback。
- 用 `sys_2` 调度 callback。

`func_52` commit secondary action：

```text
global4 = global6
global172 = global87 & 0x3c
route / direction / interruption state 更新
callback = sys_0(0x10002, 0x2, global4)
sys_2(0, 0x3, callback)
```

人话：

- `global6` 的路线更像 route / cancel / secondary action。
- 它会把当前方向 mask 存进 `global172`，后续方向格斗、方向特射等会读。

这两者是整份 `2.c` 最重要的桥：

```text
action hash -> ACTION_* callback
```

## 4. ACTION 函数不是最终行为，通常只是安装 runtime

### 4.1 射击 action：`ACTION_A_SHOT`

源码锚点：`2.c:25765-25820`。

```text
ACTION_A_SHOT
  -> func_586()
  -> global677 = func_914
  -> global680 = func_915
  -> global681 = 0
  -> callFunc3(func_913)

func_913
  -> func_587()
```

读法：

- `ACTION_A_SHOT` 是主射 setup。
- `func_586()` 清 ranged runtime。
- `global677` 是起手 / motion callback。
- `global680` 是后续发射 / phase callback 候选。
- `global681=0` 是 ammo slot 0。
- 真正每帧推进由 `func_587()` 之类 ranged driver 完成。

`func_914` 的动作：

```text
global170 = 0
func_887()
func_610(motionHash, ...)
sys_0(0x90000, 0, 0) ammo check
func_123(0x280) cancel route
```

Notion 记录给 `sys_4F` 的关键含义：

- `sys_4F(0, slot, weaponHash)` 是 shooting / weapon request。
- `sys_4F(0x7, slot, 1)` 是主动扣 ammo。
- `sys_0(0x90000, slot, 0)` 是 ammo / weapon slot 检查。

所以改主射至少要同时看：

```text
ACTION_A_SHOT 的 global681 ammo slot
func_914 的起手 motion 和 ammo check
func_915 或后续 phase 的 sys_4F 发射点
func_123 cancel mask
动作结束时 shell / camera / runtime 是否恢复
```

### 4.2 格斗 action：`ACTION_B_MELEE`

源码锚点：`2.c:27343-27410`。

```text
ACTION_B_MELEE
  -> func_488()
  -> func_219(0xde3d1477)
  -> global602 = func_966
  -> callFunc3(func_965)

func_965
  -> func_489()
```

读法：

- `func_488()` 清 melee / special runtime。
- `func_219(row)` 从参数表加载动作参数。
- `global602` 是第一段 segment callback。
- `func_489()` 是普通格斗 runtime driver。

`func_966` 起手：

```text
func_308(global20, motionHash, ...)
func_531(func_967)
global170 = 1
func_887()
func_123(0x200)
```

`func_967` 后续段：

```text
func_308(global20, motionHash, ...)
func_532(0x2, 0xd, 0x58)
func_535(0x1, 0xa)
func_536(mask, time, callback) 多次
func_123(0x200)
func_125(0xc00000)
```

模组意义：

- 改格斗 motion：看 `func_308` 的 motion hash。
- 改格斗突进 / 接近：看 `func_219(row)`、`func_532`、`func_535`。
- 改派生窗口：看 `func_536(mask,time,callback)`。
- 改取消路线：看 `func_123(mask)`。
- 改格斗外观 / 持刀 / 变形：看 `global170` 和 `func_887/888`。

### 4.3 特格 / 特殊移动：`ACTION_BC_SPECIAL_MELEE_ALT_2`

源码锚点：`2.c:26424-26584`。

```text
ACTION_BC_SPECIAL_MELEE_ALT_2
  -> func_488()
  -> func_219(0x769a714e)
  -> global602 = func_936
  -> callFunc3(func_935)

func_935
  -> func_489()
```

`func_936` 起手：

```text
func_888(0x7)
func_308(global20, motionHash, ...)
sys_58 / sys_4A 表现
func_531(func_937)
func_296(0x3e8, 1)
func_123(0x381) at timing
```

`func_937` 后续段：

```text
func_296(0x3e9, 0)
sys_46(0x5, 0, 0x46, 0x64)
func_532(0x1f, 0x20, 0x64)
func_535(0, 0x3e7)
func_536(0x1, 0, func_945)
func_321(cameraHash) when condition
```

模组意义：

- 特格不是“只换装”。它同时切 shell、播 motion、写 movement、开派生窗口、开 cancel、可能开 camera。
- 如果只改 `func_888(0x7)`，只是在改表现形态，不是改特格性能。
- 如果只改 `sys_46(0x5,...)`，可能只改突进初值，后续仍会被 `func_489` 的 runtime 和 `func_219(row)` 影响。

## 5. 各系统怎么落到调用链

### 5.1 BD / step / boost

玩家语义来自 wiki：

- BD：跳键二连，能取消多数射击 / 格斗，消耗 boost。
- step：同方向二连，切诱导和枪口补正。
- overheat：boost 空，落地硬直变大，部分动作不能用。

脚本语义：

```text
engine 识别 BD / step / boost / overheat
  -> sys_0(0x10000, ...)
  -> sys_0(0xc000*)
  -> func_11 更新 gate
  -> func_44/52 commit 新 action 或取消
  -> ACTION_* runtime 决定动作内是否开放 cancel / 派生
```

改动入口：

| 目标 | 先看 |
|---|---|
| 普通 BD 次数 / 燃费 / 基础速度 | native / resource / `speed_param` |
| 某动作能否 BD cancel | `func_123(mask)`、action route、`func_11` gate |
| 某动作中的横移 / 突进 | `ACTION_* segment -> sys_46 / func_532 / func_535` |
| overheat 下能不能用某武装 | `sys_0(0xc000*)` gate、`sys_0(0x90000)`、action availability |

### 5.2 移动 / 速度 / 特殊位移

脚本侧常见入口：

```text
func_219(row)          加载动作移动参数
func_489 / func_502    melee / special movement runtime
sys_46(...)            movement control bus 候选
func_532/535/536       接近、窗口、派生、输入消费候选
func_296(...)          状态开关包装
func_298..302          speed scale 包装
```

经验规则：

- 想改“这招冲多远”：先找这个 `ACTION_*` 的 `func_219(row)` 和 segment。
- 想改“这招何时可派生”：先找 `func_536(mask,time,callback)`。
- 想改“基础机动力”：别从 `func_11` 开始，先找资源层和 native 参数。

### 5.3 镜头

Notion 记录和样本都支持：

```text
func_321(hash)
  -> sys_53(0x4, hash, 0x4650)
```

另外 `sys_53(0x5)` 多处像清 camera preset。

改动入口：

| 目标 | 先看 |
|---|---|
| 格斗命中镜头 | segment 内 `func_321` / `sys_53(0x4,...)` |
| 觉醒技镜头 | `ACTION_ABC_FINAL_ATTACK` 链 |
| 取消后镜头残留 | 打断 / 动作结束 / `sys_53(0x5)` 清理点 |
| 画面震动 / 缩放 | Notion 记录中的 `sys_53(0)` / `sys_53(0x2)` 模式 |

原则：镜头必须按“启用点 + 清理点”成对改。

### 5.4 射击 / 弹药 / 援护

射击链：

```text
func_1043 action hash
  -> ACTION_A/AB/AC
  -> func_586 清 ranged runtime
  -> global676..681 安装 phase callback 和 slot
  -> ranged driver
  -> sys_0(0x90000, slot, 0)
  -> sys_4F(0, slot, weaponHash)
  -> sys_4F(0x7, slot, 1)
```

援护链：

```text
ACTION_AC_SPECIAL_SHOT_DIRECTIONAL
  -> direction flag / global200
  -> sys_51(0x20000, 0, 0x2, assistIndex, type)
  -> sys_4F(0x7, ammoSlot, 1)
```

Notion 记录：

- `sys_4F(0, slot, hash)`：射击 / weapon request。
- `sys_4F(0x7, slot, 1)`：主动扣弹。
- `sys_51(0x20000,0,0x2,index,type)`：援护召唤。

### 5.5 格斗 / 判定 / 派生

格斗链：

```text
func_1043 action hash
  -> ACTION_B*
  -> func_488 清 melee runtime
  -> func_219(row) 加载参数
  -> global602/608/609/610 安装 segment callback
  -> func_489 或 func_502 driver
  -> segment callback
       -> func_308 motion
       -> func_532 / func_535 / func_536 接近和派生窗口
       -> func_123 / func_125 cancel / state mask
```

当前还不能最终确认 damage / down value / proration 的完整资源路径。`func_532/535/536` 更适合先叫：

```text
melee_contact_and_branch_window_helpers
```

不要直接命名成最终 hitbox / damage 函数。

### 5.6 shell / 换装 / 组件

链路：

```text
func_877
  -> global170 = 0
  -> func_887
      -> global170 == 0 ? func_888(0) : func_888(1)

func_888(mode)
  -> mode 0..6: 组合不同 shell loadout helper
  -> mode 7: func_1037 进入 alternate shell mode
  -> mode 8: func_1038 退出 alternate shell mode
```

Notion 记录：

- `sys_4B(0x2, modelHash, boneIndex, actionHash, targetModel)`：接模型到模型 / bone。
- `sys_4B(0x3)`：解除装备 / detach。
- `sys_47(0x10/0x11/0x12, model, bone, x,y,z)`：rotate / translate / scale。

模组规则：

- 改 shell 时要找进入点和恢复点。
- `ACTION_B_MELEE` 会改 `global170=1` 后 `func_887()`。
- `ACTION_BC_SPECIAL_MELEE_ALT_2` 会直接 `func_888(0x7)`。
- 动作被取消、死亡复归、切状态时也要确认是否回到默认 loadout。

## 6. 逆向者怎么给函数起名

不要第一眼就把 `func_N` 改成最终名。先按证据等级命名。

### 6.1 证据等级

| 等级 | 条件 | 命名方式 |
|---|---|---|
| A | 调用位置、读写全局、syscall、上下游都一致 | 可用较具体工作名 |
| B | shape 强，但缺 native 最终证明 | 用 `candidate` / `gate` / `helper` 这类保守词 |
| C | 只有一个调用点或一个参数形状 | 只做索引，不推广 |

### 6.2 常见 shape

| 看到的 shape | 更稳的角色名 |
|---|---|
| `main` 前调用、清大量 global、注册表、进 `func_877` | `init_depiction_script_runtime` |
| 每帧读 `sys_0(0x10000/0xc000*)`，最后 commit action | `main_action_update_loop` |
| `sys_0(0x10002,0x2,hash)` 后 `sys_2` | `dispatch_action_hash_callback` |
| 大量 `func_241(hash,ACTION_*)` | `register_action_hash_handlers` |
| `func_586` 后写 `global676..681` | ranged action setup |
| `func_488` 后写 `global602/609/610` | melee / special movement setup |
| `global170`、`func_887/888`、`sys_4B` | shell loadout |
| 密集 `sys_0(0xc000*)` 和 `global23/43/45` | boost / cancel gate |

## 7. 实际改动作前的最小审计

每次只改一个目标，先填这些证据：

```text
目标玩家动作:
action hash:
ACTION callback:
primary or secondary channel:
runtime family:
first segment callback:
motion hash:
weapon / assist syscall:
movement syscall:
camera syscall:
shell change:
cancel mask:
ammo slot:
restore / cleanup path:
test cases:
```

必须至少测：

- 地上。
- 空中。
- overheat。
- 命中。
- 空挥。
- 被打断。
- BD cancel。
- step / 虹ステ相关取消。
- 死亡复归或动作强制结束。

## 8. 当前仍不能从 `2.c` 单独证明的东西

这些不是不重要，而是边界不在当前样本里：

| 问题 | 为什么不能只靠 `2.c` 完成 |
|---|---|
| 原始 A/B/C/跳键如何变成 action hash | 上游 input selector 在 `0.c` / native 层 |
| 普通 BD 的最终速度、燃费、overheat 惩罚 | 属于 engine / native / resource 层 |
| `sys_46` 每个 case 的最终 native 名 | 需要拆 `CDepictionScript` handler |
| damage / down value / proration | 需要 projectile / melee resource 和 native hit handler |
| 跨机体 `func_N` 稳定性 | 需要第二个样本验证 overlay shape |

因此当前最稳的模组开发策略是：

```text
先用 2.c 定位动作链和脚本可改点
再用 Notion / native syscall 文档确认 syscall 参数
最后用资源文件和实机测试验证效果
```

## 9. 来源

- Notion MSC 页：`https://app.notion.com/p/1601ebad394d8027a042df115e61b6dd`
- OverBoost wiki 系统页：`https://w.atwiki.jp/exvs2ob/pages/593.html`
- OverBoost wiki テクニック页：`https://w.atwiki.jp/exvs2ob/pages/683.html`
- OverBoost wiki 初心者指南：`https://w.atwiki.jp/exvs2ob/pages/560.html`
- OverBoost wiki 用语集：`https://w.atwiki.jp/exvs2ob/pages/82.html`
- 项目文档：[EXVS MSC Input -> Action Hash -> Weapon Callback Pipeline](../exvs-msc-input-action-weapon-pipeline.md)
- 项目文档：[EXVS MSC Syscall 4F Native Handler Notes](../exvs-msc-syscall-4f-native-handler.md)
