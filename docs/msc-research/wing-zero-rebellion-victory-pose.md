# Wing Zero Rebellion：胜利 pose 怎么接线、怎么再加一条

**Date:** 2026-09-02
**Status:** E1 source-pinned on current `wing_gundam_zero_rebellion_msc`; E2 cross-unit on result hashes / `0xb0001` map; L3 player behaviour untested
**Kind:** result-pose wiring (not combat ACTION / not transform)
**Target tree:** `E:\XB\mod\040msc\wing_gundam_zero_rebellion_msc`

**Artifact identity (2026-09-02):**

```text
2.c     787227 bytes  MD5 9D026AB0B3D28AF45CE8D03AF9646FC2  2026-09-02 22:04:46
2.dscex 305200 bytes                                       2026-09-02 22:05:13
```

If those functions or hashes are missing, this note describes a different tree — stop and re-identify the file.

**Related:**

- Action/result hash identity: [2c-call-chain-runtime-flow](./2c-call-chain-runtime-flow.md), [exvs-msc-input-action-weapon-pipeline](../exvs-msc-input-action-weapon-pipeline.md)
- Slot `0x34` tick: [func1044-slot-callback-atlas](./func1044-slot-callback-atlas.md)
- `0.c` result enum: [0c-to-2c-input-action-boundary](./0c-to-2c-input-action-boundary.md)
- Homemade clip clock (only if the new pose is homemade NUANMB): [homemade-motion-clock-vs-game-frame](./homemade-motion-clock-vs-game-frame.md)
- Victory cameras (02winlose word25 packs, not MSC mining): [wing-zero-rebellion-victory-camera](./wing-zero-rebellion-victory-camera.md)
- Do not invent a private result hash: registry A4 in [msc-falsified-negatives-registry](./msc-falsified-negatives-registry.md)

---

## 结论（先读这个）

Rebellion **已经有** 胜利 pose，不是从零开始。

引擎在结算时提交固定 hash `0xf32aa1ba`。`2.c` 把它接到 `func_480` → slot `0x34` tick → `func_74(0x4e)`。同一条 hash 上已经挂了 **两条 clip**：

| `func_186()` (`sys_0(0xb0004, 0x1)`) | slot `0x34` tick | table `0x3`/`0x4` slot `0x4e` folder | 规范名（body Folder 子 Item） |
|---|---|---|---|
| `!= 1`（默认） | `func_870` | `0x8d761fe5` (LE `e51f768d`) | `001hito_016gundmw_001wgzero_001_winbgn01_sht_gnd_fr` |
| `== 1` | `func_871` | `0x5aa9d1f6` (LE `f6d1a95a`) | `001hito_016gundmw_001wgzero_001_37winbgn03_sht_gnd_fr`（带 `bsaber00` child） |

失败 pose 是另一条引擎 hash：`0x900ab393` → `func_482` → slot `0x35` → `func_74(0x4f)` → `0xabdba193` = `losepose01`。

**再加一条胜利 pose** 的正确形状是：继续吃 `0xf32aa1ba`，再给 `func_186()` 增加一个分支（TV 是 0/1/else 三套 folder；RX-78-2 是 1/2/else）。不要新造一个 native 不会提交的 action hash。

L3：结算时到底谁写 `0xb0004,1`、鸟形态下播哪套 clip，都还没实机。下面标了未知项。

---

## 1. 结算总线（E1 本树 + E2 跨机体）

`0.c func_13` 把结果槽写成固定 hash：

```c
sys_1(0x10000, 0x1, 0x24, 0xf32aa1ba); // win
sys_1(0x10000, 0x1, 0x25, 0x900ab393); // lose
sys_1(0x10000, 0x1, 0x28, 0x27786a84); // result C
```

`0.c func_14` 给这三个槽的 selector 是 `0`（关掉 0.c 再选）。引擎自己提交 hash，不走 `func_143` 输入表。

`0.c func_92` 在启动时读 native `sys_0(0xb0001)` 预填 `global57`：

| `sys_0(0xb0001)` | 发布的 hash 槽 | 语义（E2：多机体 `0.c` 同形） |
|---|---|---|
| `0x1` | `0x28` / `0x27786a84` | result C |
| `0x2` | `0x24` / `0xf32aa1ba` | **胜利 pose** |
| `0x3` | `0x25` / `0x900ab393` | 失败 pose |
| `0x4`..`0x8` | `0x20` / `0x676aca0b` | 爆散/退场族（`2.c func_472`），不是胜利 pose |

