# Utility_IfShotSuccess：「射撃発射成功なら実行」

**Date:** 2026-09-22
**Status:** 结构与运行规则 E2（exe 字节反汇编确认）；结果码 1/2 的含义 E0（由死字符串标签推出）；玩家可见行为未实机
**Binary:** `vsac27_Release.exe`（OB v27），base `0x140000000`
**方法:** IDA 未开启。复用 `tools/extract_cmdaction_dictionary.py` 的 PE / RTTI / `.pdata` 解析，
用 capstone 对 exe 做静态反汇编。一次性探针脚本没有入库（`AGENTS.md` 禁止提交反汇编清单）。
**Related:** [README](./README.md) · [cmdaction-step-glossary](./cmdaction-step-glossary.md)

---

## 一句话

`sub_14069EF90` 把传进来的一个 step 包成「射击请求结果 = 成功才执行，= 失败就跳过」，
再挂到父组上。OB 里唯一的用途是：**Strike Freedom 的龙骑兵第一发真的打出去了，才喊一句台词。**

---

## 1. 那串日文到底是什么

`.rdata 0x0134CB58` 的 `☆ＩＦ射撃発射成功（Utility_IfShotSuccess）` **不是 printf / 日志，也不是注释**。
它是一个传给注册 helper 的说明字符串参数：release 版里用它的代码被编掉了，字面量本身留了下来，
全 exe **零引用**（依据见 [README §日文标签是怎么来的](./README.md)）。

```js
// Source side (inferred): the label is an ordinary string argument.
function Utility_IfShotSuccess(parent, ctx, action) {
  parent.add(new Parallel("☆ＩＦ射撃発射成功（Utility_IfShotSuccess）", [/* ... */]));
}

// Release side: the literal survives in .rdata, but nothing reads it.
const label = "☆ＩＦ射撃発射成功（Utility_IfShotSuccess）";
function sub_14069EF90(parent, ctx, action) { /* same tree, no name */ }
```

注意：exe 里的函数没有名字。把 `sub_14069EF90` 认作 `Utility_IfShotSuccess`，
是按内容对上的（它构造「等成功 = 1 / 等失败 = 2」），exe 本身不提供这层绑定。

---

## 2. 它构造的树

```text
parent->AddChild(                                   // parent vtable +0x80, tail call
  Parallel {                                        // 0x80 bytes, ctor sub_14068DAF0
    Series [EndMode=2] {                            // 0x118 bytes
      WaitForShotResult(expect = 1),                // 0x28 bytes
      <action passed by the caller>
    },
    WaitForShotResult(expect = 2) [EndMode=2]
  })
```

`WaitForShotResult` 的判定（vtable slot5，`sub_1406A4760`）：

```text
[[this+0x08] + 0x2A00] + 0x28  ==  this + 0x20
  ctx = CActorStatusDepot        result     expected (1 / 2)
```

`+0x2A00` 不是普通字段，而是 `CActorStatusDepot` 构造函数（`sub_140600B50`）清零的那张组件指针表
（`+0x29B8`..`+0x2A58`，共 21 格）里的一格。

---

## 3. 运行规则（为什么它能当 if 用）

| 规则 | 依据 | 等级 |
|---|---|---|
| step 结束 = slot5（自身条件）‖ slot6 ‖ slot7 | `sub_140672A20` | E2 |
| Series 只有在当前子节点结束后才推进 | Series slot12 `sub_14068A6F0` | E2 |
| `+0x1C` = EndMode；**EndMode=2 = 「我结束，父组也跟着结束」** | 见下两行 | E2 |
| Parallel 结束 = 全部子节点结束，或任一 EndMode=2 的子节点结束 | Parallel slot5 `sub_1406A23A0` | E2 |
| Series：结束的子节点若 EndMode=2，置 abort 标志 `+0x22`，后续步骤跳过 | `sub_14069B4F0`，Series slot5 `sub_14068AED0` | E2 |
| 父组 AddChild = vtable `+0x80`（slot16） | Series `sub_140689770`，Parallel `sub_14068DD80` | E2 |

三种结果：

| 结果码 | 行为 |
|---|---|
| 1（成功） | Series 放行，执行 action；Series 结束（EndMode 2），整个 Parallel 结束 |
| 2（失败） | 失败分支结束（EndMode 2），Parallel 立即结束，action **不执行** |
| 其他（如 0） | 两个分支都在等，直到结果确定 |

