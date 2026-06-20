# 2.c 源码证据走读：从 `func_1` 证明到可改点

样本：

```text
E:\XB\解包\com\file\0xBDBE6FEA\2.c
```

源码快照：

```text
source sha256: 1BE5DACB24FC6565680CC15C4B4045FEC80229E958D690E5AE8BABE973224589
analysis lineCount: 29664
functionCount: 1047
```

这页不是另一份术语表，而是一份源码跟读讲义。它从 `2.c` 的 depiction/action output 层开始讲。如果当前问题是“玩家按键和方向如何变成这里的 action hash”，先看 [0.c 到 2.c：输入、action hash、BD / step 边界怎么串起来](./0c-to-2c-input-action-boundary.md)。

目标是让逆向者打开 `2.c` 后，能自己证明：

- `func_1` 为什么是初始化。
- 初始化到底装了哪些系统。
- 每帧怎么从 engine 状态走到 action callback。
- 射击、援护、特格移动、格斗、镜头、shell 分别怎么追到可改点。
- 普通 BD / step 为什么不能简单等同于某个 `sys_46` 调用。

## 1. 最小结论

先把整份 `2.c` 当成一条流水线：

```text
main
  -> func_1                     启动初始化
  -> callFunc3(func_4)          注册每帧主循环

func_1
  -> func_386 / func_272        runtime/helper 初始化
  -> sys_1(0x10002,...)         基础 action callback 表
  -> func_877                   本机体 depiction/shell 初始化

func_877
  -> sys_4B / sys_4F            base shell、HUD / ammo resource
  -> func_887 / func_888        默认 shell loadout
  -> func_1042
       -> func_1043             action hash registry
       -> func_1044             slot callback registry
       -> func_1045             stance/resource registry
       -> func_1046             extra/effect resource registry

func_4
  -> func_5 / func_11 / func_12 / func_13
  -> func_44 / func_52          action commit
  -> ACTION_*                   动作 wrapper
  -> runtime driver
  -> segment output
  -> sys_4F / sys_51 / sys_46 / sys_53 / sys_4B / sys_47
```

一句话版本：

```text
func_1 建系统，func_4 跑系统，func_1043 登记动作，func_44/52 调度动作，ACTION_* 装 runtime，segment 输出真正效果。
```

这句话可以直接指导 patch 优先级：

```text
优先改 action-local segment。
谨慎改 ACTION wrapper。
不要为单招先改 func_4 / func_44 / func_1。
```

## 2. 怎么证明 `func_1` 是初始化

### 2.1 看 `main`

`2.c:779-786`：

```c
void main()
{
    sys_2(0, 0x8, func_3);
    sys_2(0, 0x6, func_26);
    sys_2(0, 0x7, func_27);
    func_1();
    global0 |= 0x1;
    callFunc3(func_4);
}
```

判断：

| 证据 | 人话 |
|---|---|
| `sys_2(... func_3/26/27)` 在最前 | 先注册 VM / depiction callback |
| `func_1()` 在 `callFunc3(func_4)` 前 | `func_1` 是主循环前的启动阶段 |
| `callFunc3(func_4)` 在最后 | `func_4` 才是每帧跑的主循环 |

所以 `func_1` 不可能是主射、格斗、BD 或镜头的某个动作。它的位置已经说明它是 initializer。

### 2.2 看 `func_1` 本体

`2.c:789-831` 的形状：

```c
global1 = 0;
global2 = func_43;
global3 = 0;
...
func_61();
func_62();
...
func_386();
func_272();
...
sys_1(0x10002, 0x2, 0xc858da63, func_45);
sys_1(0x10002, 0x2, 0x4cdc9902, func_47);
sys_1(0x10002, 0x2, 0x450c6ce4, func_484);
sys_1(0x10002, 0x2, 0x6bd334d, func_60);
...
func_877();
```

判断：

