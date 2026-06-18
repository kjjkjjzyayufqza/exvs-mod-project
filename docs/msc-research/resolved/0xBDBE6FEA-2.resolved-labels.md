# 0xBDBE6FEA / 2.c semantic overlay 解析视图

对应文件：

- 机器事实：[generated/0xBDBE6FEA-2.analysis.json](../generated/0xBDBE6FEA-2.analysis.json)
- 人工语义：[overlays/0xBDBE6FEA-2.semantic-overlay.json](../overlays/0xBDBE6FEA-2.semantic-overlay.json)
- 样本：`E:\XB\解包\com\file\0xBDBE6FEA\2.c`

这页是 JSON overlay 的人类可读视图。它的用途是：

```text
以后 func_N、line、offset 变了，也不要从头猜。
先按 semanticId 找证据 shape，再把当前样本的 currentSymbol 当作临时定位。
```

## 1. 启动、初始化、主循环

| semanticId | 当前符号 | 层 | 证据 | 模组意义 |
|---|---|---|---|---|
| `depiction.entryPoint` | `main` | entry | `sys_2` 注册 `func_3/26/27`，先 `func_1()`，再 `callFunc3(func_4)` | 证明 `func_1` 是 init，`func_4` 是 loop |
| `depiction.initializer` | `func_1` | init | 清 `global1..19`，调用 `func_386/272/877`，写基础 `sys_1(0x10002,...)` | 不改武装参数；用来找系统初始化 |
| `depiction.unitShellResourceInitializer` | `func_877` | init | `sys_4B(0,0xab9c3043)`、`global20=sys_4B(1)`、`sys_4F(0xb,...)`、`func_887`、`func_1042` | 找默认 shell、武装 slot、action 表入口 |
| `depiction.actionUpdateLoop` | `func_4` | frame-loop | 被 `main` 安装；调用 `func_11`、`func_51`、`func_44`；读取 `sys_0(0x10000,...)` | 理解每帧顺序，不在这里改单招参数 |
| `depiction.boostCancelGate` | `func_11` | global-gate | 读 `0xc0001/3/5/c`，维护 `global23/43/45/54`，输出 `sys_52/sys_4C/sys_4F/sys_55/sys_56` | 改全局 cancel / overheat 边界时研究这里 |

关键结论：

```text
func_1 -> 铺系统
func_877 -> 铺本机体 shell / resource / action table
func_4 -> 每帧调度
func_11 -> 全局 boost / cancel gate
```

## 2. Registry 与 dispatch

| semanticId | 当前符号 | 层 | 证据 | 模组意义 |
|---|---|---|---|---|
| `depiction.registrationCoordinator` | `func_1042` | registry | 只调用 `func_1043/1044/1045/1046` | 四张注册表的总入口 |
| `depiction.actionHashRegistry` | `func_1043` | registry | 55 条 `func_241(actionHash, callback)` | 找某个动作入口的第一站 |
| `depiction.actionHashBinder` | `func_241` | registry | `sys_1(0x10002,0x2,hash,callback)` | action hash 到 callback 的写表 helper |
| `depiction.primaryActionDispatch` | `func_44` | dispatch | `global5 -> global3`，查 `sys_0(0x10002,0x2,global3)`，`sys_2(0,0x2,callback)` | primary action hash 到 ACTION callback |
| `depiction.secondaryActionDispatch` | `func_52` | dispatch | `global6 -> global4` 后查表，写 `global172=global87&0x3c`，`sys_2(0,0x3,callback)` | 方向派生 / secondary action 的入口 |

当前样本中最常用 action hash：

| 玩家语义 | action hash | callback | semanticId |
|---|---|---|---|
| 主射 | `0xf48d2d49` | `ACTION_A_SHOT` | `action.mainShot.setup` |
| 方向特射 / 援护 | `0x23df217e` | `ACTION_AC_SPECIAL_SHOT_DIRECTIONAL` | `action.specialShotAssist.setup` |
| 特格 | `0x193fe550` | `ACTION_BC_SPECIAL_MELEE` | `action.bcSpecialMelee.setup` |
| 特格 alt / 变形突进 | `0x6ab12717` | `ACTION_BC_SPECIAL_MELEE_ALT_2` | `action.bcSpecialMeleeAlt.transformRushSegment` |
| N 格 | `0x178d1109` | `ACTION_B_MELEE` | `action.bMelee.setup` |

## 3. Shell / loadout

