# Wing Zero Rebellion：普通形态特格接 N → 鸟冲刺（`0x928ca34f` dash）

**Date:** 2026-08-25  
**Status:** 实机确认成功  
**Kind:** MSC `2.c` 普通形态特格取消窗 → 鸟形态短冲刺 → 松杆回普通  
**Primary tree:** `E:\XB\mod\040msc\wing_gundam_zero_rebellion_msc\`

**Related:**

- 鸟近战（飞行中按格斗，同一 hash，**不是**本页）：[wing-zero-rebellion-bird-melee-n-followup](./wing-zero-rebellion-bird-melee-n-followup.md)
- 鸟输入表：[wing-zero-rebellion-bird-form-0c-input-map](./wing-zero-rebellion-bird-form-0c-input-map.md)
- 打断拆 form：[wing-zero-rebellion-flight-interrupt-form](./wing-zero-rebellion-flight-interrupt-form.md)
- `func_593` 四槽：[func593-vanilla-ranged-slots](./func593-vanilla-ranged-slots.md)
- 失败实验过程（不作现行方案）：`docs/agent-sessions/2026-08-23-wing-zero-flight-special-melee-debug.md`

对照源：

```text
Star Winning  E:\XB\mod\040msc\053gbftry_004strwin_001\2.c
  ENTER        func_916
  tick         func_917 -> func_593()
  676 start    func_918
  677 shoot    func_919
  678 no-ammo  func_920
  679 end      func_921
  锁前冲回调    func_1073（表 0x10，(*ptr)()，不是 callFunc3）
```

---

## 一句话

任意方向特格 **先播原版**。取消只认 **格斗**：2.c `global242 && func_233(0x7e, 0)`。不要用 `global48 & 0x7e`（摇杆新按下 `0x4`=前进）。0.c 用 `global48 & 0x42`（N=`0x2`，前格=`0x40`）。  
`func_241` 把该 hash 接到 `rebellion_enter_normal_special_n_bird_dash`：用 `func_586` + `func_593` 四槽播变形进入、锁 30 帧前冲，然后 **679 置 `global252` 真正收招**。松杆（`global87 & 0x3c == 0`）拆鸟回普通形态。  
**飞行中按格斗**仍是同一 hash 的 `func_937` 格斗，不进 dash。不要把站立格斗也 hijack 进 dash。

---

## 实机结论（2026-08-25）

用户确认：特格接 N 会完整跑完 dash ENTER，松杆不再被脚本拖着假飞。此前「动作看起来跑完、人还在飞且不能取消」是 679 每帧继续写移动、且不置 `global252`，`func_598` 永不 `func_93`。

同日后续实机：`cut_in_loop` **不要写** `global143 = 0x2`。形态保持 `0` 时，30 帧锁冲接好枪盾刀并能前冲，按住方向键会进 **原生飞行**。把 `transform_start` 的 `global143 = 0x2` 抄进 dash，会看起来像 detach 没跑、30 帧后也不能接飞行。完整坑见下一节。

---

## 坑：dash 禁止写 `global143 = 0x2`（2026-08-25 实机）

**一句话：** `global143` 是形态，不是“在飞”。`0x2` 只属于官方变形 hash `0x9475130e` 的 `transform_start` / `transform_loop`。地面特格接 N 的 dash（`0x928ca34f` / `cut_in_loop` / 676 / 677）必须保持 `global143 = 0`。

动作 hash ≠ 形态，发布链：

```text
2.c func_41  每帧  sys_1(0x10000, 0, 0x17, global143)
0.c func_4         global39 = sys_0(0x10000, 0, 0x17)
0.c func_143       global39==0 地面表 / !=0 鸟表
```

| 层 | 地面 dash 要的 | 误写成 `143=0x2` 之后 |
|----|----------------|----------------------|
| 外观 | MSC 自己 `detach` + `attach_in` + `func_74(0x38)` | 下一帧被 `func_937` / `interrupt` 装回手上，像 detach 没执行 |
| 飞行移动 | `func_167(0x1004000)` + 593 后锁冲 | bit 还在，但 0.c 已不走地面飞行判断 |
| 30 帧后按住方向 | 地面 `func_143` 接到原生 `0x77b100ff` | 鸟表收近战；`func_41` 见 `0x928ca34f` 不在飞行白名单 → 拆 form 落地 |
| ENTER | `143==0` 才进 dash | `143==0x2` → `func_937()`，dash 整段丢掉 |

官方 start 可以写 `0x2`，因为当时 hash 是 **`0x9475130e`（变形进入，在 `func_41` 白名单）**。Dash 的 hash 是 **`0x928ca34f`（近战，明确不进白名单）**。抄 start 的形态发布 = 画面在鸟冲刺，引擎登记成鸟形态近战。

禁止再犯：

```c
// BAD — dash cut_in_loop / 676 / 677
global143 = 0x2;

