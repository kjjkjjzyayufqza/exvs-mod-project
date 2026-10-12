# 15008001 全装备独角兽：NT-D 持续 BD 拖尾

**Date:** 2026-10-12
**Status:** BD 脚本接线为 E1（本机体 `0.c` / `2.c` 逐函数读取）。特效文件名是 E1（zlib crc32 对上命名解包里的 `.efxbn`）。**玩家看到的是不是这条拖尾是 E0，未实机。**
**Kind:** 单机体 MSC 页 / 特效 ID

**Sources（只读）:**

```text
Msc       E:\XB\mod\040msc\015gndmuc_008faunig_001\{0.c, 2.c}
Vernier   E:\XB\mod\002chara\fapt_gndmuc_008faunig_001_model\vernier_table_015gndmuc_008faunig_001.bin
Project   同目录 effect_project_015gndmuc_008faunig_001.bin
Names     E:\XB\解包\vs2\x64\006effect\chara\015gndmuc\015gndmuc_008faunig_001\efxbn\
          E:\XB\解包\vs2\x64\006effect\chara\000common\000common_000common_001\efxbn\
```

名字规则沿用 [efxbn name recovery](../../../agent-sessions/2026-10-01-efxbn-name-recovery.md)：`unk3` = zlib crc32(不带扩展名的文件名)。动作槽语义沿用 [func1044 slot atlas](../../func1044-slot-callback-atlas.md)。形态编号沿用 [本机 README](./README.md)：`global143` 0 全装甲、1 装甲排除、2 NT-D。

**Related:** [本机 README](./README.md) ·
[证据分级协议](../../msc-evidence-grade-and-ingame-audit-protocol.md)

---

## 结论

第三形态按住 BD 时，脚本每帧另挂一条机体特效，不是喷气。

| 形态 | 持续 BD 每帧生成 | 文件 |
|---:|---|---|
| 2 NT-D | `0x3C04416B` | `eff_015gndmuc_008faunig_001_destroy_002` |
| 0 / 1 | `0xA50D10D1` | `eff_015gndmuc_008faunig_001_destroy_001` |

喷气是另一条共用特效：`0x70C05068` = `eff_000common_000common_001_boost_001`。BD 开始时生成一次，BD 结束时停掉。三个形态共用，NT-D 不换 ID。

按住上升和飞行循环**不会**生成 `destroy_002`。脚本里没有第二条飞行拖尾 ID。

---

## 1. 持续 BD

`0.c` 把共通动作槽登记为：

```text
slot 0x0e  0x86D45295   BD 开始
slot 0x0f  0x910F3FA7   BD 持续
slot 0x10  0xB28C1647   BD 结束
```

`2.c func_1377` 把开始接到 `func_590`。`func_1378` 把表现槽接到本机回调：

```text
slot 0x1d  func_1280   BD 开始表现
slot 0x1e  func_1281   BD 持续表现
slot 0x1f  func_1282   BD 结束表现
```

### 1.1 喷气：BD 开始生成，结束停掉

`func_590` 调用 `func_514`：

```c
sys_4A(0, 0x70c05068, global20, 0x1, 0x1, 0x2);
sys_4A(0x8, 0x1, 0x2, 0, 0xc8, 0);
sys_4A(0x9, 0x1, 0x2, 0, 0x4650, 0);
```

`0x70C05068` 的 crc32 对上 `eff_000common_000common_001_boost_001.efxbn`。持续段 `func_592` 只改速度，不再生成、也不清掉它。结束段 `func_594` 调用 `sys_4A(0x6, 0)`。这条不看 `global143`。

### 1.2 拖尾候选：持续段每帧生成，结束清 group

`func_592` 调用 `func_69(0x1e)`，也就是 `func_1281`。`destroy_*` 的 `sys_4A` 写在 `global226` 分支外面，所以进入后的每一帧都会执行：

```c
if (global143 == 0x2)
    sys_4A(0, 0x3c04416b, global20, 0x1, 0xb, 0, 0x1);
else
    sys_4A(0, 0xa50d10d1, global20, 0x1, 0xb, 0, 0x1);
```

父节点是 `global20`，group 是 `0xb`，slot 是 `0`。`func_1282` 第一帧执行 `sys_4A(0x1, 0xb, 0)`，把这一组清掉。

同一函数里 NT-D 每帧还调用 `func_504(0x9, 0x3)`，展开是 `sys_4A(0x3, 0x9, 0x3)`。跨机体笔记把 `sys_4A(0x3, …)` 记成 analog profile，不是特效 hash。这里不要把它当成另一条拖尾 ID。