| 代码形状 | 结论 |
|---|---|
| 大量 `global1..19 = 0` | 清脚本运行状态 |
| `global2 = func_43` | 安装脚本内部 callback / fallback |
| `func_386()`、`func_272()` | 初始化 shared runtime/helper |
| `sys_1(0x10002,0x2,hash,func)` | 往 engine/action 表写 callback |
| `func_877()` | 进入本机体 depiction/shell/resource/action registry 初始化 |

人话：

```text
func_1 做的是“开机布线”：清状态、装 helper、装基础 callback、进入本机体资源和 action 注册。
```

模组判断：

- 要找“这个机体有哪些动作”，从 `func_1 -> func_877 -> func_1042 -> func_1043` 继续追。
- 要改某个动作的手感，不要直接改 `func_1`。
- 要改出生默认 shell、默认资源组、启动 callback，才回到 `func_1/func_877`。

## 3. `func_877/887/888` 不是孤立换装，而是 init 的一段

`2.c:25407-25429`：

```c
void func_877()
{
    sys_4B(0, 0xab9c3043);
    global20 = sys_4B(0x1);
    global142 = 0xc2b19d12;
    sys_1(0x60008, 0x1b12ae7d);
    sys_4F(0xb, 0, 0x1486a84f);
    sys_4F(0xb, 0x1, 0x10b251b4);
    sys_4F(0xb, 0x2, 0xa8e202bf);
    ...
    global170 = 0;
    func_887();
    ...
    func_1042();
    ...
    global1 = func_878;
}
```

判断：

| 代码 | 人话 |
|---|---|
| `sys_4B(0, 0xab9c3043)` | 建 base shell/model entry |
| `global20 = sys_4B(0x1)` | 保存 active shell entry id，后续 motion / model 操作常用 |
| `sys_4F(0xb, slot, hash)` | 初始化 HUD / ammo / weapon presentation 资源候选 |
| `global170 = 0; func_887()` | 设置默认 stance/resource group 后应用默认 loadout |
| `func_1042()` | 进入 action 和资源 registry |
| `global1 = func_878` | 安装每帧维护回调候选 |

`2.c:25522-25533`：

```c
void func_887()
{
    if (global170 == 0)
    {
        func_888(0);
    }
    else
    {
        func_888(0x1);
    }
}
```

`2.c:25534-25572`：

```c
void func_888(int arg0)
{
    if (arg0 == 0)      { func_889(); }
    else if (arg0 == 1) { func_890(); }
    ...
    else if (arg0 == 7) { func_1037(); }
    else if (arg0 == 8) { func_1038(); }
}
```

人话：

```text
func_887 是“根据当前 stance/global170 选择默认 loadout”。
func_888 是“把 loadout id 分发到具体组件组合或特殊模式进入/退出”。
```

模组判断：

- 改出生外观：看 `func_877 -> global170 -> func_887 -> func_888`。
- 改动作中临时组件：看对应 action segment 是否调用 `func_888`、`sys_4B`、`sys_47`。
- 改动作结束恢复：找是否回到 `func_887()` 或 `func_1038()`。

## 4. 每帧主循环：`func_4` 负责跑系统，不是具体动作

`2.c:873-889`：

```c
void func_4()
{
    func_19();
    func_879();
    func_5();
    func_11();
    global22 = global23 != 0;
    func_12();
    func_13();
    func_273();
    var0 = sys_0(0x10000, 0x1, 0x21);
    var1 = sys_0(0x10000, 0x1, 0x22);
    ...
}
```

判断：

| 调用 | 当前读法 |
|---|---|
| `func_19()` | 每帧状态整理候选 |
| `func_879()` | depiction/shell 每帧维护候选 |
| `func_5()` | pending action 选择候选 |
| `func_11()` | boost/cancel/gate 主逻辑候选 |
| `func_12/13()` | 外部状态、强制中断、转移候选 |
| `sys_0(0x10000,...)` | 从 engine/action state 表读状态 |

人话：

```text
func_4 是“每帧调度器”。它读取 engine 状态和脚本状态，决定当前 action 是否要切换、取消、进入或结束。
```

