# TV Wing Zero 飞形态特格落地：要对到 Rebellion 的复制清单

**Date:** 2026-08-17  
**Status:** 2026-08-22 Rebellion N 空中单阶段已实机通过；完整落地/左右仍待做。
**Kind:** 闭包 B 武装移植前置  
**Primary trees:**

```text
Source MSC     E:\XB\mod\040msc\028gunwtv_001gunwtv_001\
Source Motion  E:\XB\mod\003motion\001hito_028gunwtv_001gunwtv_001
Target MSC     E:\XB\mod\040msc\wing_gundam_zero_rebellion_msc\
Target Motion  E:\XB\mod\003motion\wing_gundam_zero_rebellion_motion
```

**Related:** 闭包 B 形态特格组见 [transform-port-plan §2.2](./2026-08-09-wing-zero-rebellion-transform-port-plan.md)。鸟 `0x200` 现状见 [bird-form-0c-input-map](./wing-zero-rebellion-bird-form-0c-input-map.md)。

---

## 一句话

TV 飞形态「特格落地」在 `0.c` 里是 **3 个 action hash**（左 / 右 / N），动作资源能清楚数出 **4 组要复制的 motion**。  
Rebellion 鸟形态 `0x200` 已接 TV N action hash `0xC0B814FF`。当前只有一组 target body+wing Folder：`trans_te_motion_stk_air_fr_out`，structure raw `unk1=1ee99211`，MSC Runtime `0x1192E91E`；N 落地、左右俯冲和收招仍未完成。

不是地面 4 向特格（`0xe35b996c` / `0xd55f840` / `0x2f5f1a92` / `0x22051a36`），也不是 Rebellion 现成的跳起特格 `15flight11a` / `35flight11a` / `maenobori11a`。

---

## 四个要复制的 motion 组

| # | 玩家向 | Runtime ID | LE `unk1` | 形态 | 类型 | 规范名核心 |
|---|--------|------------|-----------|------|------|------------|
| 1 | N 空中段 | `0x72394A81` | `814a3972` | 已拆鸟、普通身 | Folder ×5 | `40tkkneo2stk11a_stk_air_fr` |
| 2 | N 落地段 | `0x63327DCF` | `cf7d3263` | 已拆鸟、普通身 | Folder ×5 | `40tkkneo2stk11a_stk_gnd_fr` |
| 3 | 左俯冲 | `0xD25BE7EB` | `ebe75bd2` | 仍在鸟 `body_tf` | direct Item | `032gwtvTR_..._35tkkneo2kam_sht_air_lf` |
| 4 | 右俯冲 | `0xF5A3A97C` | `7ca9a3f5` | 仍在鸟 `body_tf` | direct Item | `032gwtvTR_..._35tkkneo2kam_sht_air_rt` |

TV `0.c` 鸟 `0x200` 没有单独的「后」hash：`0x4` 前进和松开都进 N。不要为了对齐地面四向去发明第四个 hash。

### 1 / 2：N 特格 Folder 五个通道

两套 Folder 子项一一对应，只是 `_air` / `_gnd`：

| 通道 `unk2` | 文件核心 |
|-------------|----------|
| body `4af2f09d` | `001hito_028gunwtv_001gunwtv_001_40tkkneo2stk11a_stk_{air,gnd}_fr` |
| wing `bd317fff` | `482gwtvwing_..._wing00_40tkkneo2stk11a_stk_{air,gnd}_fr` |
| rifle `a7b347e5` | `400stick_..._brifle00_t_40tkkneo2stk11a_stk_{air,gnd}_fr` |
| shield `d5af02ff` | `400stick_..._shiled00_40tkkneo2stk11a_stk_{air,gnd}_fr` |
| saber `2d273ac9` | `400stick_..._bsaber00_r_40tkkneo2stk11a_stk_{air,gnd}_fr` |

`func_308` 播 Folder 的 runtime ID（`0x72394A81` / `0x63327DCF`），不是单个 nuanmb。

### Rebellion 当前 N 空中单阶段（2026-08-22）

| 用途 | Target Folder | structure raw `unk1` | MSC Runtime | 通道 |
|------|---------------|----------------------|-------------|------|
| 鸟特格 N 空中 | `trans_te_motion_stk_air_fr_out` | `1ee99211` | `0x1192E91E` | body `9c5e24c7` + wing `c1a9c1f6` |

身体动作源自 `001hito_028gunwtv_001gunwtv_001_40tkkneo2stk11a_stk_air_fr`，翼使用 Rebellion 自制 `wing00` clip。当前 handler 在 motion 结束时直接退出；不会调用 TV N 落地 `0x63327DCF`。

