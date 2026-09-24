# VDK::GAM CmdAction 系统研究

**Date:** 2026-09-20
**Binary:** `vsac27_Release.exe`（OB v27），base `0x140000000`，IDA instance `ida-37844`
**入口线索:** `.rdata` `0x0134CB58` 的死字符串 `☆ＩＦ射撃発射成功（Utility_IfShotSuccess）`
**目的:** 给 param / MSC 研究提供**消费端**语义参照，并给编辑器补一层「机体 × 武装」真名

---

## 产物

| 文件 | 内容 | 条目 |
| --- | --- | --- |
| [cmdaction-manager-dictionary.json](./cmdaction-manager-dictionary.json) | 每个武装行为类：系列 / 机体 / 变体 / 武装名 + 它构造了哪些 step 类型 | 1191 |
| [cmdaction-step-classes.json](./cmdaction-step-classes.json) | 全部叶子 / 组 step 类名 | 535 |
| [cmdaction-step-labels.json](./cmdaction-step-labels.json) | 日文 step 说明标签（结构化） | 128 |
| [cmdaction-step-glossary.md](./cmdaction-step-glossary.md) | 同上，按注册 helper 分组的可读版 | 31 helpers |

全部由 `tools/extract_cmdaction_dictionary.py` 生成，**不要手改**。

```text
python tools/extract_cmdaction_dictionary.py <path-to-exe> docs/cmdaction-research
```

---

## 30 秒版本

CmdAction 是**编译进 exe 的 C++ 行为框架**，不是数据文件。每个武装 / 子机 / 弹体的行为
写成一棵 step 树：

```text
boost::noncopyable
  └ CCmdAction_Interface
      └ CCmdAction_BaseFunction
          ├ CCmdAction_Blank / _Jump / _WaitByFrame / _ShotBullet / _WaitForShotResult / ...
          └ CCmdActionGroupAbstract
              ├ CCmdActionGroup_Series（串行，当前 step 报完成才推进）
              │   └ CCmdActionGroup_SeriesInverseEnd
              └ CCmdActionGroup_Parallel（并行 / 竞速）
CCmdActionManagerAbstract
  └ CCmdActionManager（多重继承 CCmdActionManager_StickAdapter @ +48）
      └ CCmdActionManager_<series>_<unit>_<variant>_<weapon>   ← 1191 个
```

继承链来自 RTTI `ClassHierarchyDescriptor`，不是推断。

**它不可编辑** —— 改不了文件就能改行为。它的价值是：param 字段的真实语义只有在消费端
才能确定，而 CmdAction 就是消费端之一。

---

## 字典字段

```jsonc
{
  "class": "CCmdActionManager_021DESTNY_001STRKFR_001_FunnelShot",
  "vtables": ["0x016968A8"],   // RTTI 解出的虚表 RVA
  "own_methods": 6,            // 只被这个类的虚表引用的方法数（排除共享基类实现）
  "constructs": [              // 这些方法里出现的 CCmdAction_* 虚表写入
    "CCmdActionGroup_Series",
    "CCmdAction_AimingRotateByFrame_STRKFR",
    "CCmdAction_Jump",
    "CCmdAction_ShotBulletIfValidateArmsControll",
    "CCmdAction_WaitForProjectileOrder",
    "..."
  ],
  "series": "021DESTNY",
  "unit": "001STRKFR",
  "variant": "001",
  "weapon": "FunnelShot"
}
```

`constructs` 是**行为指纹**：不还原函数体也能看出这个武装用了哪些机制（有没有 Jump 分支、
是否等待发射结果、是否做密着移动 / 回头 / 语音请求）。

---

## 可信度

| 层级 | 内容 | 依据 |
| --- | --- | --- |
| **A** | 类名、继承链、虚表槽位、对象大小、字段偏移 | RTTI + 字节，可证明 |
| **A** | `constructs` 指纹 | 虚表写入的 RIP 相对 `lea` 扫描 |
| **B** | 注册 helper 函数体语义 | 函数短、无循环、`new` + 填字段 + 挂树，反编译近似一对一 |
| **C** | 日文标签 ↔ 具体节点的绑定 | 绑定在 release 被优化掉，只能按 `.rdata` 顺序 + 语义推 |
| **D** | 原文件名 / 注释 / 局部变量名 | 不可恢复 |

