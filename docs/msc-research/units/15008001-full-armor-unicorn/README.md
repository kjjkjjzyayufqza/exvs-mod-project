# 15008001 全装备独角兽：特格全解 + 初始形态研究

**Date:** 2026-09-19
**Status:** E1（本机体 `0.c` / `2.c` 逐函数读取 + 动作表交叉核对）；表结构与 native 判定为 E2（见 [chrsysparam 契约](../../chrsysparam-action-table-native-contract.md)）；**任何"改了会怎样"都是 E0，未实机**
**Kind:** 单机体 MSC 页 / UI 操作手册 / 形态研究

**Sources（只读）:**

```text
Msc    E:\XB\mod\040msc\015gndmuc_008faunig_001\{0.c, 2.c, 2.txt}
Param  E:\XB\mod\041cpm\015gndmuc_008faunig_001\chrsysparam.csyspm   (96 x 128, unit 15008001)
```

**Related:** [chrsysparam 动作表 native 契约](../../chrsysparam-action-table-native-contract.md) ·
[syscall 槽位表](../../../exvs-msc-syscall-handler-table.md) ·
[证据分级协议](../../msc-evidence-grade-and-ingame-audit-protocol.md)

---

## 0. 先认清这台机的三个形态

| form | 名字 | 切换函数 | characterparam | speedparam |
|---:|---|---|---|---|
| 0 | 全装甲 | `func_1313` | `0x1B12AE7D` | `0xC2B19D12` |
| 1 | 装甲排除 | `func_1314` | `0x6C159EEB` | `0x0DE19EC6` |
| 2 | NT-D | `func_1315` | `0xF51CCF51` | `0xEA54A9AC` |

形态变量是 `global143`。`func_41` 每次把它写进 runtime 字段 `0x17`
（`sys_1(0x10000, 0, 0x17, global143)`），`0.c` 在 `global39 = sys_0(0x10000, 0, 0x17)` 读回来。
**所以只要 2.c 改了 `global143`，0.c 那边会自动跟上，不用两边都改。**

开机链路：`func_1`（脚本入口）→ `func_1293`（本机体 init）→ `func_285`（注册动作表）+ **`func_1313()`（把形态设成 0）**。

---

## 1. 用 UI 查"这招到底在干什么"（五步流程）

打开：**EXVS2 Workspace → Unit MSC Workspace**，把文件夹指到
`E:\XB\mod\040msc\015gndmuc_008faunig_001`，点 **Action table** 标签。
工具会自动配对 `E:\XB\mod\041cpm\015gndmuc_008faunig_001\chrsysparam.csyspm`，
并自动链接同目录的 `2.c`（顶栏显示 `func_285 · 275 hooks` 就是链上了）。

### 第 1 步 · 筛出要看的招

在 `Filter by row, hash or command` 里输入按键名，比如 `special melee`。
列表第二排是工具翻译好的人话：`Special melee · Any · form 0` = 特格 / 不挑杆 / 全装甲。

按键对照（表里那一列叫 `commandType`，个位十位是按键号，百位是蓄力段）：

| 号 | 按键 | UI 显示 |
|---:|---|---|
| 0 | 主射 | Shot |
| 1 | 格斗 | Melee |
| 7 | 副射 | Sub |
| 8 | 特射 | Special shot |
| 9 | **特格** | Special melee |
| 10 | 觉醒技 | Burst attack |
| 11 | 射击CS | Shot charge |
| 12 | 格斗CS | Melee charge |
| 31 / 400 | 按键选不到（派生或脚本调用） | Derived only / Script only |

形态在 `formIndex` 那一列，UI 里显示成 `form 0 / 1 / 2`。

### 第 2 步 · 点中行，读链路卡

右边最上面那张卡给你四件事：`Row N` / `actionHash` / `Group 0xXX` / `2.c handlers`。
其中 `2.c handlers` 的第一行就是**这一组的 ENTER 函数**，下面三行是**这一行专属**的
`enter` / `tick` / `exit` 钩子。工具已经把函数键解析成了真函数名，不用自己查 `func_309` / `func_437`。

### 第 3 步 · 去 2.c 搜 ENTER 函数，找四相位