实机确认：鸟形态特格可进入 `0xC0B814FF`，新 Folder `0x1192E91E` 的 body 与 wing 同步播放，motion 结束后安全退出。

### 3 / 4：左右是 `body_tf` 单 Item

和变形 enter/loop/exit 一类：`type=Item`、`unk2=00000000`、前缀 `032gwtvTR`。  
只在鸟形态（已加载 source `body_tf`）下能直接播。

---

## 附属（要一起带，但不算「四个」）

| 用途 | Runtime ID | 说明 |
|------|------------|------|
| 左右收招 | `0xFBC136EF` (`ef36c1fb`) | Folder ×2：`kamae_stk_air_fr` + `bsaber00_r_kamae_stk_air_fr`。左右俯冲结束 `func_1077` 拆鸟后再播 |
| 左右刀光 | `sys_4A(0, 0x3728d323, 0xa341f1ef, …)` | 挂在鸟 root `0xA341F1EF` |
| SE | `sys_58(0x9, 0x78f8e1f0)` / `sys_58(0, 0xaca6604a)` / `sys_58(0x6, 0x7578e138)` / 结束 `0x9c1b440d` | 未在 target effect 包按 hash 命中；落地前再对 TV effect / nus3bank |

**不要抄 TV `func_1077`。** Rebellion 拆鸟必须走已有 `rebellion_interrupt_bird_form_to_ground` / normal restore。

---

## MSC：3 hash + 2 handler

| 输入 | TV hash | `2.c` | 播什么 |
|------|---------|-------|--------|
| 鸟特格 + 左 `0x10` | `0x8D96C52F` | `ACTION_BC_SPECIAL_MELEE_ALT_5` | `0xD25BE7EB` → 拆鸟 → `0xFBC136EF` |
| 鸟特格 + 右 `0x20` | `0x279F0DA4` | 同上，`global781` 分流 | `0xF5A3A97C` → 拆鸟 → `0xFBC136EF` |
| 鸟特格 其它（N / 前 / 后） | `0xC0B814FF` | `ACTION_BC_SPECIAL_MELEE_ALT_7` | 先拆鸟 → `0x72394A81` → `0x63327DCF` |

Rebellion 当前：

```c
// 鸟分支 0x200
func_95(0xc0b814ff, ...);   // TV N special-melee action hash
```

`2.c` 已只注册 `0xC0B814FF → ACTION_BC_SPECIAL_MELEE_BIRD_N`。左右 `0x8D96C52F` / `0x279F0DA4` 尚未注册；地面特格 `0xC805DC33` / `0x66EB879F` 不动。

接线顺序（授权后再做）：

1. 已完成：N 空中 body+wing Folder `0x1192E91E`。
2. 已完成：`0xC0B814FF` 单阶段 target handler，拆鸟使用 Rebellion 幂等 restore。
3. 待做：N 落地、左右、收招资源完成后，再扩成 TV 完整两 handler/三 hash。官方解除仍留给 slot `0x19` / `0xA02D57DC`。

---

## 骨架约束（复制文件时）

已冻结：source `body_tf` 78 骨 vs Rebellion 普通身 52 骨；source `wing00` 21 骨 vs Rebellion wing 44 骨。禁止把 source wing 重定向到 Rebellion wing。

| 组 | 能不能原样播 |
|----|--------------|
| 3 / 4 `35tkkneo2kam` | 可以。鸟形态已经用 source `body_tf` |
| 1 / 2 `40tkkneo2stk11a` | **不能**把 TV `001hito_028gunwtv` / `482gwtvwing` 当 Rebellion 普通身+翼来播。要嘛重定向到 `001hito_016gundmw` + `410wzerowing`（翼骨仍不兼容），要嘛自制落地 NUANMB，只保留 TV Folder ID 和通道顺序 |
| 附属 `kamae_stk_air_fr` | 同样是普通身 Folder，和 1 / 2 同一问题 |

左右俯冲可以先用官方 `body_tf` Item 验证手感；N 落地是真正的「落地动作」，卡在普通身骨架。

---

## 明确不要复制

- 地面四向特格 hash / `0xEACA01A1`。
- `body_tf_40tkk11a`（`0x92856398`）：地面特格进鸟用的，不是飞形态落地。
- 整份 TV `0.c`、共通 `func_450..466`。
- Rebellion 现有跳起特格 Folder（`15flight11a` / `35flight11a` / `maenobori11a`）不要覆盖。
- 独立 `wep_wing00` 模型。Bird 翼在 `body_tf` 里。
