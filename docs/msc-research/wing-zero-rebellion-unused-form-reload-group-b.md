# Rebellion 切飞行：另一形态自动 reload（group B）

**Date:** 2026-08-31
**Status:** E3 实机确认成功（2026-08-31 user）；native 选时长 E2；MSC 不是这台开关
**Kind:** armsparam idle-form reload / BindSlot slot 9
**Primary trees:**

```text
Param   E:\XB\mod\041cpm\wing_gundam_zero_rebellion_param\armsparam.bin
Ref     E:\XB\mod\041cpm\002zgundm_006hambrb_001\armsparam.bin
MSC     E:\XB\mod\040msc\wing_gundam_zero_rebellion_msc\2.c
        E:\XB\mod\040msc\002zgundm_006hambrb_001\2.c
```

**Related:**

- Slot 3 飛翔着地门（另一套 reload）：`docs/msc-research/wing-zero-rebellion-slot3-flying-land-reload.md`
- 2026-08-22 飞行栏建行：`docs/agent-sessions/2026-08-22-wing-zero-rebellion-flight-armsparam.md`
- I4 空中提前 reload：`docs/msc-research/msc-falsified-negatives-registry.md`

---

## 一句话

切飞行会把地面那几行从 HUD **卸下来**。卸下来的武装只走 **group B** 计时。Rebellion 从 EW 抄来的行 `reloadGroupBEnabled=0`，闲置时长就是 0。Hambrabi 成对步枪开了这个开关。2026-08-31 只把 6 行成对武装改成 `1`，实机确认另一形态会自动回弹。不要给 FLYING 开。

---

## 1. Native（E2）

`sys_4F(0xB)` → `CArmsParamManager_BindSlot`：旧 controller `+208 = 9`（unbound）。

`CArmsController_SelectReloadDurations`（`0x1405BCCE0`）：

- 还挂在 HUD 槽上 → group A（`reloadDurationGroupA*`）
- `+208 == 9` 且 `+0x48` / hash `0xB686E88C` / `reloadGroupBEnabled` **非 0** → group B
- slot 9 且该 flag **为 0** → 时长写成 **0**，闲置不回弹

mode-4 adapter（`sys_4F(0xB, slot, new, old, 0x4)`）只共享 charge、不拷 ammo。它不是闲置回弹开关。三参数硬绑同样把旧行打成 slot 9。

---

## 2. 对照（E1 inspect）

Hambrabi：slot 0 `BEAMCANNON` 两形态都不换，`reloadGroupBEnabled=0` 没问题。slot 1 `BEAMRIFLE` / `BEAMRIFLE_MA` 成对换行，flag=`1`，group B 比 A 长。

Rebellion 切飞行换 slot 0/1/2。改前 11 行 flag 全是 0。`TWINBUSTERRIFLE` 的 group B 数值（1020f）本来就写着，只是开关没开。

---

## 3. 改了什么（单变量）

只改 Param，不改 MSC。6 行 `reloadGroupBEnabled` 0 → 1：

| entryId | 标签 | HUD |
|---|---|---|
| `0x750B4B8E` | BUSTERRIFLE | 地面主射 |
| `0x77A3426B` | trans_mode_main | 鸟主射 |
| `0x11BE199D` | ASSIST | 地面副射 |
| `0x04DC0DEE` | trans_mode_sub | 鸟副射 |
| `0x55B03548` | TWINBUSTERRIFLE | 地面特射 |
| `0x233C4626` | trans_mode_special_shot | 鸟特射 |

未改：`0xFA64E4D0` FLYING、`0x8D5B747A` FLYING_EX、Zero System、MACHINECANNON。

```text
before  SHA-256 2388C188437646B25C397FFD27E0CBC86D43F356198671918C6952609DB7D406
after   SHA-256 A63B5886D0E7541003EFEE808D292C419A46D4C3AB623069775BD7B487DDBF31
size    3836 both; roundtrip byteIdentical
backup  tmp/exvs2-json/20260831-flight-mode-reload-compare/armsparam.before.2388C188….bin
```

---

## 4. 实机（E3，2026-08-31 user）

```text
H  6 行开 group B 后，切形态时闲置那一套会自动回弹
P  打空地面枪 → 进鸟等数秒 → 出鸟，弹数增加；反向同样
F  出鸟仍是空仓，或 FLYING 在空中自己开始 5 秒
```

用户回报 **修复了**。F 未触发。MSC 未改。

---

## 5. 不要再做

| 做法 | 为什么 |
|---|---|
| 用 MSC `sys_4F(0x15)` 去“启动另一形态 reload” | 闲置回弹是 Param group B，不是 slot-3 着地门 |
| 给 FLYING / FLYING_EX 开 group B | 鸟里 slot 3 被 `sys_4F(0xB,3,0)` 卸掉；开了会在空中自己倒 5 秒（I4 同类） |
| 只把 slot 1/2 改成 mode-4 当修法 | mode-4 管 charge/ammo 继承，不管 slot 9 时长 |
| `func_1034(0)` 做出入鸟恢复 | 会重置 Zero System / CS；08-22 已否 |

---

## 6. 证据

| 结论 | 等级 | 依据 |
|---|---|---|
| BindSlot 旧行 `+208=9` | E2 | IDA `CArmsParamManager_BindSlot` |
| slot 9 用 group B，flag 0 则时长 0 | E2 | IDA `SelectReloadDurations`；gate hash `0xB686E88C` |
| Hambrabi 成对步枪 flag=1，主炮 flag=0 | E1 | `exvs2-json inspect` |
| Rebellion 改前 11 行 flag=0 | E1 | 同上 |
| 6 行开 flag 后另一形态会自动回弹 | **E3** | 2026-08-31 user |
| FLYING 不要开 group B | E2 推断（未在本 build 故意打开） | 鸟卸 slot 3 + I4 |