用编辑器打开 `2.c`，搜 `void func_XXX()`（第 2 步拿到的那个名字），在函数体里找这四行：

```c
global670 = ...;   // START     相位 0x44D
global646 = ...;   // SHOOT     相位 0x44E
global661 = ...;   // NO_AMMO   相位 0x44F
global671 = ...;   // END       相位 0x450
```

**验证有没有找错**：进 START 那个函数，里面应该写着 `global506 = 0x44d;`。对上就没错。
有些 group 不用这套（见下面 row 7 / 49-52），那就直接读 ENTER 函数本体。

### 第 4 步 · 读四相位和钩子里的 syscall，翻译成"干了什么"

常见对照（这台机用到的）：

| 看到 | 意思 |
|---|---|
| `func_331(hash, ...)` / `func_461(...)` / `func_330(...)` | 播放动作（底层是 `sys_47(0x2, ...)`） |
| `func_220(slot, bulletHash, alt)` | 发射弹（底层 `sys_4F(0, slot, hash)`），hash 去 `bulletparam` 查 |
| `sys_51(0x20000, 0, 0x2, a, b)` | **召唤独立援护**，a/b 来自动作表字段 |
| `sys_58(0x1/0x6/0x9, hash)` | 声音 / SE |
| `sys_46(...)` | 位移、转向 |
| `func_462(global20, N)` | 到第 N/100 帧了吗（时间点判定） |
| `sys_47(0x12, 0x82d7298d, hash, ...)` | 模型部件显隐 |
| `sys_4B(0x6, modelHash, 0/1)` | 整块模型开关 |
| `global172` | 进招瞬间的方向快照（`0x04`前 `0x08`后 `0x10`左 `0x20`右） |

### 第 5 步 · 回表看这一行喂了哪些参数

四相位是**所有同组招共用的代码**，真正的差别在这一行的字段里。在 UI 右侧
`Archetype parameters` 分区（默认只显示非零列）能看到，比如 `param0x1C` 是动作 hash、
`param0x1E / 0x1F` 是援护参数。改这些**不用动 2.c**。

---

## 2. 九条特格完整清单

筛选条件：`commandType % 100 == 9`。

| 行 | form | 方向/条件 | group | ENTER | 四相位 START/SHOOT/NOAMMO/END | 行钩子 enter/tick/exit | 这招是什么 |
|---:|---:|---|---|---|---|---|---|
| 7 | 0 | 不挑杆，但要 `field 0x07 = 2` | `0x1F` | `func_356` | 不用四相位（`global654 = func_358`） | `func_1032` / `func_1033`(空) / `func_1034` | 格斗系突进，左右在钩子里分支；派生到行 8 |
| 9 | 0 | N（不挑杆） | `0x35` | `func_418` | `func_420` / `func_421` / `func_422` / `func_423` | `func_1029`(空) / `func_1030` / `func_1031` | 召唤援护 **type 8** |
| 10 | 0 | 四向任意（`0x3C`） | `0x35` | 同上 | 同上 | 同上 | 召唤援护 **type 9** |
| 24 | 1 | N | `0x35` | 同上 | 同上 | 同上 | 召唤援护 **type 8** |
| 25 | 1 | 四向任意 | `0x35` | 同上 | 同上 | 同上 | 召唤援护 **type 9** |
| 49 | 2 | N，`0x07 = 1` | `0x26` | `func_359` → `func_350` | 只有 SHOOT = `func_1311` | 无 | NT-D 突进，左右在代码里分支 |
| 50 | 2 | 左（`0x10`），`0x07 = 1` | `0x26` | 同上 | 同上 | 无 | 同上 |
| 51 | 2 | N，`0x07 = 2` | `0x26` | 同上 | 同上 | 无 | 同上 |
| 52 | 2 | 左（`0x10`），`0x07 = 2` | `0x26` | 同上 | 同上 | 无 | 同上 |

**方向是怎么分出来的？这台机三种写法都用上了，别只盯一处：**

1. **写在数据里**（行 9 vs 行 10）：两行的 `leverMask` 不同，`param0x1F` 也不同（8 / 9），
   同一套代码喂不同参数。
2. **写在钩子里**（行 7）：`func_1032` 读 `global87 & 0x20`（右）/ `& 0x10`（左），
   存进 `global963` 当左右 latch。