| semanticId | 当前符号 | 层 | 证据 | 模组意义 |
|---|---|---|---|---|
| `depiction.defaultShellLoadoutSelector` | `func_887` | shell | 只读 `global170`，调用 `func_888(0/1)` | 默认外观恢复点 |
| `depiction.shellLoadoutDispatcher` | `func_888` | shell | `arg0` 分发 `0..8`，`0x7 -> func_1037`，`0x8 -> func_1038` | 改挂件 / 变形外观时从这里定位 |

Notion 经验对应：

| syscall | 当前读法 |
|---|---|
| `sys_4B(0x2, model, bone, action, target)` | 把模型挂到模型 / bone |
| `sys_4B(0x3)` | 解除装备 / detach |
| `sys_47(0x10/0x11/0x12,...)` | rotate / translate / scale |

改 shell 时必须同时找恢复路径。只改 `func_888` 的进入分支，容易留下挂件残留。

## 4. 主射链

| semanticId | 当前符号 | 层 | 证据 | 可改点 |
|---|---|---|---|---|
| `runtime.ranged.reset` | `func_586` | runtime | 被 ranged ACTION 先调用，属于 `global676..681` runtime family | 通用 reset，一般不先改 |
| `runtime.ranged.driver` | `func_587` | runtime | `func_913 -> func_587()`，驱动 `global677/680` callback | 看相位顺序 |
| `action.mainShot.setup` | `ACTION_A_SHOT` | action-setup | `global677=func_914`，`global680=func_915`，`global681=0` | 找主射 slot 和段 callback |
| `action.mainShot.startupSegment` | `func_914` | segment | `global170=0 -> func_887()`，`func_610(...)`，`sys_0(0x90000,0,0)` | 改起手 motion / timing |
| `action.mainShot.fireSegment` | `func_915` | segment | `sys_4F(0,0,0xcc9f6df0)`，`func_123(0x280)` | 改主射 weapon hash |

Notion 经验对应：

| 调用 | 当前读法 |
|---|---|
| `sys_0(0x90000,slot,0)` | 检查 weapon slot / ammo |
| `sys_4F(0,slot,weaponHash)` | 发射 / weapon request |
| `sys_4F(0x7,slot,1)` | 主动扣弹 |

## 5. 援护 / 方向特射链

| semanticId | 当前符号 | 层 | 证据 | 可改点 |
|---|---|---|---|---|
| `runtime.meleeSpecial.reset` | `func_488` | runtime | 多个 melee / special ACTION 共用 | 通用 reset，不改单招 |
| `runtime.specialMovement.driver` | `func_502` | runtime | 驱动 `global609` 类 special movement callback | 看相位，不改单招参数 |
| `action.specialShotAssist.setup` | `ACTION_AC_SPECIAL_SHOT_DIRECTIONAL` | action-setup | `global609=func_952`，`global200=(global87&0x3c)` | 判断 N 特射 / 方向特射 |
| `action.specialShotAssist.spawnSegment` | `func_952` | segment | `sys_51(... index,type)` 四条，`sys_4F(0x7,2,1)` 扣弹 | 改援护 type / index / ammo slot |

方向位来自 Notion 和当前脚本：

| bit | 方向 |
|---|---|
| `0x4` | 前 |
| `0x8` | 后 |
| `0x10` | 左 |
| `0x20` | 右 |

## 6. N 格与派生窗口

| semanticId | 当前符号 | 层 | 证据 | 可改点 |
|---|---|---|---|---|
| `runtime.melee.driver` | `func_489` | runtime | 被 N 格和部分特格 alt 使用，驱动 `global602` | 看 melee 相位，不改单招 |
| `action.bMelee.setup` | `ACTION_B_MELEE` | action-setup | `func_219(0xde3d1477)`，`global602=func_966` | 找 N 格参数 row 和第一段 |
| `action.bMelee.branchSegment` | `func_967` | segment | `func_532`、`func_535`、三条 `func_536`、`func_123/125` | 改二段、派生、取消 |
| `branch.windowRangeSetter` | `func_535` | branch | 写 `global401/402 = start/end * 0x64` | 改派生窗口范围 |
| `branch.callbackRegistrar` | `func_536` | branch | `global140 |= mask`，按 mask 保存 time / callback | 改派生输入、时间、目标 |
| `branch.inputResolver` | `func_239` | branch | 读 `global140/global87/global49/global92`，写 `global430` | 共用消费器，避免为单招改它 |

模组规则：

```text
改派生早晚 -> 先看 func_536 的 time
改派生开放范围 -> 先看 func_535
改方向派生 -> 看 mask 和 global87 方向位
不要先改 func_239
```

## 7. 特格 / 特殊移动

