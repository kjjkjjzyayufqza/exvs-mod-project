# Wing Zero Rebellion：普通形态特格接 N → 鸟冲刺（`0x928ca34f` dash）

**Date:** 2026-08-25（无杆惯性 2026-08-27 实机确认）  
**Status:** 实机确认成功  
**Kind:** MSC `2.c` 普通形态特格取消窗 → 鸟形态短冲刺 → 松杆回普通  
**Primary tree:** `E:\XB\mod\040msc\wing_gundam_zero_rebellion_msc\`

**Related:**

- 鸟近战（飞行中按格斗，同一 hash，**不是**本页）：[wing-zero-rebellion-bird-melee-n-followup](./wing-zero-rebellion-bird-melee-n-followup.md)
- 鸟输入表：[wing-zero-rebellion-bird-form-0c-input-map](./wing-zero-rebellion-bird-form-0c-input-map.md)
- 打断拆 form：[wing-zero-rebellion-flight-interrupt-form](./wing-zero-rebellion-flight-interrupt-form.md)
- `func_593` 四槽：[func593-vanilla-ranged-slots](./func593-vanilla-ranged-slots.md)
- `sys_46` 通道：[sys46-script-parameter-atlas](./sys46-script-parameter-atlas.md)
- BD / `func_11`：[movement-boost-sys46-func11-map](./movement-boost-sys46-func11-map.md)
- native `sys_46` 4/F：[2026-08-01-speedparam-native-sys46-regrade](../param-research/2026-08-01-speedparam-native-sys46-regrade.md)
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

任意方向特格 **先播原版**。前格是特格窗 `func_123(0x9a5)` 的 native cancel：packed `0x4` 会把 hash 切到 `0xa2236f44`（`ACTION_B_MELEE_DIR_1`），左右格不在这个掩码里所以能进 `func_233`。现行：窗改 `func_123(0x9a1)`（去掉 `0x4`），`DIR_1` 仅在 `global7` 仍是特格时 `func_81` dash。2.c 窗内仍 `func_233(0x7e, 0)`，不要用摇杆新按下。  
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
| 触发 | 原版特格先播；取消窗 `func_233(0x7e, 0)`。特格 `func_123(0x9a1)`（不是 `0x9a5`）。`DIR_1` 仅从特格 `global7` 改交 dash |
| 提交 | `func_81(0x928ca34f, 0x1, 0x2, 0x1)`（不再按 `0x30` 分流到 `0x8b97920e`） |
| depiction | `func_241(0x928ca34f, rebellion_enter_normal_special_n_bird_dash)` |
| 左右近战取消 | 与 N/前/后相同，进 dash。`0x8b97920e` / `func_942` 仍注册，这两处取消窗不再提交它 |
| 鸟形态同一 hash | ENTER 开头 `func_937()`（格斗 + 拆 form） |
| 形态 | `global143`：`0` 普通 / `0x2` 鸟 |
| 速度行 | `global142`：鸟 `0xc2b19d13` / 普通 `0xc2b19d12` |
| 进入动作 | **不播** `0x37`。676/677 每帧 `rebellion_normal_special_n_bird_dash_loop`：loop 克隆 + start 整套枪/盾/刀 `attach_in` |
| 冲刺 loop | slot `0x38`，`func_74(0x38, 0)` |
| 锁前冲 | tick 在 `func_593()` **之后**直接调 `locked_loop_move`（对标 `func_1073`，不是 677 里写） |
| 冲刺写法 | ENTER/init **只掐一次**特格 `sys_46(0x2)`。**不要**每帧写 `0x2,0,0,1`（会把通道插值到 0，原地卡住）。**不要**为了对机头而 `sys_46(0x1,0,0,0)`。每帧 `sys_46(0, lock_err)` 对敌，再 `sys_46(0x1,0x1,yaw,0,mag)`；yaw=0 就是对敌前进。左右切向 8 帧升到 **45°**（`0x1194`），最后 12 帧收到 0，30 帧时往前冲。N：yaw=0 |
| 冲刺朝向 | 机头对锁。切向相对对锁后的机头。`global624=1` 禁止 `func_595`/`func_626` 抢转向 |
| 冲刺初速 | `S(0x5e8caf43) - S(0xff7a9c8b) * 0x1e`（鸟行约 300−(−5)×30=450） |
| 冲刺时长 | `0xbb8` = 30 帧（`func_274()` 每帧 `0x64`） |
| 无杆落地 | 惯性只存在于 dash 自己的 `sys_46(0x1, 0x1)` + `func_296(0x3e8,1)`。679 继续写这条通道并 90%/帧衰减，pitch `-20°`（`0xfffff830`）下扎。**不要**先 `func_296(0)`（会变成垂直下坠还像飞行）。**不要**改写空中 idle 的 `0x2`。有杆接原生 analog。 |

---

## 现行调用链

```text
特格 ACTION_BC_SPECIAL_MELEE / ALT_2
  -> 原版特格先播
  -> func_123(0x9a1)  // not 0x9a5; 0x4 would native-cancel to DIR_1
  -> 取消窗 func_233(0x7e, 0)
  -> 若引擎仍切到 0xa2236f44：DIR_1 见 global7 仍是特格则 func_81 dash
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
    30 帧: 252 -> 679。有杆: 不拆、立刻再 252，0.c 地面表接原生 analog。
    无杆: 拷 dash_speed 进 global508，untransform_keep_move（拆鸟、不清
    0x4000、不 296(0)）。每帧继续 sys_46(0x1, 0x1, 0, -20deg, 508)，508*=0.90。
    508<=0x14 或再 30f 才 296(0)+252。不要 0x2、不要 0xf、不要 func_287。
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