3. **写在四相位代码里**（行 49–52）：`func_1311` 里 `if (global172 & 0x10)` 分左 / 非左，
   两条分支播不同动作（`0xC3E85064` vs `0xE4101EF3`）和不同 SE
   （`0xC7C1E343` vs `0x16E4E027`）。

### 2.1 form 0 / form 1 的特格 = 援护召唤

`func_421`（SHOOT）里：

```c
if (global509 == 0x35) {               // global509 = 本行的 archetypeGroup
    var1 = global540;                  // = 字段 0x1E
    var2 = global541;                  // = 字段 0x1F
    sys_51(0x20000, 0, 0x2, var1, var2);
}
```

这四行的实际值：`0x1E = 0`，`0x1F` = `8`（N）或 `9`（方向）。
**想换援护叫谁出来，就在 UI 里改 `param0x1F` 这一格，不用碰 2.c。**
弹药走 `armsSlot = 3`、`emptyAmmoPolicy = 1`（没弹就走空枪路径）。
动作 `param0x1C = 0x5BB54262`，四行共用。

### 2.2 form 0 还有一条更优先的特格（行 7）

排序规则是"有方向要求的行 → 行号小的行"，所以同一形态里 **行 7 比行 9 先被检查**。
行 7 多一道 `field 0x07 = 2` 的条件门（这个字段的确切语义还没定，属 E0，
native 侧是拿 `sys_41` 的第 7/8 号参数 `global28|global29` / `global30` 做位判定）。
条件不满足才会落到行 9 的援护。要弄清它，最省事的办法是在 UI 里把行 7 的 `holdCheck07`
改成 0 或者把 `commandType` 改成 31（变成不可输入），再进游戏看特格出的是哪一招。

行 7 走的是 group `0x1F` 的另一套原型：`func_356` 只设 `global653/654/655`，
主体在 `func_358`（用 `func_330` 播动作、`sys_46(0x5, ...)` 吃 `param0x44/45/46`）。
它派生到行 8（`0xB2785575`，group `0x0C` 格斗组，调度 `0x45`，延迟 0 帧）。

### 2.3 form 2（NT-D）的特格 = 另一条路

group `0x26` 的 ENTER 只有两行：

```c
void func_350() {
    var0 = func_437(global538);   // global538 = 字段 0x1C，当成“函数键”解析
    if (var0 != 0) (*var0)();
}
```

也就是说 **NT-D 特格把 `param0x1C` 当函数键用**（`0xBF4422AE` → `func_1308`），
而不是当动作 hash。`func_1308` 自己再装相位：

```c
global670 = 0;            // 没有 START
global646 = func_1311;    // SHOOT
global671 = 0;            // 没有 END
callFunc3(func_1309);     // 每帧
func_240(func_1310);
```

所以 NT-D 特格要读的是 **`func_1308 / 1309 / 1310 / 1311`**。
`func_1311` 里按 `global172 & 0x10` 分左 / 非左，两条分支各自播动作 + 出 SE，
后面还有 `func_1303`、`func_504(0x9, 0x4)` 等。

**重要提醒**：同一列 `0x1C` 在 group `0x35` 里是动作 hash（`0x5BB54262`，解析器里查不到），
在 group `0x26` 里是函数键。**archetype 参数列的含义跟着 group 走，不能跨组套用。**

---

## 3. 让机体 init 就是形态 2（NT-D）的研究

### 3.1 现在是怎么变身的

```text
形态 0 → 1   装甲排除动作 func_1009：第 300 帧 func_1314()，随后丢装甲碎片 + 隐藏部件
形态 → 2     NT-D 变身动作 func_1066：第 300 帧 func_1315()，随后 func_1340..1343 抛装甲
                                       + 一串 sys_47(0x12, 0x82d7298d, <部件hash>) 逐段改显隐
觉醒技        func_1243 里也会按情况切 func_1314 / func_1315
```

`func_1315` 本身已经做了这些（**不需要走变身动作也能生效**）：
characterparam / speedparam / `global143 = 2` / 4 个 arms 槽 / 一大串
`sys_1(0x10001, 0x3|0x4, id, hash)` 动作覆盖 / `global812 = 3` /
`func_1360()`（`sys_4B(0x6, ...)` 整块模型开关：主模型开，另外 5 块关）。