`2.c` 两侧都登记了同一组 hash：

- boot fallback：`func_2(0xf32aa1ba, func_480, 0x34)`（`func_1`）
- action 表：`func_241(0xf32aa1ba, func_480)`（`func_1040`，经 `func_874` → `func_1039`）

`func_2` 只在 `sys_0(0x10003, 0x2, hash)==0` 时补 `0x10002` 行。现树两边都在，不要拆掉任一侧去“腾位置”。

---

## 2. 胜利 pose 的 depiction 形状（E1）

不是 `func_593` 四段射击。形状是 **一个 ENTER + 一个 slot tick + `callFunc3` 续跑 `func_72`**：

```text
native 0xb0001 == 2
  -> 0.c publishes 0xf32aa1ba
  -> 2.c func_241 -> func_480
       func_167(0x4000000)
       sys_4A(0x2e, 0, 0, 0)
       sys_53(0x4, 0x8ca6cc45, 0x11170)   // win camera
       func_356(0x20)
       func_69(0x34)                      // load slot tick, reset global226..
       callFunc3(func_481)
  -> func_481 every tick: func_72() -> func_870 or func_871
  -> first tick of func_870: func_74(0x4e, 0) -> func_79 reads
       sys_0(0x10001, 0x3+global170, 0x4e)
  -> motion complete: func_80(winloop folder)
```

`func_74` **读 table `0x3`（`global170==1` 时读 `0x4`）**，不是 `func_835` 的 group `0x7`。改 group `0x7` slot `0x4e`（`0x192ca126`）不会换胜利 clip。

当前 tick：

- `func_870`：`global170` 保持 0；`func_74(0x4e)`；镜头 `0xfd5fd16a`；完成后续 `func_80(0xdd6bab29)` = `winloop01` folder（LE `29ab6bdd`）。
- `func_871`：写 `global170=1` 后走 saber 表 `0x4`；`func_74(0x4e)`；镜头/光束/SE 不同；完成后续 `func_80(0xd5651eed)` = `37winloop03` folder（LE `ed1e65d5`）。本树 `func_871` 里有一条 AI 改过的红色近战拖尾 `sys_4A`。

`func_186()` 在 **`func_1041` / `func_1042` 执行那一帧** 决定绑哪套 tick 和哪条 folder hash。这两张表只从 `func_874` → `func_1039` 重建（`func_1` 启动和 respawn）。`func_4` 每帧跑的 `func_877` 在本树是空函数。

`func_876` 每帧调 `func_1029()` → `func_184(global23 ? 1 : 0)` 去写 `0xb0004,1`，但 `func_184` 在 `sys_0(0x400000, 5..8)` 任一为真时 **不写**。所以结算期间 MSC 不会用觉醒标志去改 selector。表本身也不会在结算瞬间重绑。L2：native 若在结算前改 `0xb0004,1`，本树看不到重注册。未做 IDA/实机。

---

## 3. 现成 clip 库存（E1，当前 motion pack）

`E:\XB\mod\003motion\wing_gundam_zero_rebellion_motion`（EW `016gundmw_001wgzero_001` 名）：

| Folder Runtime（MSC 里写的 int） | body Item | 已接线 |
|---|---|---|
| `0x8d761fe5` | `winbgn01` + 同 Folder 的 `winloop01` child | 是，默认 `0x4e` |
| `0x5aa9d1f6` | `37winbgn03` + saber/wing child | 是，`func_186()==1` 的 `0x4e` |
| `0xabdba193` | `losepose01` | 是，失败 `0x4f` |

**没有** TV 的第三条 `winpose02`。TV `028gunwtv` 在同一 `0x4e` 上分三套 folder（`func_186()==0 / ==1 / else`）。要第三条 clip，必须先把 TV `winpose02` 或自制 Folder 放进当前 motion pack，再把 Folder 的 Runtime/unk1 写进 `func_1042`。

---

## 4. 生命周期 / 所有权（加函数前必须填）

