# Scene Editor：border 与 spawn 点先读出来

> 给改 Scene Editor 的人。读取和出生点写回已经接上。边界用场景模型重新生成 `info/border_hit.hkt`，不改压缩网格的顶点。

**状态：** 读取已落地。出生点、标记、重生点和范围圆在视口里拖动，并按原字节写回 `plan_param.spbin`。`border_hit.hkt` 在视口里画成琥珀色线框。视口右键「生成边界 HKT」，或属性栏的模型列表，会用选中模型的网格生成并写入 `info/border_hit.hkt`，不替换该模型自己的 `map_hit.hkt`。网格顶点编辑仍未做。

**目标版本：** OB 及更早。样本是本机已解包的 `E:\XB\mod\001stage`（可用环境变量 `EXVS_OB_STAGE_CORPUS` 换根目录）。不要把这些地图文件提交进 git。

## 现在能不能编辑

出生点可以拖。边界可以换成某个场景模型生成的 HKT，不能逐顶点改。

| 文件 | Scene Editor 今天做什么 |
| --- | --- |
| `info/border_hit.hkt` | 打开舞台时扫到这份文件，装了 Havok Content Tools 就在视口里画琥珀色线框。视口右键「生成边界 HKT」列出 base 和子模型；属性栏也可以选同一个模型再生成。命令是 `scene_generate_hkt_from_mesh`，`targetId` 固定为 `info/border_hit.hkt`。生成结果立刻写到舞台目录，并留在会话里，下次保存文件夹也会带上。不改该模型的 `map_hit.hkt`。 |
| `info/plan_param.spbin` | 打开舞台时读入。摆放页可以改 limit 和每个点的 xyz，视口里可以拖。第四个浮点（出生点的 `w`、marker 角度、重生点的填充）保持原样。保存文件夹和保存 fhm2d 都会在这项有改动时写回原文件。 |
| `stage_boundary.csv` | 只出现在「这是不是 info 目录」的文件名名单里。这次扫过的地图里一份都没有。 |

`placement.csv` 里的物体摆放是另一件事，编辑器已经能改。那不是出生点。

## 磁盘上实际长什么样

2026-10-15 扫了 `E:\XB\mod\001stage` 下面 120 份 `plan_param.spbin` 和 120 份 `border_hit.hkt`。根上的 OB 解包是 `0x16F73C97`、`201stage201`、`203stage203`、`210stage210`、`stage252`。`group/` 里是移植和视觉测试副本。`pairs_map` 的 spawn 文件是 0 字节，读取必须报错。

### `plan_param.spbin`

小端。和 MBON `STPP` 是同一张四段表，字节布局不同。119 份非空文件都精确吃完最后一个重生点，没有尾部垃圾。

| 偏移 | 内容 |
| --- | --- |
| `0x00` | `A9 B8 AC AF` |
| `0x04` | `u32` 出生对数量 |
| `0x08` | `u32` marker 数量 |
| `0x0C` | `u32` 重生点数量 |
| `0x10` | 4 个 `u64` 段偏移：limit、出生对、marker、重生点 |
| `0x30` | `f32` limit，再加一个 `f32` 0 |
| 其后 | 出生对：每条 32 字节，两个 `x,y,z,w` |
| 其后 | marker：每条 16 字节，`x,y,z` 加一个 `f32` |
| 其后 | 重生点：每条 16 字节，`x,y,z` 加一个 0 |

这次样本里的形状：

| 出生对 | marker | 重生点 | 文件数 | 代表 |
| --- | --- | --- | --- | --- |
| 4 | 2 | 16 | 95 | 大多数 `group/` |
| 1 | 2 | 16 | 9 | |
| 3 | 2 | 16 | 9 | 第二点的 `w` 是 3.5 |
| 4 | 2 | 18 | 4 | `201stage201`、`210stage210`、`stage252` |
| 1 | 2 | 21 | 1 | `0x16F73C97`，456 字节 |
| 2 | 2 | 9 | 1 | `mbon_practice`，296 字节 |

- limit：118 份是 1000，`mbon_la_gramis` 是 3000。OB 原图这几份都是 1000。
- 出生对第一个 `w` 全是 1。第二个 `w` 多数是 1，9 张图（含视觉测试副本）是 3.5。不要写成「一定是 1」。
- marker 的第四个数：235 个是 0，另外三个是 `pi`（`0x16F73C97` 的第二个点）、`pi/2`（`stage252` 的第一个点）、约 8 度（`203stage203` 的第一个点，`8 * pi / 180`）。MBON 这边是小整数。含义还没证明，读取必须留原始 `f32`。
- 重生点第四个数全是 0。所有浮点的绝对值都不超过 3000。
- `mbon` 舞台移植的 `plan_param_bytes` 会把 marker 第四个数写成 0。那是移植器的有损写出，不是 OB 文件的布局。新读取器按磁盘原值读，不调用那个写出器来当解码器。

### `border_hit.hkt`

120 份都是 Havok `TAG0` 标签文件，类型表里都有 `hkRootLevelContainer` 和 `hknpCompressedMeshShape`，`DATA` 里都有 `Scene Data` 和 `Physics Scene Data`，`ITEM[0]` 是 12 字节 0。

| SDK | 份数 | `TYPE` 子块 |
| --- | --- | --- |
| `20180100` | 114 | `TSTR TNA1 FSTR TBDY TPAD` |
| `20160200` | 4 | 同上。`201stage201`、`203stage203`、`210stage210`、`stage252` |
| `20160100` | 2 | `TSTR TNAM FSTR TBOD TPAD`。`0x16F73C97` 和 `pairs_map` |

块头是大端：高 8 位是标志，低 24 位是含 8 字节头的总长度。`DATA` 里的数值是小端。旧笔记里的块名 `TNA1` / `TBDY` 对 118 份成立；SDK `20160100` 用的是 `TNAM` / `TBOD`。

三角形和包围盒还不在这个读取器里。完整标签文件反序列化仍然是 `.claude/plans/havok-hkt-xml-converter.plan.md` 那条线。这一阶段只确认容器、SDK、类型名和场景标签，避免在网格语义还没测过时假装能编辑 border。

## 已经接上的代码

- `src-tauri/src/format/plan_param.rs`：`parse_plan_param`、`write_plan_param`。写出必须和读入字节相同，marker 角度和 `3.5` 留着。
- `src-tauri/src/format/border_hit.rs`：`parse_border_hit`
- `src-tauri/src/stage_commands.rs`：`read_stage_plan_param`、`encode_plan_param`、`read_stage_border_hit`
- 场景编辑器摆放页和视口：移动 xyz。保存文件夹和保存 fhm2d 在这项有改动时写 `info/plan_param.spbin`。
- `src-tauri/tests/stage_border_spawn_test.rs`：手造字节，加上上面那批地图的交叉验证，非空文件要求写回字节相同。

交叉验证在本机跑 `cargo test --test stage_border_spawn_test`。目录不在时，磁盘那一条测试跳过，手造字节的测试仍然跑。

## 还不做

- 不把 `border_hit.hkt` 解成三角形，也不在视口里改它的顶点。换边界走「选一个场景模型，用现有 Havok CLI 生成 `info/border_hit.hkt`」。
- 不把 `stage_boundary.csv` 当成已经存在的格式。
- 不把解包地图、坐标表或 `.hkt` 提交进 git。