模组判断：

- 单招伤害、弹速、横移距离，通常不从 `func_4` 改。
- 全局 cancel、OH、落地、特殊状态切换，才回到 `func_4` 和 `func_11`。

## 5. `func_11` 是 gate，不是普通 BD 参数表

`2.c:1325-1375` 的前段形状：

```c
global42 = global43;
global44 = global45;
global43 = 0;
global45 = 0;
if (global23 == 0)
{
    ...
    if (global46) { var0 = 1; }
    else if (global11 & 1)
    {
        if ((global24 & 0x800000) != 0 && !((global24 & 0x800) != 0))
        {
            if (sys_0(0xc0005)) { ... }
        }
        ...
    }
    var2 = sys_0(0xb0003);
    if (var0 && (sys_0(0x60001) > 0 || ...))
    {
        var3 = sys_0(0xc0003);
        ...
    }
}
```

判断：

| 证据 | 人话 |
|---|---|
| 读 `global11/23/24/46` | 根据当前状态和 action flags 判断能不能继续 |
| 读 `sys_0(0xc0005)`、`sys_0(0xc0003)` | 使用 engine/native 状态槽参与 gate |
| 读 `sys_0(0x60001)`、`sys_0(0xb0003)` | 结合资源或状态值 |

人话：

```text
func_11 更像“全局 boost/cancel gate”，不是普通 BD 的速度表。
```

模组判断：

- 普通 BD 更远、step 更远、boost 总量更多：先看 `speed_param` / `character_param`。
- 某个动作能不能 BDC：先看该动作 segment 的 `func_123/125`，再看 `func_11` gate。
- OH 边界、落地硬直、全局 cancel 规则：才优先深入 `func_11` 和 `0xc000*`。

## 6. action commit：`func_44` 把 hash 变成 callback

`2.c:2615-2668`：

```c
if (global5 == 0) { return; }
...
global7 = global3;
global3 = global5;
...
sys_46(0x1, 0x1, 0, 0, 0);
sys_46(0x1, 0x2, 0, 0, 0);
sys_46(0x1, 0x4, 0, 0, 0);
sys_46(0x1, 0x3, 0, 0, 0);
...
if (sys_0(0x10003, 0x2, global3))
{
    var1 = sys_0(0x10002, 0x2, global3);
}
else
{
    var1 = 0x4438;
}
sys_2(0, 0x2, var1);
sys_1(0x10006, 0);
```

判断：

| 代码形状 | 结论 |
|---|---|
| `global3 = global5` | pending action 变成 current action |
| 清一批 `global157..169` | 重置 action-local 状态 |
| `sys_46(0x1,...)` 连续清通道 | 进入新动作前清 movement channel |
| `sys_0(0x10002,0x2,global3)` | 用 action hash 查 callback |
| `sys_2(0,0x2,var1)` | 调度查到的 callback |

人话：

```text
func_44 是“action commit”。它不是主射，也不是格斗；它负责把当前 action hash 提交给 engine/VM 去执行对应 callback。
```

模组判断：

- 如果只改某个动作，通常不要改 `func_44`。
- 如果要研究 action hash 怎么变成 `ACTION_*`，`func_44` 是关键证据。
- `func_44` 里出现 `sys_46` 不代表它是 BD 函数；这里更像进入新动作时清 movement channel。

## 7. action registry：`func_1043` 是动作目录

`2.c:29413-29470` 中最关键的条目：

