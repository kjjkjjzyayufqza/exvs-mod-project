# TODO：TV 飞形态特格落地 → Rebellion motion 包

**Date:** 2026-08-17  
**Status:** #1 N 空中 body+wing Folder 与单阶段 MSC 已实机通过；完整落地/左右仍待做
**Pack:** `E:\XB\mod\003motion\wing_gundam_zero_rebellion_motion`  
**对照清单:** [tv-wing-zero-flight-special-melee-landing-copy-list.md](./tv-wing-zero-flight-special-melee-landing-copy-list.md)

约定（按你的要求）：

- 文件前缀一律 `wing_gundam_zero_rebellion_motion_`
- Folder **action id = 该动作 seed 的 IEEE CRC32**（和包名 `HashName 0x63D0251E` 同一算法）
- **四组全是 Folder**（`unk3=2`），左右原来的 direct Item 也改 Folder，方便加翅膀
- 子 clip：`unk1=00000000`，`unk2` 用 Rebellion 通道 id，不要抄 TV

官方 TV Folder id（`0x72394A81` 等）**作废**。MSC `func_308` 以后写本页的新 CRC，不要再写 TV 原值。

### 2026-08-22 实际 #1 Folder

| 用途 | Folder | structure raw `unk1` | MSC Runtime | child |
|------|--------|----------------------|-------------|-------|
| N 空中单阶段 | `trans_te_motion_stk_air_fr_out` | `1ee99211` | `0x1192E91E` | body `9c5e24c7` + wing `c1a9c1f6` |

CRC seed 是 `wing_gundam_zero_rebellion_motion_trans_te_motion_stk_air_fr_out`；CRC32 显示值为 `0x1EE99211`，写入 structure raw bytes 后，MSC/engine little-endian Runtime 是 `0x1192E91E`。不要把两者互换。

---

## 0. 算法（改名就重算）

IEEE CRC32，UTF-8，无 `.nuanmb`。

```powershell
python -c "import zlib,sys; s=sys.argv[1]; h=zlib.crc32(s.encode())&0xffffffff; print('BE=0x%08X  LE=%s'%(h,h.to_bytes(4,'little').hex()))" wing_gundam_zero_rebellion_motion_40tkkneo2stk11a_stk_air_fr
```

编辑器里 Folder **unk1 填 LE**。MSC / `func_308` 用 **BE**。

---

## 1. 五个 Folder seed 与已算 CRC

| # | 用途 | seed（CRC 输入 = 身体 clip 去后缀名） | BE（MSC） | LE（structure `unk1`） |
|---|------|--------------------------------------|-----------|-------------------------|
| 1 | N 空中 | `wing_gundam_zero_rebellion_motion_40tkkneo2stk11a_stk_air_fr` | `0xAA7AADE1` | `e1ad7aaa` |
| 2 | N 落地 | `wing_gundam_zero_rebellion_motion_40tkkneo2stk11a_stk_gnd_fr` | `0xBB719AAF` | `af9a71bb` |
| 3 | 左俯冲 | `wing_gundam_zero_rebellion_motion_35tkkneo2kam_sht_air_lf` | `0x2CA0037F` | `7f03a02c` |
| 4 | 右俯冲 | `wing_gundam_zero_rebellion_motion_35tkkneo2kam_sht_air_rt` | `0x0B584DE8` | `e84d580b` |
| 5 | 左右收招（附属） | `wing_gundam_zero_rebellion_motion_kamae_stk_air_fr` | `0xF1BC2CE1` | `e12cbcf1` |

seed 改一个字，整行作废，重跑第 0 节命令。

---

## 2. 磁盘命名与通道

建议放到 `0\0\<新号>\`。当前数字 Folder 最大是 **135**，下五个可用 **136–140**（被占用就顺延）。  
当前 `fileIndex` 最大 **540**，新文件从 **541** 起。

子文件名：身体 = seed；翅膀在 seed 里插 `wing00_`。

### 每组最少 2 通道（身体 + 翅膀）

| 通道 | 子文件名 | child `unk2` LE | 对应模型 |
|------|----------|-----------------|----------|
| body | `{seed}.nuanmb` | `9c5e24c7` | Rebellion 普通身 `001hito` |
| wing | `wing_gundam_zero_rebellion_motion_wing00_{core}.nuanmb` | `c1a9c1f6` | `410wzerowing` / `wing00` |

`{core}` = seed 去掉前缀后的尾巴，例如 `40tkkneo2stk11a_stk_air_fr`。

### 可选武器通道（TV N 特格有，Rebellion 现成 id）

| 通道 | 建议文件名 | child `unk2` LE |
|------|------------|-----------------|
| saber | `..._bsaber00_{core}.nuanmb` | `a8915c1c` |
| extra | 仅当你真的做了对应模型 clip | 不要抄 TV `a7b347e5` / `d5af02ff` |

N 空中/落地 TV 是 5 通道。这边最低限度：**body + wing**。刀/枪/盾你做了再加。

Folder 形态：

```text
Folder  Name=<136..140>  unk1=<上表 LE>  unk3=2
  Item  unk1=00000000  unk2=9c5e24c7  Name=<seed>
  Item  unk1=00000000  unk2=c1a9c1f6  Name=<prefix>wing00_<core>
  Item  unk1=00000000  unk2=a8915c1c  Name=<prefix>bsaber00_<core>   // optional