---

## 4. 相关对象布局

| 对象 | 偏移 | 含义 | 等级 |
|---|---|---|---|
| step 基类 | `+0x08` | ctx（CActorStatusDepot） | E2 |
| | `+0x10` | slot1 返回它；初值哨兵 `0xFFFFFF0F`；slot6 在它 `> 0x5FA` 且 `+0x14 == 0` 时返回 true | E2（含义未知） |
| | `+0x1C` | EndMode（默认 0） | E2 |
| | `+0x20` | 子类参数；`WaitForShotResult` 的期望值 | E2 |
| Series | `+0x30` / `+0xF0` | 子节点数组（24 格）/ 数量 | E2 |
| | `+0xF8` / `+0xFC` | 当前索引 / 上一个索引 | E2 |
| | `+0x22` / `+0x26` | abort 标志 / 首帧保护（首次 Update 清零） | E2 |
| Parallel | `+0x28` / `+0x78` | 子节点数组（10 格）/ 数量 | E2 |
| `[depot+0x2A00]` 组件 | `+0x10` / `+0x20` / `+0x24` | vec4 / dword / float，由 Move\* / Rotate\* 系 step 读写（像是移动目标坐标、状态、速度） | E0 |
| | `+0x28` | 发射结果码 | E2（读取方）；写入方未找到 |

---

## 5. 用在哪

只有两处调用，给的 action 都是 `CCmdAction_SendVoiceTableRequestMessageAsActor`，语音 ID `0x81EFA1F7`：

| Manager | 调用点 |
|---|---|
| `CCmdActionManager_021DESTNY_001STRKFR_001_FunnelShot` | `0x1410564F8`（slot14 `sub_141056160`） |
| `CCmdActionManager_999TESTXX_033PLAN11_001_FunnelShot`（测试机复制品） | `0x140F1D438`（slot14 `sub_140F1D0A0`） |

FunnelShot 主 Series 的 step 顺序：

```text
Blank → WaitForProjectileOrder → AimingRotateByFrame
  → ShotBulletIfValidateArmsControll                  // first shot
  → IfShotSuccess(voice 0x81EFA1F7)                   // only if the precondition below holds
  → Jump → WaitByFrame(2) → ShotBulletIfValidateArmsControll → SetHasShotLaser
  → Jump → WaitByFrame(2) → ShotBulletIfValidateArmsControll → SetHasShotLaser
```

- **前置条件：** 只有 `[ctx+0x29C0]+0x10 == [manager+0x128]` 时才挂上这句台词。两个字段的含义未确认。
  （E0 猜测：只让多基龙骑兵中的一基带台词。）
- `521DESTNY_708STRKFR_001_FunnelShot` 这个变体没有语音 step，也不调用本函数，两边对得上。
- **`WaitForShotResult` 还有 4 个直接使用者**，它们不经过本函数，而是在
  `ShotBulletIfValidateArmsControll` 后手写 Wait(1) / Wait(2)：
  `001GUNDAM_004ZEONG0` · `601GUNDAM_007PZEONG` · `603ZZGNDM_001PSYGN2` · `745MISING_002ZK2PSY`（均为 `_001_HandFly`）。
  README 写的「调用方只有两处」只针对本函数。

---

## 6. 未解决

1. **谁写 `+0x28` 的 1 / 2 —— 没找到。** 静态扫描里没有「拿 `[depot+0x2A00]` 写 `+0x28`」
   或「以它为 `this` 调方法」的代码。间接证据：6 处用法全部紧跟 `ShotBulletIfValidateArmsControll`，
   该 step 通过 `[depot+0x29D0]` 把射击交给武装系统（`sub_1406A5D30` / `sub_14063C3E0`），
   结果大概率由那条链路回写。「失败」具体指没弹、冷却中还是武装控制校验不过，目前只是按类名推测（E0）。
2. **结果何时清零未知。** 如果上一发的 1 残留，本函数可能直接放行。
3. **基类 slot6 的 `+0x10` 是谁写的未追。** 它决定结果一直不来时 step 会不会超时退出。
4. 第 5 节前置条件里的两个字段含义。

下一步：打开 IDA 对 `[depot+0x2A00]` 组件的 `+0x28` 做字段交叉引用，
并从 `sub_1406A5D30` / `sub_14063C3E0` 往下追写回点。