```c
func_241(0xf48d2d49, ACTION_A_SHOT);                    // 射击
func_241(0x7158fa47, ACTION_A_SHOT_STATE_0);             // 射击 状态0
func_241(0x700bb2c6, ACTION_CHARGE_SHOT_LOCK_SWITCH);    // 蓄力射击 换锁分支
func_241(0x31f61d6c, ACTION_AB_SUB);                     // 副射
func_241(0x6ab85f0d, ACTION_AB_SUB_DIRECTIONAL);          // 副射 方向分支
func_241(0x23df217e, ACTION_AC_SPECIAL_SHOT_DIRECTIONAL); // 特射 方向分支
func_241(0x6ab12717, ACTION_BC_SPECIAL_MELEE_ALT_2);      // 特格
func_241(0x193fe550, ACTION_BC_SPECIAL_MELEE);            // 特格
func_241(0x178d1109, ACTION_B_MELEE);                     // 近战
func_241(0xa2236f44, ACTION_B_MELEE_DIR_1);               // 方向近战
func_241(0xe962048, ACTION_B_MELEE_DIR_2);                // 方向近战
func_241(0xa1635c24, ACTION_B_MELEE_DIR_4);               // 方向近战
func_241(0x3ac14535, ACTION_B_MELEE_VARIANT);             // 近战派生
func_241(0x8ae55bb1, ACTION_ABC_FINAL_ATTACK);            // 觉醒技
```

判断：

```text
func_1043 是 action hash -> callback 的目录。
```

注意：

- 这些注释是当前反编译输出和研究 overlay 的工作名，不是 engine 原生命名。
- action hash 不等于按键。按键、方向、状态、武装可用性先由上游 engine/input selector 处理，再进入这里。
- 动作真正输出不在 `func_1043`，而在 `ACTION_* -> runtime -> segment`。

## 8. 主射跟读：从 registry 到 `sys_4F`

### 8.1 registry

`2.c:29443`：

```c
func_241(0xf48d2d49, ACTION_A_SHOT); //射击
```

这只说明：

```text
action hash 0xf48d2d49 进入 ACTION_A_SHOT。
```

### 8.2 ACTION wrapper

`2.c:25765-25783`：

```c
void ACTION_A_SHOT()
{
    func_586();
    global677 = func_914;
    global678 = 0xffffffff;
    global680 = func_915;
    global681 = 0;
    ...
    callFunc3(func_913);
}
```

判断：

| 字段 | 当前读法 |
|---|---|
| `func_586()` | ranged runtime reset/setup |
| `global677 = func_914` | startup / action state callback |
| `global680 = func_915` | fire segment callback |
| `global681 = 0` | ammo / weapon slot 0 |
| `callFunc3(func_913)` -> `func_587()` | 跑 ranged runtime driver |

### 8.3 startup segment

`2.c:25790-25833` 的 `func_914`：

```c
global170 = 0;
func_887();
func_610(0x91351d9e, 0xd, 0xffffffff);
...
if (!(sys_0(0x90000, 0, 0) != 0)) { global137 = 0; }
...
func_123(0x280);
```

判断：

- 它处理主射开始时的 shell restore、motion/resource、ammo check、cancel route。
- `sys_0(0x90000,0,0)` 与 Notion 中“检查某 slot 武器是否空/可用”的经验一致。
- `func_123(0x280)` 是 cancel route / cancel mask 候选。

### 8.4 fire segment

`2.c:25835-25845`：

```c
void func_915()
{
    if (sys_0(0x90000, 0, 0) != 0)
    {
        func_123(0x280);
        ...
    }
    sys_4F(0, 0, 0xcc9f6df0);
}
```

判断：

```text
func_915 是主射 fire output segment。
sys_4F(0, slot, weaponHash) 是脚本向 engine 请求发射 weapon/ammo resource。
```

模组入口：

| 目标 | 改哪里 |
|---|---|
| 换主射弹体 | `sys_4F(0,0,0xcc9f6df0)` 的 weapon hash |
| 改 ammo slot | `global681` 和 `sys_4F` 第二参数，同时检查 `sys_0(0x90000,slot,0)` |
| 改主射 cancel | `func_123(0x280)` 和 `func_11` gate |
| 改伤害/弹速/判定 | `arms_param` / `bullet_param` 资源层 |

实机验证：

- 单发主射。
- 主射后 BDC，再主射。
- 空弹输入。
- reload 后再次主射。
- OH 状态下主射和落地硬直。

## 9. 特射援护跟读：方向 flag 到 `sys_51`

