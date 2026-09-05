# Rebellion normal 特射：独立觉醒行（TWINBUSTERRIFLE / TWINBUSTERRIFLE_EX）

**Date:** 2026-09-05
**Status:** E1 source-pinned; L3 untested
**Kind:** armsparam dual row + MSC BindSlot (same shape as FLYING / FLYING_EX)
**Primary trees:**

```text
Param   E:\XB\mod\041cpm\wing_gundam_zero_rebellion_param\armsparam.bin
MSC     E:\XB\mod\040msc\wing_gundam_zero_rebellion_msc\2.c
```

**Related:**

- Slot 3 clone: [wing-zero-rebellion-slot3-flying-land-reload.md](./wing-zero-rebellion-slot3-flying-land-reload.md)
- Unused-form group B (slot 0/1/2 only): [wing-zero-rebellion-unused-form-reload-group-b.md](./wing-zero-rebellion-unused-form-reload-group-b.md)
- HUD art index: [exvs-character-weapon-icon-table.md](../exvs-character-weapon-icon-table.md)

---

## 一句话

Normal 特射 is two independent armsparam rows, swapped on `global23` like 飞翔. HUD slot 2. **Only the awakening row** uses art `0xa`. The ground row keeps ammo 2 and art 2. Bird slot 2 (`0x233C4626`) is unchanged.

---

## Rows

| | `entryId` | `actionLabel` | ammo | `fieldBb93d195` |
|--|-----------|---------------|------|-----------------|
| Normal | `0x55B03548` | `GUN_016GUNDMW_001WGZERO_001_TWINBUSTERRIFLE` | 2 | `2` |
| Awakening | `0x54424558` (`TBEX`) | `GUN_016GUNDMW_001WGZERO_001_TWINBUSTERRIFLE_EX` | 2 | `0xa` |

`0x54424558` is homemade ASCII `TBEX`, inserted in unsigned `entryId` order. Do not append after `FLYING`.

**Param identity (2026-09-05 restore):** live SHA-256 `E16F9B529CB78172DA3C1F53698F90F8EF0E00DC732F2B157AAAC849498CCF70`, size 4115. Ground row ammo/icon restored to 2/2; EX row stays ammo 2 / art `0xa`. Previous wrong build `8FF36BA5…`. Original pre-copy backup: `tmp/exvs2-json/20260905-special-shot-ex/armsparam.before.856CB86F.bin`.

Consume stays native `global681=0x2` on `ACTION_AC_SPECIAL_SHOT_ALT_2`. No `sys_4F(0x7, 2)`.

---

## BindSlot

Same gate as FLYING: `func_879` only while `global143 != 0x2`.

| Call | Slot 2 |
|------|--------|
| `func_1034(3)` awaken | `sys_4F(0xb, 0x2, 0x54424558)` |
| `func_1034(4)` awaken end | `sys_4F(0xb, 0x2, 0x55b03548, 0x54424558)` |
| `func_1034(0)` spawn | still `0x55b03548` only; next `func_879` tick swaps if `global23` |
| bird ENTER | `0x233c4626` (unchanged) |
| bird EXIT restore | `0x55b03548` then `global770=0` so `func_879` can `func_1034(3)` |

Do not `sys_4F(0x16)` on slot 2. Do not open group B on FLYING / FLYING_EX.

---

## Icon

`fieldBb93d195=10` **only on the EX row**. Ground `TWINBUSTERRIFLE` stays art 2. That index is the weapon_icon Folder child, not MSC slot 2. If the current pack Folder is still 8 children (0–7), art `0xa` is empty until the structure grows.

```text
H8  hypothesis: ground 特射 stays 2 rounds and art 2; burst swaps HUD slot 2 to TWINBUSTERRIFLE_EX with art 0xa
P8  prediction: normal stock 2 and original icon; awakening same 2 rounds but icon 0xa; leaving burst restores art 2
F8  falsifier: normal is 1 round; icon changes in normal; bird slot 2 broken; FLYING 5s starts in air
```