### 左右绕飞（2026-08-26）

`0x40000/5` 是**相对机头**的锁偏角，不是世界航向。把切向加进机头再沿机头飞：

```text
command = lock_err + arc
sys_46(0, command)          // 机头转到 lock+arc
sys_46(0x1, 0x1, 0, 0, mag) // 沿机头飞
```

第 0 帧机头转到锁左侧 90°。第 1 帧 `lock_err ≈ -arc`，`command ≈ 0`，机头冻结，之后一直沿这条固定斜线飞——实机就是「不会围绕，只会固定往左飞」。

现行对标两处原生：

| 来源 | 用法 |
|------|------|
| `func_522` | 左右侧飞：`sys_46(0x1, 0x1, func_101(global181 ± 0x2328), 0, mag)`，切向写在位移上 |
| analog `func_449` | `sys_46(0, func_102(..., 0xf, 0x1))` 机头只跟一部分；位移写剩余角，避免同一偏角算两次 |

右特格（`func_933` `global775==2`）会 `sys_46(0x2, 0x3, -90°, 0, 0x96)` 插值拧机头；左特格是 `+90°`。取消进 dash 后这段 lerp 还在跑，所以右特格+左格斗：**身体仍朝特格侧，人按格斗方向飞**。15%/tick 追锁拧不过 150 单位的 `0x2` 插值。

`0x40000/5` 和 `sys_46(0x1)` yaw 都相对**当前机头**。起步还对着特格侧时，后面每帧的锁偏角和切向都会在错误参考系里加。

现行：ENTER/init **只掐一次** `0x2` 插值。locked_loop 不再写 `0x2`、不再把 `0x1` 清零。每帧先 `sys_46(0, lock_err)` 对敌，再写前进（yaw=0）+ 左右 **45°**（`0x1194`）包络；最后 12 帧 yaw=0，30 帧时往敌人冲。`global624=1`。N：yaw=0。

### 30 帧无杆惯性落地（2026-08-27 实机确认）

用户确认：30 帧锁冲后不按方向，会沿冲刺方向再滑一段并略下扎，然后落地。不是原地停、不是垂直掉、不是无限飞。有杆路径未改：679 立刻 `252`，`global143=0` 时地面 `0.c` 接原生 `0x77b100ff`。

#### 为什么「继承惯性」一直失败