| Phase | 现树在做什么 | 再加一条时要定的政策 |
|---|---|---|
| ENTER | 引擎提交 `0xf32aa1ba`；`func_480` 装 slot `0x34` | 保持这条 hash。新 tick 仍由 `func_69(0x34)` 装，不要另开 `callFunc3` 状态机 |
| ACTIVE | `func_481` + slot tick 播 Folder；完成切 loop Folder | 新 clip 的 loop hash、镜头、SE、`global170`（枪/刀表）必须成对 |
| EXIT | 结算动作，0.c selector 为 0，没有战斗 EXIT | 不要接 `func_65` / 不要交棒回待机 |
| INTERRUPT | 未证实 | 不要加 `func_123` 取消窗 |
| RESPAWN | `func_874` → `func_1039` 按当时的 `func_186()` 重绑 `0x4e` / `0x34` | 新分支必须同时写进 `func_1041` 和 `func_1042` 的 `0x3` **和** `0x4` |

| State | Owner | ENTER | EXIT / INTERRUPT |
|---|---|---|---|
| action hash `0xf32aa1ba` | native `0xb0001==2` + `func_241` | 保持 | 引擎收 |
| slot `0x34` tick ptr | `func_1041` snapshot of `func_186()` | 新分支写 `sys_1(0x10001,0x2,0x34, newTick)` | respawn 重绑 |
| motion `0x4e` | `func_1042` snapshot of `func_186()` | 新 folder hash 写 `0x3` 和 `0x4` | 同上 |
| `global170` | `func_871` 写 1；`func_870` 不写 | 新 pose 若要刀模走 1，否则保持 0 | `func_73` 随 `func_69` 清 tick 局部，不 Clearglobal170 |
| `global143` 鸟 form | 变形口 | **未知**：结算时若仍是鸟，地面 `winbgn01` 可能绑错骨架 | 未测；加地面 pose 前要定是否先拆 form |
| camera `sys_53` | `func_480` + tick | 新 pose 用自己的镜头 hash | 引擎收 |

---

## 5. 怎么加（三条路，只挑一条）

### 路 A — 换现有默认 clip（最小）

改 `func_1042` 里 `func_186()!=1` 的 `0x4e` hash，以及 `func_870` 完成时的 `func_80` loop hash。hash 仍是 `0xf32aa1ba`。适合“胜利动作换成另一套现成 Folder / 自制 Folder”。

自制 Folder：不要用 `func_309` / `sys_47(0x7)` 等 stock 完成等待；用 `global244 -= func_274()`。见 homemade-motion-clock 与 registry H。

### 路 B — 给 `func_186()` 加第三分支（TV/RX 形状）

这是“增加一个胜利 pose **函数**”的 corpus 形状。

1. Motion pack 里先有第三条 Folder（TV `winpose02` 或自制）。记下 Folder `unk1` LE → MSC int。
2. 新 tick：`rebellion_result_win_pose_extra`，形状抄 `func_870`（首帧 `func_74(index)`，完成 `func_80(loop)`）。新函数用语义名，不要 `func_1047`。
3. `func_1041`：

```c
if (func_186() == 0x1)
    sys_1(0x10001, 0x2, 0x34, func_871);
else if (func_186() == 0x2)
    sys_1(0x10001, 0x2, 0x34, rebellion_result_win_pose_extra);
else
    sys_1(0x10001, 0x2, 0x34, func_870);
```

4. `func_1042` 对 table `0x3` **和** `0x4` 的 slot `0x4e` 写同一套三分支 hash。
5. **谁写 `func_186()==2` 仍是 L2 未知。** 只加分支、native 从不写 `2`，第三条永远不会进。要么实机确认 native 枚举，要么在 `func_1039` 之前由 MSC 写 `func_185(2)`（这会挤掉 `==1` 的 37win 刀 pose，除非另有选择条件）。

TV 参考：`028gunwtv` `func_186()==0/1/else` 三套 `0x4e` hash + `func_876/877/878`。RX-78-2：`==1/==2/else`。

### 路 C — 禁止

- 新 action hash + `func_241(新hash, 新函数)`，而 `0.c` `0xb0001` 不发布它。引擎不会提交。registry A4（私有 hash / 假 slot `0x26`）已实机失败。
- 把 `func_241(0xf32aa1ba, func_871)`：`func_871` 是 slot tick，不是 ENTER。pipeline 文档已写明。
- 占用失败 hash `0x900ab393` 或 result C `0x27786a84` 当第三条胜利。
- 只改 `func_835` group `0x7`。
- 用空闲 slot `0x26`/`0x27` 当结果 selector（本树这两个槽是变形预留且为 0）。

---

## 6. 加之前仍未知（不要用源码猜）

