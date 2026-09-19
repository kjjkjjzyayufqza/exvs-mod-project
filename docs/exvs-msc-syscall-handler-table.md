# MSC syscall → native handler：槽位表与查找方法（OB v27）

**Date:** 2026-09-19
**Status:** E2（OB v27 `vsac27_Release.exe` IDA 构造函数直读 + 脚本用法五重互证）；单个 handler 的子命令语义仍需各自分析
**Kind:** 引擎 ABI / 逆向方法

**Related:**

- [exvs-msc-syscall-4f-native-handler](./exvs-msc-syscall-4f-native-handler.md)（本表证实了那份笔记的 slot 模型）
- [chrsysparam 动作表 native 契约](./msc-research/chrsysparam-action-table-native-contract.md)

---

## 1. 方法：syscall id → native 函数

MSC 脚本对象（`VDK::GAM::CMotionScriptAbstract` 及其派生）在自己的内存里带一张 handler 数组，
**数组从对象 +0x20 开始，`sys_N` 的 handler = `*(obj + 0x20 + 8*N)`，即反编译里的 `a1[N + 4]`。**
所以查任何 `sys_N` 只要三步：

1. 找到脚本类的构造函数（见第 2 节四个类）；
2. 在构造函数里读 `a1[N + 4] = sub_XXXXXXXX;`
3. 反编译该 handler，第一个参数 `a4[0]` 是子命令、`a3` 是脚本传参个数、`a4[1..]` 是参数。

`nu::IsolatedAllocator::GetFreeNode`（`0x1400348F0`，实体是 `xor eax, eax; retn`）是 COMDAT 折叠后的
**共享空桩**：任何槽位指向它就表示"该 syscall 在这个脚本类里什么都不做、返回 0"。

### 为什么 `+4` 成立（五条独立互证）

1. 基类构造 `sub_14067A270` 只写 `a1[4] / a1[5] / a1[6]`，而 `a1[4]` = `sub_1406915E0` 正是处理
   `0x10000 / 0x700000` 等读请求的函数——与脚本里 `sys_0(0x10000, ...)`、`sys_0(0x700000, ...)` 完全对应。
2. `a1[69]`（= 0x41 + 4）在 `CBehaviourScript` 里是 `sub_14067AE10`，其内部 RTTI 名直接写着
   `fnc_Bscr_ChrsysCommandChecker`，而 `sys_41` 的脚本用法就是 chrsysparam 指令表构建/判定。
3. **端点吻合**：`CDepictionScript` 只装到槽 97，本地全部脚本用到的最大 syscall 就是 `0x5D`（= 97 − 4）。
4. **空洞吻合**：槽 68、70..73 是空桩，对应 `0x40`、`0x42..0x45`——脚本从不使用这些 id。
5. **按类吻合**：`sys_41` 只出现在 `0.c`，而只有 `CBehaviourScript` 在槽 69 装了真 handler，
   `CDepictionScript` 的槽 69 是空桩（所以 `2.c` 调 `sys_41` 不会有任何效果）。

## 2. 四个脚本类

| 类 | 构造 | line works | 装了哪些 syscall | 对应脚本 |
|---|---|---:|---|---|
| `CAnimationScript` | `sub_140664C60` | 1 | 仅 sys_0/1/2 | — |
| `CBehaviourScript` | `sub_140664CD0` | 5 | sys_0/1/2 + sys_40(空桩) + **sys_41** | `0.c` |
| `CCharacterScript` | `sub_140664E00` | 1 | 仅 sys_0/1/2 | `1.c`（各机体都是 6 函数 glue） |
| `CDepictionScript` | `sub_140664E80` → `sub_140664F70` | 9 | sys_0/1/2 + sys_40..sys_5D | `2.c` |

公共部分：`sub_14067A890` 写 `a1[4..6]`；`sub_14067A270` 是抽象基类构造。

## 3. 槽位表（`CDepictionScript`，即 `2.c`）

| sys | slot | handler | sys | slot | handler |
|---|---:|---|---|---:|---|
| `0x00` | 4 | `sub_1406915E0` | `0x4E` | 82 | `sub_1406840C0` |
| `0x01` | 5 | `sub_140694730` | `0x4F` | 83 | `sub_140684F00` |
| `0x02` | 6 | `sub_140694640` | `0x50` | 84 | `sub_140683420` |
| `0x40` | 68 | 空桩 | `0x51` | 85 | `sub_1406856A0` |
| `0x41` | 69 | 空桩（`0.c` 里是 `sub_14067AE10`） | `0x52` | 86 | `sub_1406827A0` |
| `0x42`..`0x45` | 70..73 | 空桩 | `0x53` | 87 | `sub_140682BF0` |
| `0x46` | 74 | `sub_1406807C0` | `0x54` | 88 | `sub_140683070` |
| `0x47` | 75 | `sub_14067B5F0` | `0x55` | 89 | `sub_1406837C0` |
| `0x48` | 76 | `sub_140681910` | `0x56` | 90 | **空桩** |
| `0x49` | 77 | `sub_140685530` | `0x57` | 91 | `sub_140683A40` |
| `0x4A` | 78 | `sub_14067E060` | `0x58` | 92 | `sub_140685A90` |
| `0x4B` | 79 | `sub_14067F620` | `0x59` | 93 | `sub_1406829C0` |
| `0x4C` | 80 | `sub_140682A30` | `0x5A` | 94 | `sub_140682760` |
| `0x4D` | 81 | `sub_1406836C0` | `0x5B` | 95 | `sub_1406834F0` |
| | | | `0x5C` | 96 | `sub_140683880` |
| | | | `0x5D` | 97 | `sub_140683550` |

本地脚本实际用到的 id 集合：`0 1 2 41 46 47 48 4A 4B 4C 4D 4E 4F 50 51 52 53 54 55 56 57 58 59 5A 5B 5C 5D`（27 个）。

**`sys_56` 在构造时被装成共享空桩**，但 `2.c` 里确实有 `sys_56(0x3, …)` / `sys_56(0x4, …)` 调用。
按当前证据它在 OB v27 是无操作（返回 0）。改动依赖 `sys_56` 之前先确认这一点（是否有更晚的写入者
未做穷尽验证）。

## 4. 名字能不能像 `sys_41` 那样直接读出来

不能，`sys_41` 是孤例。真名来自 MSVC 对**函数内局部类** vftable 的修饰：

```
.?AVCDummyChrsysParamData@?7??fnc_Bscr_ChrsysCommandChecker@CMotionScriptService@GAM@VDK@@CAHPEAVCMotionScript@MSC@@PEAXHPEBH@Z@
```

RTTI 类型描述符字符串 `0x14201F880`，外层函数签名整段被编进去，于是得到
`VDK::GAM::CMotionScriptService::fnc_Bscr_ChrsysCommandChecker(VDK::MSC::CMotionScript*, void*, int, int const*)`。

全库用 `find_regex "fnc_"` 搜字符串**只有这 1 条**；`MotionScript|Bscr|Dscr|Cscr` 也只有 5 条 RTTI
字符串（`CMotionScriptDepot` / `CMotionScriptAbstract` / `CLineWork` / 上面那条 / `CMotionScript@MSC`）。
所以 `sys_58` 等没有名字可捡，只能靠子命令行为 + 脚本调用点反推语义。

**可复用的检查清单**：给定一个二进制，先 `find_regex "fnc_|Bscr|Dscr"` 捞名字泄露（局部类 vftable、
局部 static guard、`__func__` 字符串都可能漏），再回退到槽位表 + 子命令分析。