### 9.1 registry

`2.c:29448`：

```c
func_241(0x23df217e, ACTION_AC_SPECIAL_SHOT_DIRECTIONAL); //特射 方向分支
```

### 9.2 ACTION wrapper

`2.c:26957-26977`：

```c
void ACTION_AC_SPECIAL_SHOT_DIRECTIONAL()
{
    func_488();
    global608 = 0;
    global609 = func_952;
    global610 = 0;
    ...
    if (global87 & 0x3c)
    {
        global200 = 0x1;
    }
    else
    {
        global200 = 0;
    }
    callFunc3(func_951);
}
```

判断：

| 字段 | 当前读法 |
|---|---|
| `func_488()` | special/melee runtime reset |
| `global609 = func_952` | special runtime segment |
| `global87 & 0x3c` | 方向输入或方向状态存在 |
| `global200 = 1/0` | 是否方向派生的脚本侧 flag |
| `func_951 -> func_502()` | special movement / special action driver |

### 9.3 assist segment

`2.c:26984-27021`：

```c
if (func_309(global20, 0x1f4))
{
    if (global200 == 0x1)
    {
        sys_51(0x20000, 0, 0x2, 0, 0x5);
        sys_51(0x20000, 0, 0x2, 0x1, 0x6);
        sys_58(0x9, 0x874512c8);
    }
    else
    {
        sys_51(0x20000, 0, 0x2, 0, 0x2);
        sys_51(0x20000, 0, 0x2, 0x1, 0x4);
        sys_58(0x9, 0xa398b282);
    }
    sys_4F(0x7, 0x2, 0x1);
    func_123(0x281);
    ...
}
```

判断：

```text
func_952 是方向特射的 assist output segment。
global200 决定 assist index/type 分支。
sys_51(0x20000,0,0x2,index,type) 召唤援护。
sys_4F(0x7,2,1) 主动扣 slot 2 ammo。
```

模组入口：

| 目标 | 改哪里 |
|---|---|
| 换援护类型 | `sys_51` 的 index/type |
| 改方向分支 | `global87 & 0x3c`、`global200`、后续方向 flag |
| 改弹数消耗 | `sys_4F(0x7,0x2,0x1)` 和 slot 2 resource |
| 改可 cancel 时间 | `func_123(0x281)` 和 segment frame |

实机验证：

- N 特射、方向特射。
- 前后左右和斜方向。
- 空弹、reload、连续输入。
- BDC、OH、被打断。

## 10. 特格 / 动作内移动跟读：为什么它不是普通 BD

### 10.1 registry

`2.c:29451-29452`：

```c
func_241(0x6ab12717, ACTION_BC_SPECIAL_MELEE_ALT_2); //特格
func_241(0x193fe550, ACTION_BC_SPECIAL_MELEE);       //特格
```

### 10.2 普通特格 wrapper

`2.c:26586-26600`：

```c
void ACTION_BC_SPECIAL_MELEE()
{
    func_488();
    global608 = 0;
    global609 = func_940;
    global610 = 0;
    ...
    callFunc3(func_939);
}
```

`2.c:26602-26605`：

```c
void func_939()
{
    func_502();
}
```

判断：

```text
ACTION_BC_SPECIAL_MELEE 装的是 special runtime，真正移动在 global609 指向的 func_940，driver 是 func_502。
```

### 10.3 movement segment

`2.c:26633-26678`：

```c
if (global172 & 0x20)
{
    var1 = 0xffffffd8;
}
else if (global172 & 0x10)
{
    var1 = 0x28;
}
var2 = sys_0(0x40000, 0x3, global39) + var1 * 0x64;
global265 = func_102(var2, global204, 0);
sys_46(0, global265);
...
global204 -= 0x64;
...
sys_46(0x1, 0x4, 0, 0, 0);
sys_46(0x2, 0x3, 0, var0, 0xc8);
```

判断：