1. 结算瞬间 native 是否改 `0xb0004,1`，以及改完会不会再跑 `func_1039`。
2. 鸟形态（`global143==0x2`）下 `winbgn01` 地面 Folder 是否播得动；要不要在 `func_480` 先拆 form。
3. `global23`（觉醒）与 `func_186()==1` 的 37win 刀 pose 是否就是同一条玩家语义。
4. 自制 clip 在结算镜头下的时长。stock 路径用 `func_309`/`sys_47(0x7)` 是因为 Folder 是原生动画。

---

## 7. Homemade height: do not MSC-unlock GBL_RT (2026-09-05, E3-)

`func_97(0)` / `sys_47(0x4, global20, 0)` on victory ENTER + first `func_74` +
every `func_481` tick **did not** lift the unit. User abandoned this path:
author `CENTER_RT` / `BASE` in the homemade clip instead. The unlock calls
were reverted. Do not retry bone-0 unlock, `func_351(0x2)`, or analog-2 climb
(registry E12) for this pose.

```text
H  func_97(0) lets homemade GBL_RT Y=10 apply
P  pose at authored height
F  still glued to ground  <- observed; user stopped here
```

---

## 8. 若要动 `2.c`：预注册（尚未授权改码）

```text
H  hypothesis:  <which path A/B, which Folder hash>
P  prediction:  结算胜利看到指定 body/wing/saber clip；失败仍是 losepose01
F  falsifier:   仍播 winbgn01 / 播失败 / 鸟形态下 T 姿或无动作 / 新 hash 从未进入
```

一次只改一个判断变量：要么只换 `0x4e` hash，要么只加 `func_186()==2` 分支，不要同时改鸟 form 清理。带一个 `sys_58` 探针在新 tick 首帧，用来分辨“没进新函数”和“进了但 clip 错”。

---

## 9. White Part extra on homemade win (2026-09-05)

SHL slot 10 is Part(3) `0x04dc16ce` (editor LE `CE16DC04`), folder `016gundmw_001wgzero_001_body_whitel`. Not a second Body(0).

```text
H  Hambrabi func_1135 shape: sys_4B(0x2, white, 0, homemade 0x8525ad9a) + func_308 + func_314 after func_74 in func_870
P  victory shows a second white body (T-pose OK)
F  完全没有第二台  <- observed; packed 2.dscex grew with the helper
```

**Status:** E3- M1 (homemade Folder as `sys_4B` arg4). E3- M2 (`0x4094b0f4` + bone 0, still no visible white). User forbids `sys_58` probes.

`body_normal.jnttbl` rec 0 is hash `0` / boneIndex `0` (GBL_RT). Bone 0 is a valid mount, so M2 may have overlaid the player.

```text
H  sys_47(0x10, 0x04dc16ce, 0, 0xfa0, 0, 0, 0) after the M2 attach slides the Part off GBL_RT
P  a second body appears beside the winner; win-start 0xed66f76 on the main body (group 0xa slot 0x3)
F  still no second body / no start FX on the main body
```

**Status:** E3 2026-09-05 user: second body visible on win, T-pose. Call site was `func_480` after `func_884` (and `func_871` re-spawn after its `sys_4B(0x3)`). M1/M2 failed because spawn lived only in `func_870`.

T-pose is expected: `win_pose` children are only `unk2=9c5e24c7` (main body) and `unk2=c1a9c1f6` (main wing). White Part `0x04dc16ce` / editor LE `CE16DC04` has no child. `func_308` the same Folder on that id has nothing to bind.

Next one-variable (motion pack, not MSC attach): same Folder `win_pose`, add a child that reuses the body `*_win_pose_out.nuanmb` with `unk2=ce16dc04`. Do not make a second Folder. No white wing SHL row yet, so do not add a wing child until that model exists.

Keep `sys_47(0x10)` +X `0xfa0` until the user wants overlay/side-by-side tuned. Probe `sys_4A` on ENTER removed after this E3.

Motion pack later added `win_pose` children `unk2=ce16dc04` (white body) and `unk2=daaa1479` (white wing). **Status:** E3 2026-09-05 user: white body plays the pose.

```text
H  keep 0x4094b0f4 + bone 0 after motion children exist
P  white body stands on host GBL_RT beside the winner
F  white body animates but is glued to the wrong bone  <- observed
```