// OK — only rebellion_transform_start / rebellion_transform_loop
// while the current hash is 0x9475130e
global143 = 0x2;
```

`func_167(0x1004000)`、`func_296(0x3e8,1)`、`0x38` 是飞行姿态/移动。需要的是「地面 thinker + 鸟外观 + 短冲」，不是「变成鸟机体再 dash」。

观感「那三个 detach 根本没跑」：调用往往已经跑过，但 `143=0x2` 发布后下一帧 `0.c` 鸟表可能再次提交 `0x928ca34f`，ENTER 走 `func_937` → `interrupt_bird_form_to_ground()` → `func_884` 把手持装回去。不要再用注释/15 帧等待解释这个现象。

---

## 身份

| 项 | 值 |
|---|---|
| 触发 | 原版特格先播；取消窗 `func_233(0x7e, 0)`（含前格 `0x40`）。0.c 在 `0x40` 派生之前拦截 |
| 提交 | `func_81(0x928ca34f, 0x1, 0x2, 0x1)`（不再按 `0x30` 分流到 `0x8b97920e`） |
| depiction | `func_241(0x928ca34f, rebellion_enter_normal_special_n_bird_dash)` |
| 左右近战取消 | 与 N/前/后相同，进 dash。`0x8b97920e` / `func_942` 仍注册，这两处取消窗不再提交它 |
| 鸟形态同一 hash | ENTER 开头 `func_937()`（格斗 + 拆 form） |
| 形态 | `global143`：`0` 普通 / `0x2` 鸟 |
| 速度行 | `global142`：鸟 `0xc2b19d13` / 普通 `0xc2b19d12` |
| 进入动作 | **不播** `0x37`。676/677 每帧 `rebellion_normal_special_n_bird_dash_loop`：loop 克隆 + start 整套枪/盾/刀 `attach_in` |
| 冲刺 loop | slot `0x38`，`func_74(0x38, 0)` |
| 锁前冲 | tick 在 `func_593()` **之后**直接调 `locked_loop_move`（对标 `func_1073`，不是 677 里写） |
| 冲刺写法 | `sys_46(0x1, 0x1, 0, 0, mag)`，`mag += S(0xff7a9c8b)`；pitch=0，不写 channel `0x2` |
| 冲刺初速 | `S(0x5e8caf43) - S(0xff7a9c8b) * 0x1e`（鸟行约 300−(−5)×30=450） |
| 冲刺时长 | `0xbb8` = 30 帧（`func_274()` 每帧 `0x64`） |

---

## 现行调用链

```text
特格 ACTION_BC_SPECIAL_MELEE / ALT_2
  -> 原版特格先播
  -> 取消窗 func_233(0x7e, 0)  // includes 前格 0x40
  -> 0x928ca34f dash

func_241(0x928ca34f)
  -> rebellion_enter_normal_special_n_bird_dash
       鸟 / from_flight -> func_937 格斗，return
       否则:
         dash_active = 1
         func_586()
         676 = start   677 = shoot   678 = no_ammo   679 = end
         global681 = 0x5      // 跳过 0x90000，start 一定进 shoot
         global689 = -1       // func_595 立刻 global722=1
         callFunc3(tick)      // tick 里只有 func_593()

func_593
  184=1  func_71(676) / func_72() 每帧 start
    start: dash_loop()（start 挂接 + loop 0x38），立刻 252
  184=2  func_71(677)  shoot
    shoot: init_loop + 每帧 dash_loop()；30 帧 -> 252
    tick 在 func_593() 之后: locked_loop_move（func_1073）
  184=3  678 no_ammo（正常走不到；立刻 252）
  184=4  func_71(679) / func_598
    end 首帧: 清 sys_46；无杆拆鸟；有杆 func_81(0x77b100ff) 进原生 analog
    次帧: global252 = 1
```

`func_71` → `func_73` 会清 `global240` / `global252`。所以 676 置的 `252` 不会带进 677；677 的 `252` 进 679 时也会被清。679 必须自己再置 `252`，`func_598` 才会 `func_93`。

### 锁前冲必须在 `func_593()` 之后写（2026-08-25 原地不动修复）

星际凯旋飞行特射：

```text
func_917 tick
  func_593()
  func_912() -> func_862() -> (*sys_0(0x10001, 0x10, global798))()
                = func_1073
func_1073
  frame0: func_167(0x1004000)  func_529(0)
  frame1: mag = S(0x5e8caf43) - S(0xff7a9c8b)*0x1e
  every:  sys_46(0x1, 0x1, 0, 0, mag); mag += S(0xff7a9c8b)