| semanticId | 当前符号 | 层 | 证据 | 可改点 |
|---|---|---|---|---|
| `action.bcSpecialMelee.setup` | `ACTION_BC_SPECIAL_MELEE` | action-setup | `global609=func_940`，`global452/453/454` local movement defaults | 找特格横移段 |
| `action.bcSpecialMelee.directionalMovementSegment` | `func_940` | segment | 读 `global172&0x10/0x20`，`sys_46(0,global265)`，常量 `0x28/0xffffffd8/0xa/0xfffffff6` | 改左右横移距离 / 时长 |
| `action.bcSpecialMeleeAlt.transformRushSegment` | `func_937` | segment | `sys_46(0x5,0,0x46,0x64)`，`func_532/535/536`，`func_321(0x651e4f06)` | 改变形突进、派生、镜头 |

边界：

```text
普通 BD / step -> speed_param
特格横移 -> func_940
全局 cancel gate -> func_11
```

## 8. 镜头

| semanticId | 当前符号 | 层 | 证据 | 可改点 |
|---|---|---|---|---|
| `camera.presetWrapper` | `func_321` | camera | `sys_53(0x4,arg0,0x4650)`，被 `func_937` 等 segment 调用 | 改 camera preset hash |

Notion 经验对应：

| 调用 | 当前读法 |
|---|---|
| `sys_53(0x4,hash,...)` | camera preset |
| `sys_53(0x5)` | camera cleanup candidate |
| `sys_53(0,...)` | 画面震动 |
| `sys_53(0x2,...)` | 镜头缩放候选 |

改镜头必须同时找清理点。测试至少覆盖命中、空挥、被打断、BD cancel、死亡复归。

## 9. 按目标查 semanticId

| 目标 | 先看 semanticId | 不建议先看 |
|---|---|---|
| 证明 `func_1` 在做什么 | `depiction.entryPoint`、`depiction.initializer`、`depiction.unitShellResourceInitializer` | 单个 ACTION segment |
| 找某个动作入口 | `depiction.actionHashRegistry` | `func_887/888` |
| 改主射弹种 | `action.mainShot.fireSegment` | `depiction.primaryActionDispatch` |
| 改主射起手 | `action.mainShot.startupSegment` | `runtime.ranged.reset` |
| 改援护类型 | `action.specialShotAssist.spawnSegment` | `runtime.specialMovement.driver` |
| 改 N 格派生 | `action.bMelee.branchSegment`、`branch.callbackRegistrar` | `branch.inputResolver` |
| 改特格横移 | `action.bcSpecialMelee.directionalMovementSegment` | `depiction.boostCancelGate` |
| 改普通 BD / step | `resource.speed_param.*`，见 `movement-bd-modding-workbook.md` | `action.bcSpecialMelee.directionalMovementSegment` |
| 改镜头 preset | `camera.presetWrapper` 的调用点 | 只改启用点、不找清理 |
| 改默认挂件 | `depiction.shellLoadoutDispatcher` | 单个动作段 |

## 10. 跨样本使用方式

换另一个机体样本时，不要拿当前 `func_N` 直接套。

执行顺序：

1. 对新 `2.c` 跑 `tools/msc_c_static_analyzer.py`。
2. 找大量 `func_241(hash, callback)` 的函数，匹配 `depiction.actionHashRegistry`。
3. 找 `main -> initializer -> callFunc3(loop)` 形状，匹配入口和主循环。
4. 找 `sys_4B(0,baseShell)`、`sys_4F(0xb,...)`、`global170 -> loadout` 形状，匹配 shell 初始化。
5. 按 ACTION setup 写入的 callback global 找 runtime 和 segment。
6. 只把高置信标签用于 UI 或批量重命名；中置信标签保留为研究提示。

## 11. 当前边界

这份 resolved view 已经能支撑当前样本的脚本侧模组定位，但仍然不等于 native 反编译完成：

- `sys_46` 子命令只保留脚本侧工作名，不写最终 native 参数名。
- `0xc000*` 只保留 gate 状态槽工作模型，不写最终 native 来源。
- damage / down value / proration / hitbox 仍要继续接 resource 和 native handler。
- raw input 到 action hash 的完整转换还需要继续合并 `0.c` / `1.c` 或 native input selector。

## 12. 来源

- [2.c 函数职责证明手册](../2c-function-responsibility-proof-handbook.md)
- [动态命名与 JSON Overlay 方案](../dynamic-naming-overlay.md)
- [BD / 移动 / `sys_46` 模组开发工作簿](../movement-bd-modding-workbook.md)
- Notion MSC 页：`https://app.notion.com/p/1601ebad394d8027a042df115e61b6dd`
- OverBoost wiki システム：`https://w.atwiki.jp/exvs2ob/pages/593.html`
- OverBoost wiki テクニック：`https://w.atwiki.jp/exvs2ob/pages/683.html`