| 证据 | 结论 |
|---|---|
| `global172 & 0x20 / 0x10` | 读取左右方向 flag |
| `var1 = +/-` 常量 | 方向决定横移偏移 |
| `global204` 递减 | 动作内移动持续或衰减 |
| `sys_46(0, global265)` | 输出动作局部移动修正 |
| `sys_46(0x1/0x2,...)` | 动作内通道切换/插值/收尾候选 |

人话：

```text
func_940 是特格动作自己的 movement segment。
它能改特格横移距离和方向，不等于普通 BD / step 的全局性能。
```

### 10.4 alt 特格的移动和派生窗口

`2.c:26424-26435`：

```c
func_488();
func_219(0x769a714e);
global602 = func_936;
...
callFunc3(func_935);
```

`2.c:26520-26539`：

```c
func_296(0x3e9, 0);
sys_46(0x5, 0, 0x46, 0x64);
func_532(0x1f, 0x20, 0x64);
func_535(0, 0x3e7);
func_536(0x1, 0, func_945);
...
global183 = 0;
```

判断：

- `func_219(rowHash)` 加载动作参数 row。
- `sys_46(0x5,...)` 是动作内运动/朝向/初值通道候选。
- `func_532/535/536` 是派生或输入窗口。
- `global183 = 0` 和 Notion 中“取消不耗气”经验对应，需要结合上下文验证。

模组入口：

| 目标 | 改哪里 |
|---|---|
| 特格横移更远 | `func_940` 的 `var1`、`global204`、`sys_46` 参数 |
| 特格突进更强 | `func_219(rowHash)`、`sys_46`、motion timeline |
| 派生窗口更早 | `func_532/535/536` |
| 特格中换装 | `func_888(0x7)`、`func_1037/1038`、结束 restore |

实机验证：

- N、前、后、左、右特格。
- 红锁、绿锁、无 target。
- 命中、空挥、BDC、OH、被打断。
- 特格结束后普通 BD / step 是否没变。

## 11. 格斗跟读：motion、派生、cancel window

### 11.1 registry

`2.c:29455`：

```c
func_241(0x178d1109, ACTION_B_MELEE); //近战
```

### 11.2 ACTION wrapper

`2.c:27343-27349`：

```c
void ACTION_B_MELEE()
{
    func_488();
    func_219(0xde3d1477);
    global602 = func_966;
    callFunc3(func_965);
}
```

判断：

| 代码 | 结论 |
|---|---|
| `func_488()` | 清 melee/special runtime |
| `func_219(0xde3d1477)` | 加载 N 格动作参数 row |
| `global602 = func_966` | melee runtime 首段 |
| `func_965 -> func_489()` | melee driver |

### 11.3 第一段

`2.c:27356-27374`：

```c
func_308(global20, 0x3894dc3b, global276, 0xc8, 0);
func_94(0x5);
func_351(0, 0x1);
func_531(func_967);
...
global170 = 0x1;
func_887();
sys_58(0x9, 0xba291bf3);
func_123(0x200);
```

判断：

- `func_308` 播放 motion。
- `func_531(func_967)` 进入下一 segment。
- `global170 = 1; func_887()` 改 shell/loadout。
- `func_123(0x200)` 开 cancel route 候选。

### 11.4 派生 / 输入窗口段

`2.c:27376-27391`：

```c
func_308(global20, 0xe50205be, global276, 0, 0);
func_532(0x2, 0xd, 0x58);
func_535(0x1, 0xa);
func_536(0x1, 0xf, func_968);
func_536(0x20, 0xf, func_980);
func_536(0x4, 0xf, func_1007);
func_572(0x1, 0x4, 0x1, 0);
func_351(0, 0x4);
func_123(0x200);
func_125(0xc00000);
```

判断：

| 代码 | 当前读法 |
|---|---|
| `func_532(0x2,0xd,0x58)` | 格斗推进 / 命中后惯性 / 输入窗口准备候选 |
| `func_535(0x1,0xa)` | window start/end 候选 |
| `func_536(mask, time, callback)` | 派生输入 mask -> callback |
| `func_123(0x200)` | cancel route |
| `func_125(0xc00000)` | 追加 cancel / route / state mask |