```

Rebellion 没有 Star Winning 的表 `0x10`，等价做法是 tick 里 **`func_593()` 返回后直接呼叫** `locked_loop_move`。不要 `callFunc3(func_1073)`。

失败实机：677 内 `sys_46` + ENTER `global453=global454=0` → `func_594` 把 `global714` 设成 0 → 每帧 `func_300(0)` 把 channel 4 倍率打成 0 → 看起来变形完成但人钉在原地。

---

## `callFunc3` 怎么用（对的 / 错的）

星际凯旋飞行特射和官方变形进入是同一规则：

| 用法 | 正确 | 错误 |
|------|------|------|
| `callFunc3` | 只挂 **动作主 tick**（`func_917` / `func_451` / dash 的 `rebellion_normal_special_n_bird_dash_tick`） | `callFunc3(rebellion_transform_start)` 或 `callFunc3(func_1073)` |
| 变形进入、锁前冲 | tick 里 **直接呼叫**（`func_72()` / `(*ptr)()` / 676-679 函数体） | 把冲刺函数当成 `callFunc3` 目标 |

本页 tick：

```c
void rebellion_normal_special_n_bird_dash_tick()
{
    func_593();
}
```

官方 `rebellion_transform_start()` / `rebellion_transform_loop()` 都不进 dash。dash 用克隆 `rebellion_normal_special_n_bird_dash_loop`：loop 的 `0x38` + start 的枪/盾/刀 `attach_in`。`0x9475130e` 仍走原 `transform_start`。

---

## 关键函数（`2.c`）

| 函数 | 角色 |
|------|------|
| `func_241(0x928ca34f, …)` | depiction 入口，必须接到 dash ENTER |
| `rebellion_enter_normal_special_n_bird_dash` | 对标 `func_916` / `ACTION_A_SHOT_BIRD` |
| `rebellion_normal_special_n_bird_dash_tick` | 对标 `func_917` |
| `rebellion_normal_special_n_bird_dash_loop` | loop 克隆：`0x38` + start 整套 `attach_in`（枪/盾/刀）。不用 `transform_loop` |
| `rebellion_normal_special_n_bird_dash_start` | 676：每帧 `dash_loop`，立刻 `252` |
| `rebellion_normal_special_n_bird_dash_shoot` | 677：init + 每帧 `dash_loop` + 30 帧计时；**不写** `sys_46` |
| `rebellion_normal_special_n_bird_dash_locked_loop_move` | 对标 `func_1073`：tick 在 593 之后直接呼叫 |
| `rebellion_normal_special_n_bird_dash_no_ammo` | 678：格式占位 |
| `rebellion_normal_special_n_bird_dash_end` | 679：无杆拆鸟；有杆 `func_81(0x77b100ff)` |
| `rebellion_transform_start` | 官方变形进入（卸手持、挂翼、`0x37`） |
| `rebellion_interrupt_bird_form_to_ground` | 拆鸟、`global143=0`、关飞行移动 |
| `func_937` | **仅**鸟形态近战格斗，dash 不再从这里进 |

特格取消窗（两处，逻辑相同，`func_233(0x7e, 0)` 后提交 `0x928ca34f`）：

- `ACTION_BC_SPECIAL_MELEE`（`0xc805dc33`）的 `func_933` 段
- `ACTION_BC_SPECIAL_MELEE_ALT_2`（`0x66eb879f`）的 `func_936` 段

---

## `0.c` 约束（现行）

不要用槽 `0x3d` 在 `func_143` 里 `func_95(0x9475130e)`。  
那会每帧抢 thinker 强制变形进入，特格接 N 后取消全失效。

`func_72()`（slot `0x17` 资格）也不要被 `0x3d` 无条件 `return 1`。

`0x928ca34f` **不是** `func_13` 的 slot hash，没有 `func_35/36` resolver。不要指望 `func_65()` 之后 0.c 自动接到 `0x77b100ff`。

---

## `func_41` 所有权

- `0x928ca34f` **不进**飞行 allowlist。
- dash 进行中：`dash_active` / `flight_loop_owned` 为真时，不要 FORCED_RECOVERY 拆 form。
- dash **结束后不要**用 `phase == 2` 继续豁免拆 form：无杆必须拆。有杆在 679 `func_81(0x77b100ff)`，不要只留 dash 旗赌空档。
- 鸟形态近战：`global143==2 && global3==0x928ca34f && !dash_active && !owned` → `rebellion_bird_n_melee_from_flight`，ENTER 转 `func_937`。

受击 / 取消 / 死亡仍走 FORCED_RECOVERY，禁止再排 `0x77b100ff`。

---

## 作废路径（不要恢复）

这些都实机失败，现行方案里不得再加：

| 做法 | 为什么失败 |
|------|------------|
| 私有 action hash / 假 slot `0x26` | 拿不到原生动作所有权，原地卡 |
| 30 帧后 `func_81(0x9475130e)` | `0x928ca34f` 无 0.c resolver，跨 hash 提交不落地 |
| `func_143` / `func_72` 用 `0x3d` 强制 enter | 每帧变形进入，无法取消 |
| 特格一进门 `dash_requested=1`，站立/方向格斗全 hijack 到 `0x928ca34f` | 所有近战变冲刺，取消也没了 |
| `callFunc3(dash_tick)` 里自己跑 phase 机，当变形主 tick | 和 `func_916` 用法相反 |
| 把 `rebellion_transform_start` 只在 ENTER 调一次 | 它是每帧状态机，只调一次停在 START |
| 679 每帧 `analog` + `locked_loop_move` 且不置 `252` | 假飞行，松杆也停不下来 |
| `func_41` 用 `phase==2` 跳过拆 form | 593 结束后仍是鸟 |
| 在 677 里写 `sys_46` 锁冲 | `func_596` 随后 `func_300(global714)`；若 453/454=0 则倍率为 0，原地不动 |
| ENTER 把 `global453`/`global454` 置 0 | Star Winning 只置 `global452=0`；453/454 留给 `func_586` 的 `0x5c`/`0x5e` |
| 锁冲后再写 `sys_46(0x1, 0x2, …, 0)` | Star Winning `func_1073` 只写 channel `0x1`；0x2 幅值为 0 会抵消前冲 |
| dash `cut_in_loop` / 676 写 `global143 = 0x2` | 形态发布切到鸟表；`0x928ca34f` 不在飞行白名单。detach 像没跑，30 帧后按住方向也不能进原生飞行。`0x2` 只属于 `0x9475130e` 的 `transform_start` / `loop` |
| 679 从近战 hash `func_81(0x77b100ff)` | 假卡死飞行。`143` 保持 `0` 时，30 帧后按住方向由地面 `0.c` 自己接原生 analog |

---

## 生命周期

| 阶段 | 现行行为 |
|------|----------|
| ENTER | 取消窗提交 `0x928ca34f`；`func_241` → dash ENTER；`dash_active=1`；`func_586`+四槽；`callFunc3(593 tick)` |
| ACTIVE start | `dash_loop` 首帧：HUD + 卸手持 + `0x38` + `attach_in`；立刻 `252` |
| ACTIVE shoot | 每帧 `dash_loop` 维持连接态 + 593 后锁冲 30 帧 |
| EXIT 有杆 | `func_81(0x77b100ff)` → 原生 `func_452` analog；不要赌 `func_41` 空档 |
| EXIT 无杆 | 679 `interrupt_bird_form_to_ground` |
| ACTIVE shoot | `0x1004000`、loop `0x38`、tick 在 593 后锁前冲 30 帧 |
| EXIT 自然 | 679：无杆拆鸟 + `252`；`func_93` 离开 hash |
| INTERRUPT | `func_41` FORCED_RECOVERY；`stop_effects` 清 dash 旗和 `0x3d` |
| RESPAWN | `func_874` → `stop_effects` |

---

## 状态所有权

| 状态 | ENTER | ACTIVE | 自然 EXIT（无杆） | INTERRUPT |
|------|-------|--------|-------------------|-----------|
| `global143` | **保持 `0`**（禁止写成 `2`） | 保持 `0` | 仍 `0` | `0` |
| `global142` | 鸟行 `0xc2b19d13` | 鸟行 | 普通 `0xc2b19d12` | 普通 |
| `global24` `0x4000` | shoot 的 `func_167(0x1004000)` | 保持 | `func_169(0x4000)` | 清 |
| `dash_active` | `1` | `1` | `stop_effects` → `0` | `0` |
| `0x3d` | 不写 | 不写 | 清 | 清 |
| 当前 hash | `0x928ca34f` | 同左 | `func_93` 离开 | 受击/idle 等 |

---

## 不要和这些混

- 飞行特格统一落地链（`0x8d96c52f` / `0x279f0da4` / `0xc0b814ff`）。
- 鸟形态近战 `0x928ca34f` → `func_937`（本页只在 ENTER 鸟分支调用）。
- TV 鸟特格落地三 hash。
- alt2 gerobi / `SUB_SHOT_CUSTOM`。

---

## 编译

游戏 repack 用 `tools/msclang.py`（legacy），不要用 `msclang_modern.py`。

```text
python tools/msclang.py E:\XB\mod\040msc\wing_gundam_zero_rebellion_msc\0.c -o E:\XB\mod\040msc\wing_gundam_zero_rebellion_msc\0.bscex
python tools/msclang.py E:\XB\mod\040msc\wing_gundam_zero_rebellion_msc\2.c -o E:\XB\mod\040msc\wing_gundam_zero_rebellion_msc\2.dscex
```

改了 `0.c` 必须一起打 `0.bscex`。只改 dash 四槽时通常只需 `2.dscex`。