`0x4094b0f4` is the weapon/Part attach (`ATH_TE_*` / saber). Bone 0 is already GBL_RT in `body_normal` / `body_whitel` jnttbl; the wrong visual was arg4, not a missing GBL_RT hash. `func_190`'s `0x810a8bef` is **not** an identity bind — see M4 / `down_faceup_gnd_fr` below.

SHL slot 11 Type1 `0x7914aada` (editor LE `DAAA1479`) reuses folder `wep_wing00`. Host wing is `sys_4B(0x2, 0xf6c1a9c1, 0xad1a39fb, 0xae17be24)`. White wing must pass parent `0x04dc16ce` or it becomes a second host backpack wing. White `ATH_BACKPACK` jnttbl hash is the same `0xAD1A39FB`.

```text
H  helper: sys_4B(0x2, 0x04dc16ce, 0, 0x810a8bef) then func_308 homemade, then sys_4B(0x2, 0x7914aada, 0xad1a39fb, 0xae17be24, 0x04dc16ce) + func_308 same Folder
P  white body on host GBL_RT (+X 0xfa0); white wing on white ATH_BACKPACK; both play win_pose
F  still glued to a limb / no white wing / white wing on host backpack / wing T-pose  <- body+wing OK; extra 往前坠 (M4)
```

**Status:** E3 2026-09-05 user: white body+wing play, but extra **pitches forward / 往前坠** vs Blender. Blender `ZeroEW_White_Body` GBL_RT matches host (REL euler 0). The extra is not authored tilted.

`0x810a8bef` is motion Item `001hito_000common_000common_001_down_faceup_gnd_fr` (LE `ef8b0a81`). That is a knockdown clip, not an identity bind. `sys_47(0x10)` is **rotate** (deg×100); `0xfa0` on X is +40°, not +X translate. `sys_47(0x11)` is translate.

```text
H  sys_4B arg4 = homemade 0x8525ad9a like Hambrabi extras (M1 was func_870-only invisibility); sys_47(0x11, white, 0, 0xfa0, 0, 0, 0) for the side offset
P  white stands like Blender / host GBL_RT; still +X beside host; wing stays on white backpack
F  still 往前坠 / extra vanishes (M1 class) / extra flies far / overlay on host
```

Do not compensate with a guessed `sys_47(0x10)` 90° tweak while GBL_RT already matches in Blender. Do not `sys_4B(0, id)`. Do not `sys_58`.

**Status:** E3 2026-09-05 user: orientation OK; distance tuned on `sys_47(0x11)`.

```text
H  ENTER global170=0 so func_884 mounts host guns 0xcb1fd274/0x521683ce; after white spawn, sys_4B hilts 0x1c5c91a8/0x5fefab7 on white 0x1b/0x1a with parent 0x04dc16ce + rebellion_play_saber_beam_fx
P  host dual guns; white dual sabers + red 0x2BE700A2 blades; host has no hilts
F  hilts still on host / guns missing / hilts on white with no beam / hilts at host origin / FX on host hands
```

Do not attach hilts without the 5th-arg parent (they glue to the current body). SHL has one of each hilt. `func_884` `sys_4B(0x3)` still runs before spawn.

### Extra `body_whitel` must keep `ATH_*` in the motion

Host Body homemade clips omit `ATH_*` (NUHLPB + rest). White extra
`0x04dc16ce` is SHL Part(3), not Body(0). It does **not** run the host helper
solver, so saber sockets (`ATH_TE_R90` / `ATH_TE_L90`), backpack
(`ATH_BACKPACK`), and the rest of the 28 `ATH_*` bones stay at rest unless
the extra NUANMB records them.

DCC source: Blender `ZeroEW_White_Body` (52 bones, same names as host).
Export isolation: armature + three `ZeroEW_White_Body_SHAPE_*` meshes.
Do **not** `strip_ath_keys` on this armature.

| File | Role |
|---|---|
| `D:\output\exvs2\wing_gundam_zero_rebellion\motion\win_pose\001hito_016gundmw_001wgzero_001_body_win_pose_white_out.fbx` | Extra body FBX; all 28 `ATH_*` names present (2026-09-05) |
| Host `…_body_win_pose_out.fbx` | Host Body; ATH still omitted at NUANMB write |

Policy: `docs/nuanmb-ath-helper-bone-policy.md` → Extra / Part exception.
Import this extra FBX with **Skip ATH_* helper bones** unchecked so helper
tracks stay in the NUANMB. Host body import stays checked.