**覆盖率:** 1191 个类中 1020 个（86%）有 `constructs` 指纹。剩下 171 个的虚表槽位全部
指向共享基类实现，没有独占方法可扫 —— 这些类只提供名字。

---

## 日文标签是怎么来的

`.rdata` 里有 128 条 `<日文说明>（<注册 helper 名>）` 形状的字符串，**release 版里零引用**：

- IDA `xrefs_to` 空
- 全文件搜 8 字节绝对指针和 4 字节 RVA，0 命中
- 遍历整个 `.text` 的 RIP 相对 `lea`，128 条全部 0 命中
  （同一扫描器能复现 IDA 已知的引用，工具可信）

机制：说明参数在 release 被编掉，但字面量没开 `/GF` 字符串池化（8/16 字节对齐、和虚表混在
同一 section contribution 里），不在 COMDAT，`/OPT:REF` 剔不掉，于是留了下来。

一条 helper 有几个 step 就有几条标签，顺序即执行顺序。例如 `RegisterMotionShotLazer` 的
7 条，连起来就是一整条激光发射序列的分解：射撃前待機 → 照射開始モーション → 開始モーションの
再生速度を変更 → 弾丸発射のモーションフレームまで待機 → 照射中モーション → レーザー照射中待機
→ 終了モーションを途中で停止させる。

同一个 helper 的标签会在多个 TU 里重复出现（generic helper 被内联进各机体 TU，每份自带一个
字面量副本），所以 glossary 里同一条说明可能有多个 RVA。

---

## 已验证为负的假设

**MSC action hash ≠ 任何 exe 内字符串的 CRC32。**

把 exe 里 228,154 条候选串（RTTI 类名、按 `_` 拆分的全部后缀、日文标签的 UTF-8 与 CP932
两种编码）× 5 种 CRC32 变体（zlib / 无 final xor / init 0 / init 0 + xor / BZIP2）× 3 种
大小写，去撞已知 hash `0xAE6D509D` `0xF48D2D49` `0x613494C8` `0x7F9E131D` `0x81E0F737`
→ **0 命中**。

结论：action 名字不在 exe 里，用 CmdAction 名字表反推 MSC action 名这条路是死的。
相关背景见 [`docs/msc-research/INDEX.md`](../msc-research/INDEX.md)。

---

## 一个走通的例子

`Utility_IfShotSuccess`（`sub_14069EF90`）还原后的结构：

```text
Parallel {
    Series {                                        // m_EndMode = 2
        CCmdAction_WaitForShotResult(expect = 1),   // 発射成功
        <调用方传入的 action>
    },
    CCmdAction_WaitForShotResult(expect = 2)        // 発射失敗，m_EndMode = 2
}
```

条件判定（虚表 slot 5）：

```text
CActorStatusDepot + 0x2A00 -> +0x28   ==   this + 0x20
     射撃リクエスト子对象        结果码        期待值(1/2)
```

这个「発射結果」状态机在任何 param 表里都看不到 —— 属于只能从消费端拿到的语义。
调用方只有两处：`CCmdActionManager_021DESTNY_001STRKFR_001_FunnelShot` 和
`CCmdActionManager_999TESTXX_033PLAN11_001_FunnelShot`。

完整拆解（EndMode 语义、调用方传入的语音 step、另外 4 个直接使用 `WaitForShotResult` 的
HandFly、尚未找到的结果写入方）见 [utility-ifshotsuccess.md](./utility-ifshotsuccess.md)。

---

## 怎么用

1. **param 语义交叉验证** —— 查某个字段被哪个 step 类读取，比爆破 param 表可靠。
   配合 [`docs/param-research/`](../param-research/) 的既有结论使用。
2. **编辑器标签层** —— `unit` + `variant` + `weapon` 可直接挂到现在展示数字槽位的 UI 上。
3. **MSC 术语对齐** —— glossary 里的官方措辞可替换 `docs/msc-research/` 里的推测性描述。
4. **可改性判断** —— `constructs` 指纹能区分「param 驱动（可改）」和「CmdAction 硬编码
   （只能 patch exe）」，做行为移植前先查这里。