### 3.2 最小改法（起点，不是终点）

`func_1293` 是 init，里面这一行把形态设成 0：

```c
void func_1293() {
    sys_47(0x11, global20, 0x1, 0, 0, 0, 0);
    func_1376();
    func_285();      // 注册动作表
    func_1313();     // ← 形态 0。改成 func_1315() 就是开局 NT-D
    ...
}
```

**第一版就改这一行**（单变量原则），进游戏看四件事：
数值/速度对不对、武装栏是不是 NT-D 的、模型对不对、特格出的是不是 `func_1311` 那招。

### 3.3 已知还缺的东西（预计要补）

1. **装甲部件的显隐**。`func_1315` 只切了整块模型（`func_1360`），
   而"哪些装甲部件该消失"是在 `func_1066` 里逐帧用
   `sys_47(0x12, 0x82d7298d, <hash>, 0,0,0,0)` 做的
   （`0xB529115F`、`0x4F262C3C`、`0x51EAA74C`、`0x47522936`、`0x44CFFD88`、
   `0xBEC0C0EB`、`0x1A359408` 等）。init 不走那条路，所以可能会看到"NT-D 数值 + 全装甲外观"。
   要补就把这些调用照抄进 init（**抄状态，不要抄 `func_1340..1343` 那几个抛碎片的特效**）。
2. **`func_1315` 里的 `if (global23 != 0)` 分支**（觉醒相关）在 init 时的取值未确认。
3. **HUD / 量表**：init 里原本有 `func_1367(0)` / `func_1368()`，`func_1313` 还调了 `func_1379`
   （122 行的动作 id 覆盖表），而 `func_1315` 调的是 `func_1360`。两条路覆盖的 id 集合不同，
   开局直接走 NT-D 那套是否漏了什么没核对。
4. **会不会被打回去**：`func_1314`（回形态 1）的调用点在 `func_1009` 和 `func_1243` 里，
   都挂在具体动作上，没看到"每帧倒计时到点自动回退"的写法；但 NT-D 的时限/量表逻辑
   （`global812`、`func_1367/1368`）没有完整追完，**不能断言开局 NT-D 不会自己掉回去**。
5. **复活/重开**：`func_1293` 是 init，复活如果重新走它，就会重新变成你设的形态——
   这可能正是你要的，也可能不是，需要实机确认。

### 3.4 实机验证怎么做（按协议预注册）

```text
H  假设:     把 func_1293 里的 func_1313() 换成 func_1315()，开局即 NT-D 数值 + 武装 + 模型
P  预测:     开场特格出 func_1311 那一招；速度/血量按 0xF51CCF51 / 0xEA54A9AC；武装栏 4 格
F  证伪判据: 若"外观仍是全装甲"或"一进场就掉回形态 0/1"或"特格还是援护"中任意一条成立，H 被证伪
```

一次只改这一行。如果外观不对，第二版再补 3.3 第 1 条的部件显隐，**仍然一次只加这一组**。

---

## 4. 速查表

| 东西 | 值 |
|---|---|
| 形态切换 | `func_1313`(0) / `func_1314`(1) / `func_1315`(2) |
| init | `func_1` → `func_1293` → `func_285` + `func_1313` |
| 形态变量 | `global143`；镜像到 runtime `0x17`（`func_41`），`0.c` 读作 `global39` |
| 动作表注册 | `func_285`；组解析器 `func_309`；相位解析器 `func_437`（275 个键）；取字段 `func_311` |
| 四相位口诀 | `global670`=START `global646`=SHOOT `global661`=NO_AMMO `global671`=END |
| 相位 id | `0x44D` / `0x44E` / `0x44F` / `0x450`（写进 `global505/506`） |
| 特格四相位（0x35 组） | `func_420` / `func_421` / `func_422` / `func_423` |
| NT-D 特格 | `func_1308` → SHOOT `func_1311`，tick `func_1309` |
| 变身动作 | 装甲排除 `func_1009`；NT-D `func_1066`（都在第 300 帧切形态） |
| 方向快照 | `global172 = global87 & 0x3C` |
