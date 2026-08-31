# Rebellion slot 3 飛翔：鸟形态卸 HUD + 着地リロード

**Date:** 2026-08-29
**Status:** E3 实机确认成功（2026-08-29 user）；`0x16` 藏格 E3- 红色 disable；只卸不重暂停 E3- 空中提前 reload
**Kind:** HUD / ammo slot lifecycle（bird ENTER/EXIT vs native 着地リロード）
**Primary trees:**

```text
Target  E:\XB\mod\040msc\wing_gundam_zero_rebellion_msc\2.c
Source  E:\XB\mod\040msc\028gunwtv_001gunwtv_001\2.c
Vanilla E:\XB\mod\040msc\016gundmw_001wgzero_001\2.c
Param   E:\XB\mod\041cpm\wing_gundam_zero_rebellion_param\armsparam.bin
```

**Related:**

- 2026-08-22 飞行栏（slot 3/4 曾要求整段继承）：`docs/agent-sessions/2026-08-22-wing-zero-rebellion-flight-armsparam.md`
- Native `sys_4F`：`docs/exvs-msc-syscall-4f-native-handler.md`
- BindSlot / reload：`tmp/exvs2-json/armsparam-native-audit/ida-analyze-arms-accessor-construction.json`、`ida-decompile-1405bd6ba.json`
- 反证 I4 / I5：`docs/msc-research/msc-falsified-negatives-registry.md`
- 另一形态自动 reload（slot 0/1/2 group B，不是本页的 `0x15` 着地门）：`docs/msc-research/wing-zero-rebellion-unused-form-reload-group-b.md`
- 源码契约：`tools/tests/test_rebellion_bird_slot3_lifecycle.py`
- Wiki EW 飛翔：<https://w.atwiki.jp/exvs2ob/pages/209.html>
- Wiki TV ロリバス：<https://w.atwiki.jp/exvs2ob/pages/159.html>

---

## 一句话

鸟形态可以像 TV 一样 **卸掉 HUD 第 4 格（slot 3）**，但 Rebellion 这一格是 EW **飛翔**，不是 TV ロリバス。卸格之后，出鸟必须 **重绑 FLYING，并且若还在等落地就立刻再暂停 reload**。不要对 FLYING 写 `sys_4F(0x16)`。

---

## 1. Slot 3 是什么

| | Rebellion EW | TV Wing Zero |
|--|--------------|--------------|
| HUD index | `3`（栏位 0,1,2,**3**,4） | `3` |
| bind | `0xFA64E4D0` FLYING / 覚醒 `0x8D5B747A` FLYING_EX | `0xF44BB746` ROLLING_BUSTER |
| 玩家武装 | 特殊格闘 **飛翔** | 横特殊射撃 **ロリバス** |
| ammo | 1（覚醒 2） | 1，`initialAmmoCount=0` |
| type | `2` 撃ち切り，300f ≈ 5s | `2`，1440f ≈ 24s |
| 着地门 | **有** | **无** |
| 鸟形态 | 特格改走鸟近战；飞翔状态机仍要活着 | 鸟形态不用ロリバス，卸掉即可 |

TV `func_1078`：`sys_4F(0xb, 0x3, 0)`。TV `func_1077`：`sys_4F(0xb, 0x3, 0xf44bb746)`。  
可以抄「进鸟卸第 4 格」这个 **HUD 形状**，不能把ロリバス的「退出随便重绑、无需暂停」套到飛翔上。

---

## 2. 着地リロード怎么算（E1 + E2）

Wiki：撃ち切り着地後 5 秒。Type `2` 只负责打空后攒 1 发；空中不计时是 MSC 门。

| 阶段 | 谁写 | 做什么 |
|------|------|--------|
| 扣发 | `func_933` / `func_936` | `func_168(0x1000000)`；`sys_4F(0x7, 3, 1)`；`global772=1`；`sys_4F(0x15, 3, 0)` |
| 每帧 | `func_876`（鸟形态也跑） | `global24 & 0x1000000` 还在则不动；清掉且 `global772==1` → `sys_4F(0x15, 3, 1)`，`global772=0` |
| 覚醒换行 | `func_879` → `func_1034(3/4)` | 换回 FLYING 时若 `global772==1` 再 `sys_4F(0x15, 3, 0)` |
| 出击/复活 | `func_874` → `func_1034(0)` | 整栏重建；**不**写槽 3 的 `0x16` |

Native：

```text
sys_4F(0x15, slot, bool)     →  controller[+318]
+318 == 0                    →  UpdateReload 把本帧 dt 打成 0
CArmsParamManager_BindSlot   →  *(WORD*)(+318) = 257   // 318=1, 319=1
弹药在 float +216；BindSlot 的 BC040 只清进度 +240/+248，不清弹药
卸格 sys_4F(0xB, 3, 0)       →  slot 指针 NULL，FLYING 对象还在 pool 里
func_167                     →  保留 bit 0x1000000，进鸟不会单独打开着地门
```