```

用 Motion Folder Editor 的 **Add folder**，不要手改 JSON 漏 EndMark。

---

## 3. 从 TV 拷哪些源文件

| 目标 Folder | 身体源（先改名再进包） | 翅膀 |
|-------------|------------------------|------|
| #1 N 空中 | `001hito_028gunwtv_..._40tkkneo2stk11a_stk_air_fr.nuanmb` | 自制 / 重定向到 Rebellion `wing00`；**不要**把 `482gwtvwing_...` 当 `410wzerowing` 播 |
| #2 N 落地 | `..._40tkkneo2stk11a_stk_gnd_fr.nuanmb` | 同上 |
| #3 左 | `032gwtvTR_..._35tkkneo2kam_sht_air_lf.nuanmb`（`body_tf` 78 骨） | 新建 wing clip。鸟翼已在 `body_tf` 里；这条通道是你要额外挂的 Rebellion 翼 |
| #4 右 | `..._35tkkneo2kam_sht_air_rt.nuanmb` | 同左 |
| #5 收招 | `001hito_..._kamae_stk_air_fr.nuanmb` | 新建 wing；刀可选 `bsaber00_r_kamae_stk_air_fr` |

自制 / FBX 进口袋：**不要写 `ATH_*`**。多帧旋转用 indexed `0x4300`。见 `docs/nuanmb-ath-helper-bone-policy.md`、`docs/nuanmb-exvs2-import-in-game-layout.md`。

#3 / #4 身体仍是 TV `body_tf`。翅膀若绑 Rebellion 44 骨翼，和 78 骨鸟身不是同一套骨架——这是你要自己对齐的，不要假定能重定向。

---

## 4. 勾选清单

### A. 复制并改名

- [x] #1 body `trans_te_motion_stk_air_fr_out_body.nuanmb`（源：`001hito_028gunwtv_..._40tkkneo2stk11a_stk_air_fr`）
- [ ] #2 身体改名为 `wing_gundam_zero_rebellion_motion_40tkkneo2stk11a_stk_gnd_fr.nuanmb`
- [ ] #3 身体改名为 `wing_gundam_zero_rebellion_motion_35tkkneo2kam_sht_air_lf.nuanmb`
- [ ] #4 身体改名为 `wing_gundam_zero_rebellion_motion_35tkkneo2kam_sht_air_rt.nuanmb`
- [ ] #5 身体改名为 `wing_gundam_zero_rebellion_motion_kamae_stk_air_fr.nuanmb`

### B. 翅膀（每组至少一条）

- [x] #1 wing `trans_te_motion_stk_air_fr_out_wing.nuanmb`
- [ ] #2 wing `..._wing00_40tkkneo2stk11a_stk_gnd_fr.nuanmb`
- [ ] #3 wing `..._wing00_35tkkneo2kam_sht_air_lf.nuanmb`
- [ ] #4 wing `..._wing00_35tkkneo2kam_sht_air_rt.nuanmb`
- [ ] #5 wing `..._wing00_kamae_stk_air_fr.nuanmb`
- [ ] 翼 clip 无 `ATH_*`；骨架对得上你要绑的 `unk2`

### C. 登记 structure（Editor Add folder）

- [ ] 五个 Folder 都在 `0\0` 下，数字名空闲
- [ ] `unk1` = 第 1 节 LE
- [ ] `unk3=2`
- [ ] 子项 `unk1=0`，body `9c5e24c7`，wing `c1a9c1f6`
- [ ] 没有两个 Folder 抢同一个 `unk1`
- [ ] `Fhm2dTotalCount` / fileIndex 与磁盘一致

### D. 回报（做完勾上，再开 MSC）

- [ ] 五个 seed 没改（若改了，把新名字和重算 CRC 发回来）
- [ ] 每组实际通道数（2 = 只有身+翼；3+ = 加了刀/枪）
- [ ] #3/#4 翅膀绑的是鸟 `body_tf` 还是 Rebellion `wing00`

---

## 5. 当前 MSC 边界

- 已授权并完成：鸟 `0x200 → 0xC0B814FF`，`2.c` 注册 N 单阶段 handler，播放 `0x1192E91E`。
- 已实机确认：新动作正常播放；有序 11-row armsparam 安装后，双击前进变形不再崩溃。
- 不要注册左右 `0x8D96C52F` / `0x279F0DA4`，直到对应 Folder 与收招资源完成。
- 不要在 `func_308` 里继续写 TV 旧 id。
- 不要覆盖 `15flight11a` / `35flight11a` / `maenobori11a`。
- 不要把 TV `482gwtvwing` 的 `unk2` 写进 Rebellion Folder。

MSC 接线等 C+D 勾完再开。