模组入口：

| 目标 | 改哪里 |
|---|---|
| 换 N 格 motion | `func_308` motion hash |
| 派生更早或更晚 | `func_535`、`func_536` 的时间 |
| 改派生去向 | `func_536` 的 callback |
| 改追踪 / 突进 | `func_219(row)`、`func_532`、动作内 `sys_46` |
| 改伤害/判定 | 资源和 native hit handler，脚本只给入口 |

实机验证：

- 命中、空挥、绿锁、红锁。
- N 格连打、早按、晚按。
- step cancel、BDC、OH。
- 派生后 shell 是否恢复。

## 12. 镜头跟读：`func_321` 只是 preset wrapper

`2.c:7370-7373`：

```c
void func_321(int arg0)
{
    sys_53(0x4, arg0, 0x4650);
}
```

在特格 alt segment 里可以看到调用例子：

```c
if (func_544() && global36 == 0 && global241 == 0)
{
    global241 = 0x1;
    func_321(0x651e4f06);
}
```

判断：

```text
func_321(cameraHash) 是 sys_53(0x4,cameraHash,...) 的短 wrapper。
```

结合本地 `sys_53` 研究和 Notion 记录：

| case | 当前读法 |
|---|---|
| `sys_53(0x4, hash, ...)` | 启动 camera / depiction preset |
| `sys_53(0x5, ...)` | 清理 preset 候选 |
| `sys_53(0, ...)` | shake 候选 |
| `sys_53(0x2, ...)` | zoom / camera scale 候选 |

模组入口：

- 改镜头 hash：找 action segment 里的 `func_321(hash)` 或直接 `sys_53(0x4,hash,...)`。
- 防止镜头残留：找动作结束、被打断、死亡、受身路径里的 `sys_53(0x5)` 或恢复逻辑。

## 13. 普通 BD / step / BDC 应该怎么读

玩家语义来自 OverBoost wiki：

- BD 是跳跃键两次触发，可按方向移动，并能取消大多数射击 / 格斗动作。
- step 是同方向输入两次，出瞬间切诱导和枪口补正。
- boost gauge 会被跳、BD、step、变形、停足武装、格斗等消耗。
- OH 后 BD、step、变形和部分武装不可用，落地硬直变大。
- 射击ズンダ是射击之间用 BD cancel 重新进入射击，实际要同时管理 ammo 和 boost。

脚本侧要拆成三层：

```text
普通 BD / step 基础性能
  -> speed_param / character_param

能不能从当前动作 BDC / step cancel
  -> action segment 的 func_123/125
  -> func_11 + 0xc000* gate

某个动作自己的横移/突进
  -> 该 ACTION segment 的 sys_46
```

所以：

| 玩家说法 | 脚本分析入口 |
|---|---|
| 普通 BD 更远 | 资源层 `speed_param` / `character_param` |
| 主射能不能 BDC | `func_915/914` 的 `func_123` + `func_11` |
| 特格横移更远 | `func_940` 里的 `sys_46` 和方向 flag |
| 格斗 step cancel | 格斗 segment 的 `func_123/125` + `func_11` |
| OH 后能不能做动作 | `func_11`、`0xc000*`、boost consumption resource |

不要把这三层混成一个“BD 函数”。混掉后会出现这种问题：

- 改了特格横移，却以为普通 BD 也会变。
- 改了全局 gate，导致很多动作都能异常 cancel。
- 改了资源 boost，又误判为主射脚本错了。

## 14. 逆向者实际工作流

每次想改一个东西，按这个流程走：

1. 先写玩家目标，例如“主射弹速变快”或“特格横移更远”。
2. 查 `commandlist` 或 wiki 语义，把目标归类为射击、格斗、移动、镜头、shell、资源。
3. 到 `func_1043` 找 action hash 和 callback。
4. 打开对应 `ACTION_*`，看它写哪组 global：
   - `global677/680/681`：射击 runtime。
   - `global602`：格斗 runtime。
   - `global609/610`：special runtime。
   - `global170/143`：shell / 形态。