本 dash 的水平速度**不是**引擎 BD 剩速度。Wiki 系统页的 BD慣性ジャンプ = BD 自己的引擎向量 + 跳+杆。677 锁冲走的是脚本通道：

```text
sys_46(0x1, 0x1, yaw, 0, mag) + func_296(0x3e8, 1) + func_167(0x1004000)
```

`func_296(0x3e8, 1)` = `sys_1(0x30001, 1)`，飞行电机开着，这条 3D 向量才会被积分。关掉电机、清 mag、切动作，都没有「还能捡回来的引擎惯性」。

失败实验（按实机顺序，全部作废；表见下方「作废路径」）：

1. 无杆立刻 mag 0 + `func_296(0)` → 原地停住落地。
2. 只写 `sys_46(0xf)` → 进 679 时 `0x1` 已空，从 0 淡到 0。
3. 重写 `0x1` + `0xf` 后立刻/`下一帧` `252` → `func_93`/`func_44` mag 0。
4. 677 加窗 / `coast` 闩 → 无限飞，或一关窗又没惯性。
5. 近战 hash `func_81(0x77b100ff)` → 假卡死飞行。
6. `func_296(0)` 后改写空中 idle `0x2`，`func_287(0x3ed)` 当接地 → **保持飞行观感、垂直下坠、突然停**。`0x2` 是跳/空中 idle 平面通道；`296(0)` 先毁掉 dash 的 3D `0x1`；`func_287` 关电机后会误判接地；`func_169(0x4000)` 拆掉 dash 移动位；`stop_effects` 还会清 `dash_speed`。

抄空中 idle / 急速変形解除 N 是**对照错动作**：那些是「关电机再掉」，wiki 急速変形解除 N 本来就是真下。横惯性要对 analog `func_453`（同一条 `0x1` 每帧继续写）和「不要提早 `func_44`」。

#### 对照（先对照，再改）

| 来源 | 路径 | 用来证明什么 | 不能直接抄什么 |
|------|------|----------------|----------------|
| EXVS2OB 系统页 | https://w.atwiki.jp/exvs2ob/pages/593.html | BD 惯性是引擎剩速度，不是第二段脚本冲刺 | 不能当成本 dash 关 `296` 之后还有 BD 向量 |
| TV Zero wiki | https://w.atwiki.jp/exvs2ob/pages/159.html | 解除过程中还在动；N/前后是真下 | 不要把 N 真下抄成横惯性 |
| レイダー wiki | https://w.atwiki.jp/exvs2ob/pages/382.html | 玩家向「横惯性」来自取消后的引擎状态 | 不要在 679 里发明 `0xf` |
| Star Winning `func_1073` | `053gbftry_004strwin_001/2.c` | 锁冲：每帧 `sys_46(0x1, 0x1, 0, 0, mag)` | 679 `func_921` 只收招，不负责松杆滑行 |
| analog `func_452`/`func_453` | TV / Rebellion `2.c` | **同一条** `0x1` + `func_167(0x1004000)` + `296(1)` 每帧写 mag | 不要从近战 hash `func_81` analog |
| 跳 `func_410` / 空中 idle `func_412` | `func_69(0x8/0x9)`，`296(0)`，`sys_46(0x1, 0x2, …)` | 平面通道 + 关电机 = 跳/落地 | 禁止用 `0x2` 继承 677 |
| `natural_exit` / TV `func_1077` | 拆外观，**不清** `0x4000`，**不** `296(0)` | 无杆拆鸟必须跟这条 | interrupt 的 `169(0x4000)`+`296(0)` 会杀掉惯性 |
| sys_46 atlas / native case 4/F | `sys46-script-parameter-atlas.md`，`2026-08-01-speedparam-native-sys46-regrade.md` | `0xf`=当前向量淡到 0；`0x4`=通道倍率 | 不要把 `0xf` 当「继承」 |
| `func_44` / `func_93` / `func_598` | 动作切换清场 | 679 太早 `252` = 原地停 | 无杆必须先在 679 里把 `0x1` 写完再 `252` |
| `stop_effects` | 清 `dash_speed` / `elapsed` | 先拷 mag 再拆外观 | 不能先 `land_keep_move` 再读 `dash_speed` |