`func_1280` / `func_1281` 同时按方向播 motion index `0x26` / `0x27` / `0x28`，持续段再切到 `0x29`。`func_1379` 里这四个 index 的 hash 是 `0x15531240`、`0xF5662EB7`、`0xD29E6020`、`0x1183CC7F`。结束 index `0x2c` 是 `0x1D3C5A09`。这些 hash 没有对上 `boostloop` / `hoverloop` 文件名的 crc32，clip 文件名仍是未解。

---

## 2. 持续上升和飞行循环

| 动作 | `0.c` 槽 | `2.c` | 会不会生成 `destroy_002` |
|---|---|---|---|
| 上升持续 `0x901C3623` | `0x08` | `func_561` → `func_69(0x7)` = `func_1273` | 不会。NT-D 只调用 `func_504(0x5, 0x2)`，然后播 motion `0x10` / `0x11` |
| 飞行循环 `0x77B100FF` | `0x18` | `func_241(0x77b100ff, 0)` | 不会。处理函数是空的 |
| 变形飞行 motion `0x37` / `0x38` / `0x3b` | — | `func_1379` 三个 hash 都是 `0` | 本机没有这三段 clip |

所以「按住上升」和「飞行循环」在这台机体的脚本里都没有自己的拖尾 ID。若飞行时画面上仍有拖尾，现有静态证据覆盖不到那条接线。

---

## 3. 已经排除的接线

这些都在数据里，但不是第 1 节那条 BD 持续 `sys_4A`。

| ID | 名字 | 接线 | 为什么先放下 |
|---|---|---|---|
| `0x70C05068` | `eff_000common_000common_001_boost_001` | BD 开始 `func_514`，group `0x1` slot `0x2` | 喷气。三个形态相同 |
| `0x3AA86061` | `eff_000common_000common_001_vlight_001` | `vernier_table` 3 行，`is_enabled=1` | 喷口光。骨头是 `ATH_V_HAGI_L`、`ATH_V_HAGI_R`、`ATH_V_BACK_1N`。表里有行，不能证明 BD 或飞行时引擎一定在播 |
| `0xC0674CC5` | `eff_000common_000common_001_vernier_002` | `vernier_table` 大多数启用行 | 喷口火焰，不是机体拖尾 hash |
| `0x1A058E38` | `eff_015gndmuc_008faunig_001_vernier_001` | `vernier_table` 2 行，`is_enabled=0` | 表里关着 |
| `0xACD033D7` | `eff_015gndmuc_008faunig_001_strip_001` | `func_1135` 第 `0x190` 生成，第 `0xfa0` `sys_4A(0xb, 0xa)` 清掉 | 短时刀光，挂在四根骨头上 |
| `0x07E492FC` / `0x9EEDC346` / `0x1EFFA3BD` | `aura_001` / `aura_002` / `aura_011` | `effect_project` 两行反复引用 | 光环资源。`2.c` 不按 BD 生成它们 |
| `0xB5CB0296` | `strip_011` | `projectile_depiction_table.bin` | 弹的拖尾 |

`func_1315` 切到 NT-D 时只写 `sys_4A(0x2e, 0x78, 0x78, 0x78)`。这是缩放，不换拖尾 ID。

---

## 4. 包里有文件、当前数据没有引用

下面四个名字的 crc32 对得上特效包里的 `.efxbn`。在 `2.c`、`vernier_table`、`effect_project`、`projectile_depiction_table`，以及 `001hito` / `400stick` 的 `.nuanmb` 字节里都没有搜到这些 hash。

| ID | 名字 |
|---|---|
| `0x6CD21296` | `eff_015gndmuc_008faunig_001_pvernier_001` |
| `0x5A570172` | `eff_015gndmuc_008faunig_001_direction_001` |
| `0xC35E50C8` | `eff_015gndmuc_008faunig_001_direction_002` |
| `0x4132659A` | `eff_015gndmuc_008faunig_001_flash_001` |

没有引用不等于运行时一定不播。它只说明现有机体脚本和这几张表没有点它们。

---

## 5. 不要混进去的东西

- `94.efxbn`（`0x59B8EFE7`）是视角光环，不是 BD 拖尾，也不是 `spark1` 精神骨架。骨架发光记在 gitignore 的 `local/notes/2026-10-12-faunig-psychoframe-skeleton-glow.md`。
- `sys_4A(0x3, …)` 在本页出现时按 analog profile 读，不按特效 ID 读。