5. 顺着 `callFunc3(driver)` 找 runtime driver。
6. 找 segment output：
   - `sys_4F`：武装 / ammo / 发射。
   - `sys_51`：援护。
   - `sys_46`：动作内移动。
   - `sys_53`：镜头。
   - `sys_4B/47`：shell/model/motion/TRS。
   - `func_532/535/536`：格斗派生 / 输入窗口。
7. 判断 patch 层：
   - 只影响单招：改 action-local segment。
   - 影响基础性能：改 resource。
   - 影响全局 cancel/OH：研究 gate/native。
8. 写验证矩阵：
   - 命中、空挥、BDC、step、OH、被打断、死亡、reload、方向输入。

## 15. 动态命名写法

后续不要这样写：

```text
func_940 = BD
func_915 = 主射
func_1 = init
```

更稳的写法：

```text
semanticId: action.bcSpecialMelee.directionalMovementSegment
currentSample:
  source: E:\XB\解包\com\file\0xBDBE6FEA\2.c
  sha256: 1BE5DACB24FC6565680CC15C4B4045FEC80229E958D690E5AE8BABE973224589
  function: func_940
  lines: 26607-26726
evidence:
  - registered by func_1043 through ACTION_BC_SPECIAL_MELEE
  - global609 points to func_940
  - reads global172 direction bits
  - calls sys_46 with direction-derived values
patchRole: action-local movement segment
```

换样本后，先匹配 evidence shape，再更新 `currentSample.function`。人类讨论继续用 `semanticId`。

## 16. 当前仍需深化的区域

这些结论足够指导实际找 patch 点，但还不能写成 native 最终事实：

| 区域 | 当前能做什么 | 还缺什么 |
|---|---|---|
| `sys_46` case 参数 | 能按脚本 callsite 区分清场、动作内移动、特殊移动、格斗推进 | native handler case 解析 |
| `0xc000*` 状态槽 | 能从 `func_11` 读出 gate 参与条件 | engine 状态槽 dispatch 和实机状态对照 |
| hitbox / damage / proration | 能从 action、resource、hitgroup hash 找入口 | native hit handler 和资源表完整映射 |
| 原始按键到 action hash | 能证明 `2.c` 消费 action hash，不直接读按钮 | `0.c` 或 native input selector 的完整链路 |
| 跨机体稳定性 | 当前样本有 action hash、callback shape、syscall 输出 | 至少第二个机体样本直接读 `.c` 验证 |

## 17. 交叉引用

- 系统控制面矩阵：[system-control-surface-matrix.md](./system-control-surface-matrix.md)
- 一页式操作手册：[msc-modder-operating-manual.md](./msc-modder-operating-manual.md)
- 关键函数职责表：[2c-key-function-atlas-for-patching.md](./2c-key-function-atlas-for-patching.md)
- Notion MSC 交叉索引：[notion-msc-cross-reference.md](./notion-msc-cross-reference.md)
- input/action 研究：[../exvs-msc-input-action-weapon-pipeline.md](../exvs-msc-input-action-weapon-pipeline.md)
- camera syscall 研究：[../exvs-msc-syscall-53-notes.md](../exvs-msc-syscall-53-notes.md)
- 资源字段映射：[../command_mapping.md](../command_mapping.md)
- OverBoost wiki システム：https://w.atwiki.jp/exvs2ob/pages/593.html
- OverBoost wiki テクニック：https://w.atwiki.jp/exvs2ob/pages/683.html
- OverBoost wiki 初心者指南：https://w.atwiki.jp/exvs2ob/pages/559.html
- OverBoost wiki ブーストゲージ说明：https://w.atwiki.jp/exvs2ob/pages/560.html
- OverBoost wiki 用语集：https://w.atwiki.jp/exvs2ob/pages/82.html