EXVS2OB wiki（玩家向，不能当 syscall 证据）：

| 页 | 玩家向事实 |
|----|------------|
| [系统](https://w.atwiki.jp/exvs2ob/pages/593.html) | BD 持续 = 跳键按住 **或** 杆按住。BD慣性ジャンプ = 剩速度 + 跳+杆。着地硬直是独立动作。 |
| [TV Zero](https://w.atwiki.jp/exvs2ob/pages/159.html) | 急速変形解除：N/前后真下；横バレルロール。解除过程中还在动。 |
| [レイダー](https://w.atwiki.jp/exvs2ob/pages/382.html) | 变形特格取消到 MS メイン = 落下 + 横惯性。 |

对照仓库 `2.c`：

| 页 | 玩家向事实 |
|----|------------|
| [系统](https://w.atwiki.jp/exvs2ob/pages/593.html) | BD 持续 = 跳键按住 **或** 杆按住。BD惯性ジャンプ = 剩速度 + 跳+杆，不是第二段脚本冲刺。着地硬直是独立动作。 |
| [TV Zero](https://w.atwiki.jp/exvs2ob/pages/159.html) | 变形特殊格闘 急速変形解除：N/前后真下降下并覆盖着地；横バレルロール。解除 **过程中** 还在动。 |
| [レイダー](https://w.atwiki.jp/exvs2ob/pages/382.html) | 变形特格取消到 MS メイン = 落下 + 横惯性。 |
| [デルタプラス](https://w.atwiki.jp/exvs2ob/pages/416.html) / [バウンドドック](https://w.atwiki.jp/exvs2ob/pages/138.html) | 急速変形解除是专用动作，不是 679 里 `0xf`。 |

对照仓库 `2.c`：

| 机体 | 函数 | 落地时写什么 |
|------|------|----------------|
| TV Zero / Rebellion 空中 idle `0xf5f21169` | `func_412` ENTER：`func_296(0x3e8, 0)`（`sys_1(0x30001,0)` 关飞行电机）。`func_413`：`sys_46(0x1, 0x2, global501, 0, global508)`，`508 *= (2*(0x64-func_274())/0x64+0x62)/0x64` | 平面惯性 + 重力下落 |
| TV Zero 急速変形解除 N `ACTION_BC_SPECIAL_MELEE_ALT_7` | wait `func_1054`：`func_296(0x3e8, 0)`，等到 `!func_287(0x3ed)` 才结束 | 动作不 `func_93` 直到接地。N 是真下，不是横惯性 |
| analog `0x77b100ff` `func_453` | 每帧继续写 `sys_46(0x1, 0x1, …, global508)` | 松杆不会自己落地；0.c 交出后 `func_44` 把 0x1 写成 mag 0 |
| `func_44` / `func_93` | `sys_46(0x1, 0x1/2/3/4, 0, 0, 0)` | 动作切换清场。679 立刻 `252` = 原地停 |

#### 生命周期 / 状态所有权（自审计，禁止再跳过）

无杆 EXIT 不是「再冲一截」，是 677 ACTIVE 的 `0x1` 所有权在 679 里延续到 mag 接近 0。

| 阶段 | 本 dash 证据 |
|------|----------------|
| ENTER | `0x928ca34f` → dash ENTER。`global143=0`。`func_167(0x1004000)`+`296(1)` 在 init_loop。`global624=1`。只掐一次特格 `sys_46(0x2)` |
| ACTIVE | tick：`func_593()` 后、且 `phase==1 && 184==2` 才 `locked_loop_move`。每帧 `sys_46(0, lock_err)` + `sys_46(0x1, 0x1, yaw, 0, mag)`。不要在 677 函数体里写 `sys_46` |
| EXIT 有杆 | 679 不拆，随后 `252`。0.c 地面表接 analog |
| EXIT 无杆 | 先拷 mag → `untransform_keep_move`（拆鸟、不清 `0x4000`、不 `296(0)`）→ `sys_46(0x4,0x4,0x64)` → 每帧 `sys_46(0x1, 0x1, 0, 0xfffff830, 508)`，`508 *= 0x5a/0x64`。`508<=0x14` 或再 30f 才 `296(0)+252` |
| INTERRUPT | `interrupt_bird_form_to_ground`：`169(0x4000)` + `296(0)`。受击必须刹住 |
| RESPAWN | `func_41` 见非 dash hash 时清 dash 旗 |

| 状态 | 写入者 | 无杆 EXIT | INTERRUPT |
|------|--------|-----------|-----------|
| `sys_46` channel `0x1` | 677 locked_loop / 679 衰减 | **继承并继续写**，pitch `-20°` | mag 0 / 关电机 |
| `sys_46` channel `0x2` | 跳 / 空中 idle | **不写** | — |
| `func_296(0x3e8)` / `0x30001` | init_loop = 1 | 滑行中保持 1；收招才 0 | 立刻 0 |
| `global24` `0x4000` | `func_167(0x1004000)` | 保持 | `func_169(0x4000)` |
| `global143` | dash 禁止写 `0x2` | 保持 0 | 0 |
| `global508` | 679 从 `dash_speed` 拷入 | 衰减所有权 | — |
| `dash_speed` | `stop_effects` 会清 | 拷走后再拆外观 | 清 |
| `global252` | 679 | mag 低或 30f 后才置 | — |

自审计红旗（本次踩过）：只看落地观感去抄空中 idle；把 `func_287` 当接地；EXIT 清了 ENTER 装上的 `0x4000`/`30001`；对照 wiki BD 却没核对本动作从未走 BD。

#### 现行 679 无杆

```text
first frame:
  coast = dash_speed
  untransform_keep_move()     // 拆鸟；不清 0x4000；不 296(0)
  sys_46(0x4, 0x4, 0x64)
  func_296(0x3e8, 1)
  sys_46(0x1, 0x1, 0, 0xfffff830, 508)   // -20deg
later frames:
  stick -> 252
  508 *= 0x5a/0x64
  仍写 0x1, 0xfffff830, 508
  508<=0x14 或 elapsed>=0xbb8 -> 296(0) + 252
```

`0xfffff830` = −20.00°。水平分量还在，略下扎。

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
| `rebellion_normal_special_n_bird_dash_end` | 679：无杆继续写 dash `0x1` 衰减；有杆 `252` 接 analog |
| `rebellion_dash_untransform_keep_move` | 无杆拆鸟外观；**不清** `0x4000`、**不** `296(0)`。对标 `natural_exit` |
| `rebellion_dash_land_keep_move` | 含 `func_169(0x4000)`。无杆 679 **不要**走这条，否则惯性被拆掉 |
| `rebellion_transform_start` | 官方变形进入（卸手持、挂翼、`0x37`） |
| `rebellion_interrupt_bird_form_to_ground` | 拆鸟、`global143=0`、关飞行移动 |
| `func_937` | **仅**鸟形态近战格斗，dash 不再从这里进 |

特格取消窗（两处，逻辑相同，`func_233(0x7e, 0)` 后提交 `0x928ca34f`）：

- `ACTION_BC_SPECIAL_MELEE`（`0xc805dc33`）的 `func_933` 段
- `ACTION_BC_SPECIAL_MELEE_ALT_2`（`0x66eb879f`）的 `func_936` 段
- `ACTION_B_MELEE_DIR_1`（`0xa2236f44`）：仅当 `global7` 仍是上面两个特格 hash 时改交 dash；站立前格不 hijack

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
- dash **结束后不要**用 `phase == 2` 继续豁免拆 form：无杆必须拆。有杆 679 `252`，地面 `0.c` 接 `0x77b100ff`；禁止从近战 hash `func_81` analog。
- 鸟形态近战：`global143==2 && global3==0x928ca34f && !dash_active && !owned` → `rebellion_bird_n_melee_from_flight`，ENTER 转 `func_937`。

受击 / 取消 / 死亡仍走 FORCED_RECOVERY，禁止再排 `0x77b100ff`。

---

## 作废路径（不要恢复）

这些都实机失败，现行方案里不得再加：

| 做法 | 为什么失败 |
|------|------------|
| 私有 action hash / 假 slot `0x26` | 拿不到原生动作所有权，原地卡 |
| 30 帧后 `func_81(0x9475130e)` | `0x928ca34f` 无 0.c resolver，跨 hash 提交不落地 |
| 特格窗保留 `func_123(0x9a5)` | bit `0x4` 是 packed 前格，引擎 native cancel 到 `0xa2236f44`；左右格不在掩码里所以 `func_233` 能进 dash，前格不行 |
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
| 无杆 679 立刻 `sys_46(0x1,0,0,0)` + `interrupt`/`func_296(0)` | 冲刺速度被掐死，原地停住落地，没有惯性 |
| 无杆只在 679 写 `sys_46(0xf)` | tick 只在 184==2 写 0x1；进 679 后向量已空，0xf 从 0 淡到 0，仍原地落地 |
| 重写 `0x1` + `0xf` 后立刻/`下一帧` `252` | `func_44` mag 0，淡没跑完 |
| 677 加窗 / `coast` 闩 | 无限飞，或一关窗又没惯性 |
| `func_296(0)` 后改写空中 idle `0x2`，用 `func_287(0x3ed)` 当接地 | 垂直下坠、仍像飞行、突然停。`0x2` 不是 dash 通道 |
| 无杆 679 走 `land_keep_move`（`func_169(0x4000)`） | 拆掉 `0x4000`，`0x1` 不再是 dash 所有权 |
| `coast==0` 再赋 `0x3e8` | 滑完被当成没开始，每帧重开 10 帧，无杆会一直飞 |
| 无杆 679 `0x1` 清零或先 `func_296(0)` | 落地继承到的是 0；关电机关掉的是 3D 飞行向量 |
| `sys_46(0, lock_err+arc)` 再沿机头飞 | `0x40000/5` 相对机头。一帧后 `lock_err≈-arc`，command≈0，固定斜线，不是绕锁 |
| 机头 `func_102` 跟 `lock+arc`（速度方向） | `sys_46(0,+)` 右转，channel `0x1` `+yaw` 左飞。右特格+左格斗：身体朝右、人往左 |
| 只 15% 追锁、不关特格 `sys_46(0x2)` | `func_933` L/R 的 `0x2,0x3,±90,0,0x96` 插值继续拧机头，追锁拧不过 |
| 机头还没对锁就写 channel `0x1` 切向 | `0x40000/5` 和 `0x1` yaw 相对机头；起步朝向错，后面每帧都算歪 |
| 每帧 `sys_46(0x2,0x3,0,0,1)` 或第一帧 `0x1` 清零 | 把位移插值/通道打成 0，30 帧原地卡住不往前飞 |
| 切向 20° 线性收到 0 | 恒定接近角，斜着冲，不围绕 |

---

## 生命周期

| 阶段 | 现行行为 |
|------|----------|
| ENTER | 取消窗提交 `0x928ca34f`；`func_241` → dash ENTER；`dash_active=1`；`func_586`+四槽；`callFunc3(593 tick)` |
| ACTIVE start | `dash_loop` 首帧：HUD + 卸手持 + `0x38` + `attach_in`；立刻 `252` |
| ACTIVE shoot | 每帧 `dash_loop` 维持连接态 + 593 后锁冲 30 帧 |
| EXIT 有杆 | `func_81(0x77b100ff)` → 原生 `func_452` analog；不要赌 `func_41` 空档 |
| EXIT 无杆 | 679 重写 `0x1` 当前速度 + `0xf` 淡出，`dash_land_keep_move` 不 `func_296(0)`，让落地继承 |
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
