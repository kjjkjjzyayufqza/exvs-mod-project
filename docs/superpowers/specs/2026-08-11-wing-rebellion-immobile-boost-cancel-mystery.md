# Wing Zero Rebellion：不能移动 / BD 原地自动取消（未结案怪事记录）

日期：2026-08-11  
单位：`wing_gundam_zero_rebellion_*`（character id `900000004`）  
对照基线：`016gundmw_001wgzero_001`（`16001001`）  
状态：**症状曾出现，随后自行消失；根因未确认**  
性质：session repair / incident notes（非设计 spec）

---

## 1. 现象

操作侧（用户描述，后称“都有”）：

1. **坐标轴完全不能位移**（机体站着，轴上不走）。
2. **按住 boost**：会有短暂 boost 姿势/特效，但**原地**，随后**自动取消**。
3. **攻击仍可用**（出招/出弹正常）。

含义（工程解读，非已证结论）：

- 攻击链（action → arms/bullet）大致通。
- 移动/BD 更像 **gate 维持失败** 或 **位移结果被清零**，不是“整机脚本死掉”。

---

## 2. 当天相关改动范围（会话内）

意图工作：Wing Zero Rebellion **变形 enter** 试验 + motion 编辑器 LE/BE 显示。

| 区域 | 做过什么 | 结束时磁盘大致状态 |
|------|----------|-------------------|
| MSC `040msc/wing_gundam_zero_rebellion_msc` | 试接变形 enter / 再回退；motion id 曾误用 LE 串 `0xa621fd5e`，后改为 MSC 值 `0x5efd21a6`；最终 working tree 又回到**无变形接线**（三 action handler 为 `0`） | `2.c` / `2.dscex` 当天有重写；相对 016 源码主要差近战 effect 色，**无** enter-only 变形块 |
| Param `041cpm/wing_gundam_zero_rebellion_param` | 曾为飞行试验 **copy 出 speedparam 第二行 `0x09A2F239`**，后又从 backup **还原为 1 行** | 还原后 `speedparam.bin` **SHA = 016** |
| Motion | structure 重存；`0\0\test_motion\` 下测试 nuanmb（**未**进 structure 表） | 与 016 motion 的 fileIndex/`fileBaseName` 对齐；**无** `a621` 表项 |
| Model / SHL | **当天未改**（既有 8/9 装配差异，见 §5） | — |
| 前端 | Motion Folder **unk1/unk2 LE/BE 显示切换**（只影响编辑器 UI） | 不进游戏包 |

工作产物路径（可复查，非游戏必读）：

- `tmp/exvs2-json/wing-zero-transform/`（speed 编辑 request / before·after）
- `tmp/exvs2-json/wing-zero-param-diff/`（param 包对照）
- `tmp/exvs2-json/wing-zero-move-debug/`（只读 SHL audit 脚本等）

---

## 3. 排查时间线（简）

1. **怀疑 MSC 脚本索引挤偏**  
   - 中间插入函数会改变**插入点之后**的 script 编号。  
   - 整文件 `msclang` 按**名字**解析引用；**不能**单独解释“完全不能动”。  
   - 已在会话中更正该误判。

2. **怀疑 speedparam**  
   - 飞行 row `0x09A2F239` + MSC 切 `global142` 且表只有 1 行时，读表失败 → 速度全 0，**可以**造成能打不能走。  
   - 磁盘后来已还原为 1 行且 = 016。

3. **A/B：用户称不是 msc / param / motion**  
   - 只读复查：当天磁盘上 speed/characterparam = 016；motion 表未挂坏走 id；MSC 无变形接线。

4. **只读 SHL（model，非当天改动）**  
   - Rebellion SHL 相对 016：多 2 条、多条 **folderIndex 指错**；  
   - 尤其 body model id `0xCB1FD274` 指向 `bsrifle00b_out` 而非 `body_normal`。  
   - 与“能打不能走”机制相容，但用户判定**以前就能动**，要求**勿用旧 SHL 当今天主因**。

5. **再查 param vs 016**  
   - 整包 9 文件：仅 **`bulletparam.bin` 不同**（见 §4）。  
   - `speedparam` **相同**。

6. **结局**  
   - 用户反馈：**现在完全正常**；也不认为是 param。  
   - **没有稳定复现步骤，没有可指认的最终根因。**

---

## 4. 只读证据：param 相对 016 的真实 diff（当时磁盘）

路径：

- rebellion：`E:\XB\mod\041cpm\wing_gundam_zero_rebellion_param`
- 016：`E:\XB\mod\041cpm\016gundmw_001wgzero_001`

| 文件 | 结果 |
|------|------|
| arms / character / chrsys / grap / hitgroup / interaction / projectile_depiction / **speed** | **字节相同** |
| **bulletparam.bin** | **不同**（同长 7468，差 16 字节） |

`bulletparam` 仅 4 条 entry 的 **`hitgroupHash`**：

| entryId | 016 | rebellion |
|---------|-----|-----------|
| `0x78A1BCEA` | `0x15E630C0` | `0xFED18BC3` |
| `0x7AEF08AF` | `0x15E630C0` | `0xFED18BC3` |
| `0x7C054FAE` | `0x15E630C0` | `0xFED18BC3` |
| `0x83638B43` | `0x15E630C0` | `0xFED18BC3` |

这是 **8/9 量级的命中组引用改动**，机制上**很难单独解释** BD 维持失败；记录在案以免和 speed 试验混淆。

会话中 speed 试验备份：

- 还原前 1 行：`tmp/exvs2-json/wing-zero-transform/speedparam.before.bin`
- 曾写入 2 行：`tmp/exvs2-json/wing-zero-transform/speedparam.after.bin`

---

## 5. 旁路观察（非结案）：SHL folderIndex

只读对照（未改文件）：

- 016 SHL：body `0xCB1FD274` → folderIndex **1** → `body_normal`
- rebellion SHL：同 id → folderIndex **6** → **`bsrifle00b_out`**
- 多条官方武器 id 的 folderIndex 也指向自制 `*_out` 组

用户立场：该差异**更早存在且当时可玩**，故**不作为本次已证根因**。若日后复现，仍应用「只换 model/SHL」做 A/B。

---

## 6. MSC / motion 侧（当天结束时）

- Git：`E:\XB\mod\040msc` 中 wing `2.c` 以 `4428d9d` 从 `016gundmw_001wgzero_001` 拷入；会话变形改动**未**稳定留在最终 working tree 的“接线版”。
- Motion structure 重存差异主要是 Folder `Name` 从 null 填成序号；**data 文件名表与 016 一致**；`test_motion` **未**写入 structure。
- Motion 编辑器增加 **unk1/unk2 LE/BE 显示切换**（structure 存 LE 如 `a621fd5e`，MSC 整数值为字节反转如 `0x5efd21a6`）——避免以后再把 LE 显示串直接写进 `2.c`。

---

## 7. 明确**未**结案的内容

- 未找到可复现的最小改动集。  
- 未证明 bulletparam hitgroup、临时 speed 第二行、错误变形接线、SHL、加载缓存中**哪一个**触发了当天症状。  
- 未排除：**游戏实际加载路径 ≠ `E:\XB\mod` 当前磁盘**（dplcache / 旧 FHM / 热更覆盖）。

---

## 8. 若再次出现：建议顺序（省 token）

1. 记录：**能否短暂 BD 动作**、是否仅 rebellion、是否重启游戏后仍在。  
2. **确认进游戏的资源根**是否就是正在 diff 的目录。  
3. 整包 A/B（一次只换一类）：  
   - speedparam only  
   - 整份 `041cpm\wing_…` vs `016…`  
   - MSC `2.dscex` only  
   - motion FHM only  
   - model+SHL only  
4. 若曾接变形：检查是否 **`global142=0x09A2F239` 而 speed 只有 `0xC2B19D12`**。  
5. 勿先改 `func_11`；先证加载路径与包内容。

---

## 9. 给后续 Agent 的一句话

**2026-08-11 rebellion 出现过“轴不动 + BD 原地自动取消、仍可攻击”，磁盘上最终 msc/param/motion 对不上稳定根因，症状自愈。**  
param 相对 016 **仅 bulletparam 四条 hitgroupHash**；speed 曾短时 2 行后已还原。**不要把“脚本索引整体挤偏”当作移动失效主因。** 复现前禁止大范围重写 MSC/param。

---

## 10. 相关文档

- 变形移植计划：`docs/msc-research/2026-08-09-wing-zero-rebellion-transform-port-plan.md`
- Agent handoff：`docs/agent-sessions/2026-08-09-wing-zero-rebellion-transform-handoff.md`
- BD/gate 地图：`docs/msc-research/movement-boost-sys46-func11-map.md`
- `func_11`：`docs/msc-research/func11-c000-boost-gate-map.md`