`func_167` 的保留掩码是 `0x3d000003`，里面有 `0x1000000`。鸟飞行 analog **清不掉** 这 bit。

---

## 3. 当前契约（E3，2026-08-29）

源码：`wing_gundam_zero_rebellion_msc/2.c`

| 时机 | 调用 | 政策 |
|------|------|------|
| 进鸟 `rebellion_install_bird_weapon_bar` | `sys_4F(0xb, 0x3, 0)`；`global770=0` | HUD 第 4 格消失。不写 `0x16`，不写 `0x15` |
| 鸟形态 `func_879` | `global143 != 0x2` 才 `func_1034(3/4)` | 禁止 BindSlot 把 FLYING 挂回去。仍跑 `func_314(0xf6c1a9c1)` |
| 出鸟 / 受击 `rebellion_restore_normal_hand_weapons` | `sys_4F(0xb, 0x3, 0xfa64e4d0)`；若 `global772==1` 则 `sys_4F(0x15, 0x3, 0)`；`global770=0` | 重绑同一 FLYING 对象（弹药 +216 还在）。BindSlot 会把 318 打成 1，所以还在等落地时必须立刻再暂停。已落地则 `func_876` 已清 `global772`，318=1 正好开始 5 秒 |
| 复活 `func_874` | 只 `func_1034(0)` | vanilla 整栏。不要补 `sys_4F(0x16, 3, 1)` |
| `func_876` | 不 gate | 落地仍是唯一开 5 秒的人 |

空中解除：`global772` 仍为 1 → 重暂停 → 0/1、无倒计时。  
鸟里落地再解除：`func_876` 已把 `global772` 清 0（`0x15=1` 在指针 NULL 时是空操作）→ BindSlot 318=1 → 5 秒从落地算。

---

## 4. 作废路径（不要再提）

| # | 做法 | 实机 | 登记 |
|---|------|------|------|
| 只卸不重暂停 | ENTER `0xB,3,0`，EXIT 三参数 FLYING、不写 `0x15` | 空中就开始 5 秒 | I4 |
| Gyan `0x16` 藏格 | `sys_4F(0x16, 3, 0/1)` 写 byte 322 | **normal 槽 3 变红色 disable**。vanilla EW 从不写槽 3 的 `0x16` | I5 |
| 整段 inherit、HUD 仍显示飛翔 | 08-22 / 中途方案 A | 着地门对，用户不要鸟形态还占着原飛翔格 | 被产品否决，不是 E3- |
| `func_1034(0)` 做出入鸟恢复 | 08-22 回归 | Zero System / CS 状态被重置 | 仍禁止 |
| 鸟形态 `func_879` 整函数 `return` | 会跳过 `func_314` | 翼动画维护停掉 | 只跳过 `func_1034` |

`0x16` 在 Gyan/Delta 上是 optional assist 的可用位，不是「隐藏任意 HUD 格」。写到 FLYING 上会变成 sealed（红叉），栏位还在。

---

## 5. 源码锚点

```text
rebellion_install_bird_weapon_bar
    sys_4F(0xb, 0x3, 0);
    global770 = 0;

rebellion_restore_normal_hand_weapons
    sys_4F(0xb, 0x3, 0xfa64e4d0);
    if (global772 == 0x1)
        sys_4F(0x15, 0x3, 0);
    global770 = 0;

func_879
    if (global143 != 0x2) { func_1034(3/4) ... }
    func_314(0xf6c1a9c1);
```

`tools/tests/test_rebellion_bird_slot3_lifecycle.py` 锁的是这套契约。

---

## 6. 证据

| 结论 | 等级 | 依据 |
|------|------|------|
| slot 3 = FLYING `0xFA64E4D0` | E1 | `func_1034(0)` |
| 1 发 type 2、300f | E1 | armsparam |
| 扣发 `0x15=0`，落地 `0x15=1` | E1 | `func_933`/`876`；vanilla `016gundmw` 同文 |
| byte 318=0 则 dt=0；BindSlot 写 318=1 | E2 | IDA |
| TV 槽 3 = ロリバス | E1 | TV `func_1077` + armsparam |
| 只卸不重暂停 → 空中提前 reload | E3- | 2026-08-29 user |
| FLYING 上写 `0x16=1` → 红 disable | E3- | 2026-08-29 user |
| 卸格 + EXIT 重绑 + `global772` 时重暂停 | **E3** | 2026-08-29 user：没问题了 |
