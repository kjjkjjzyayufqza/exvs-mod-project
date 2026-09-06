# Rebellion 零式系统：一命一次

**Date:** 2026-09-05  
**Status:** E1 source + E1 inspect（待实机）  
**Kind:** MSC slot-4 bind + armsparam loading/ready pair  
**Primary trees:**

```text
MSC    E:\XB\mod\040msc\wing_gundam_zero_rebellion_msc\2.c
Param  E:\XB\mod\041cpm\wing_gundam_zero_rebellion_param\armsparam.bin
```

**Related:**

- Vanilla EW: `016gundmw_001wgzero_001` `func_1030`–`func_1034`
- 不整栏 `func_1034(0)` 出入鸟：[unused-form-reload-group-b](./wing-zero-rebellion-unused-form-reload-group-b.md)
- CSB 入口：[cs-action-charge-slot-consumption](./cs-action-charge-slot-consumption.md)

---

## 一句话

第五格是两行轮换。`0xD7FCDE2` `ZEROSYSTEM` 是 **reload 显示行**（type 2、1500 帧、开局空仓），占着格子就会转条。`0x9398CED9` `ZEROSYSTEM_START` 才是能放的就绪行。开局直接绑 START；用完 **卸格**，不要再把 loading 行绑回去。复活再绑 START。

---

## 两行（E1 inspect 2026-09-05）

| entryId | label | 角色 |
|---------|-------|------|
| `0xD7FCDE2` | `ZEROSYSTEM` | loading / reload HUD。`ammoCount=1`，`initialAmmoCount=0`，`reloadBehaviorType=2`，group A default **1500f**，`reloadAuxGroupA=600`（= MSC `global778` / `global779`） |
| `0x9398CED9` | `ZEROSYSTEM_START` | 就绪 CSB。`ammoCount=100`，原 `initialAmmoCount=0`，`reloadBehaviorType=0`，`chargeInputFlags=2` |

Vanilla：`func_1034(0)` / `func_1032` 绑 loading 行，native 自己转 25 秒条；MSC `global774` `2→3` 再换成 START。只停 MSC timer、仍绑 `0xD7FCDE2`，格子上照样 reload。

---

## 改了什么

MSC：

| 点 | 现行 |
|----|------|
| `func_1034(0)` | 绑 `0x9398CED9`，不绑 `0xD7FCDE2` |
| `func_1030` | `global774=3`，`sys_4F(0x8,4)` + `sys_4F(0x11,4,1)`。不开 `1→2` 充能 |
| `func_1032` | `sys_4F(0xb, 4, 0)` 卸格（同 `func_1034(2)`）。`global774=0x5` |

Param（size 4115 未变）：

| 行 | 字段 |
|----|------|
| `0xD7FCDE2` | 全部 group A/B reload 时长和 `reloadAuxGroupA` → **0**（万一仍被绑也不会转条） |
| `0x9398CED9` | `initialAmmoCount` 0 → **100**（开局 BindSlot 有弹） |

```text
before  SHA-256 E16F9B529CB78172DA3C1F53698F90F8EF0E00DC732F2B157AAAC849498CCF70
after   SHA-256 755B989EBBB6974643D1D5A2F7D1B66AE6B2654569D8100FE92D6F8484683185
backup  tmp/exvs2-json/20260905-zero-system-once/armsparam.before.bin
```

```text
H  开局第五格是 START；用完卸掉 loading 行，本命不再转条、不能再放；复活再满
P  出击就能零式一次；用完第五格空；死前不能再放；复活又能一次
F  开局仍在转 loading 条；用完第五格又出现 reload；或复活后整命没有
```

---

## 生命周期

| Phase | `global774` | slot 4 |
|-------|-------------|--------|
| RESPAWN `func_874` | `3` | `0x9398CED9` + unpause |
| ENTER 使用 | `4` | START，pause/consume |
| EXIT / 打断 `func_1032` | `5` | **unbind** |
| ACTIVE 已用完 | `5` | 空 |
| 出入鸟 | 继承 | 不 `func_1034(0)` |

---

## 不要再做

| 做法 | 为什么 |
|------|--------|
| 用完再绑 `0xD7FCDE2` | 这就是 reload HUD，会占第五格转条 |
| 出入鸟 `func_1034(0)` | 会重置 Zero System / CS |
| `func_1034(1)` 觉醒时绑回 START | 本命第二次就绪 |
| 给 Zero System 开 group B | 闲置回弹不是这台开关 |
| `sys_4F(0x16)` 藏 slot 4 | I5 同类；卸格用 `0xB` |
