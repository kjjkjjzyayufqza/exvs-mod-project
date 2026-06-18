# MSC 模组实战 walkthrough：从玩家目标追到可改点

样本：

```text
E:\XB\解包\com\file\0xBDBE6FEA\2.c
```

这页把前面的调用链、角色地图、Notion syscall 经验合到一起，按“我要改什么”走完整路径。它的目的不是一次性证明所有 native 语义，而是让逆向者可以开始做小范围模组改动，并知道该测什么。

## 0. 固定追踪模板

每个动作都按同一套模板追：

```text
玩家目标
  -> action hash 注册表: func_1043 / func_241
  -> 本帧 dispatch: func_44 或 func_52
  -> ACTION_* setup
  -> runtime driver: ranged / melee / special movement
  -> segment callback
  -> 输出 syscall: motion / weapon / assist / movement / camera / shell
  -> cleanup / restore
  -> 实机验证
```

改动时只动目标层。不要为了改一个弹种去改 `func_1`、`func_44`、`func_586` 这类基础结构。

## 1. 改主射弹种

玩家目标：

```text
把主射发出的弹换成另一个 weapon resource。
```

完整链路：

```text
func_1043
  -> func_241(0xf48d2d49, ACTION_A_SHOT)

func_24
  -> global5 = sys_0(0x10000,0,0x10)

func_44
  -> global3 = global5
  -> callback = sys_0(0x10002,0x2,global3)
  -> sys_2(0,0x2,callback)

ACTION_A_SHOT
  -> func_586()
  -> global677 = func_914
  -> global680 = func_915
  -> global681 = 0
  -> callFunc3(func_913)

func_913
  -> func_587()

func_914
  -> global170 = 0
  -> func_887()
  -> func_610(0x91351d9e,0xd,0xffffffff)
  -> sys_0(0x90000,0,0)
  -> func_123(0x280) when repeated shot state allows

func_915
  -> sys_0(0x90000,0,0)
  -> func_123(0x280)
  -> sys_4F(0,0,0xcc9f6df0)
  -> global773++
  -> func_123(0xc00000)
```

人话：

- `ACTION_A_SHOT` 不是发射帧，它只是安装主射 runtime。
- `global681=0` 表示主射使用 ammo slot 0。
- `func_914` 做起手、外观恢复、motion setup、ammo 可用检查。
- `func_915` 才是主射 weapon request 的强候选，因为它直接 `sys_4F(0,0,0xcc9f6df0)`。

Notion / 项目语义：

- `sys_0(0x90000,slot,0)`：检查 weapon slot / ammo 可用状态。
- `sys_4F(0,slot,weaponHash)`：请求发射 weapon resource。
- `sys_4F(0x7,slot,1)`：主动扣某个 slot 的 ammo。
- `func_123(mask)`：打开 cancel route / state mask。

可改点：

| 目标 | 改哪里 | 一起检查 |
|---|---|---|
| 换弹种 | `func_915` 的 `0xcc9f6df0` | resource 是否存在、命中/弹速资源是否匹配 |
| 换 ammo slot | `ACTION_A_SHOT global681=0`、`func_914/915 sys_0(0x90000,0,0)`、`sys_4F(0,0,hash)` | slot 全链一致 |
| 改起手动作 | `func_914 -> func_610(0x91351d9e,...)` | 发射帧是否还对齐 |
| 改连射 / 取消 | `func_123(0x280)`、`func_81(0xf48d2d49,...)` | BD cancel、连射、空弹 |

不建议先改：

- `func_44`：这是通用 action dispatch。
- `func_586`：这是 ranged runtime reset。
- `func_1`：这是启动初始化。

验证：

- 有弹主射能发。
- 空弹不发或走原本空弹逻辑。
- 连射不会卡 `global773`。
- BD cancel 后动作能恢复。
- shell 没有残留异常。

## 2. 改特射援护类型

玩家目标：

```text
修改 N 特射 / 方向特射召唤的援护 type。
```

完整链路：

```text
func_1043
  -> func_241(0x23df217e, ACTION_AC_SPECIAL_SHOT_DIRECTIONAL)

ACTION_AC_SPECIAL_SHOT_DIRECTIONAL
  -> func_488()
  -> global609 = func_952
  -> global390 = 0xffffffff
  -> global613 = 0x14
  -> global200 = (global87 & 0x3c) ? 1 : 0
  -> callFunc3(func_951)

func_951
  -> func_502()

func_952
  -> func_308(global20,0x51f5773a,...)
  -> if func_309(global20,0x1f4):
       if global200 == 1:
         sys_51(0x20000,0,0x2,0,0x5)
         sys_51(0x20000,0,0x2,1,0x6)
       else:
         sys_51(0x20000,0,0x2,0,0x2)
         sys_51(0x20000,0,0x2,1,0x4)
       sys_4F(0x7,0x2,1)
       func_123(0x281)
```

人话：

- `global200` 是是否按方向的分支标记。
- `sys_51(..., index, type)` 是援护召唤，Notion 记录里第 4 参数是援护 index，第 5 参数是 type。
- `sys_4F(0x7,0x2,1)` 扣的是 ammo slot 2，不是援护 index。
- `func_309(global20,0x1f4)` 是援护出现帧。

可改点：

| 目标 | 改哪里 | 一起检查 |
|---|---|---|
| 改 N 特射援护 | `global200 == 0` 分支的 type `0x2/0x4` | 两个 index 是否仍对应左右 / 前后 |
| 改方向特射援护 | `global200 == 1` 分支的 type `0x5/0x6` | 方向输入是否正确进入 |
| 改出现时间 | `func_309(global20,0x1f4)` | motion 和语音/特效是否对齐 |
| 改扣弹 slot | `sys_4F(0x7,0x2,1)` | HUD slot、空弹检查、reload |
| 改取消路线 | `func_123(0x281)` | 能否接 BD / 主射 / 格斗 |

不建议先改：

- `func_502`，它是 special movement runtime driver。
- `func_488`，它是 runtime reset。

验证：

- N 特射和方向特射分别测。
- 左右方向输入都测。
- 每次只扣一次 ammo。
- 援护不会重复滞留。
- 被打断时援护和动作状态能收尾。

## 3. 改特格突进 / 变形冲刺

玩家目标：

```text
改变特格突进的运动、派生窗口、镜头或变形外观。
```

完整链路：

```text
func_1043
  -> func_241(0x6ab12717, ACTION_BC_SPECIAL_MELEE_ALT_2)

ACTION_BC_SPECIAL_MELEE_ALT_2
  -> func_488()
  -> func_219(0x769a714e)
  -> global602 = func_936
  -> global390 = 0xa
  -> global613 = 0
  -> callFunc3(func_935)

func_935
  -> func_489()

func_936
  -> func_888(0x7)
  -> func_308(global20,0xe6bd9694,...)
  -> sys_58 / sys_4A effects
  -> func_531(func_937)
  -> func_296(0x3e8,1)
  -> if func_309(global20,0x8fc): func_123(0x381)

func_937
  -> func_296(0x3e9,0)
  -> sys_46(0x5,0,0x46,0x64)
  -> func_532(0x1f,0x20,0x64)
  -> func_535(0,0x3e7)
  -> func_536(0x1,0,func_945)
  -> func_123(0x200)
  -> if func_544() && global36 == 0 && global241 == 0:
       func_321(0x651e4f06)
```

人话：

- `func_219(0x769a714e)` 是这招的参数 row 入口，改突进/追踪前先看它加载了什么。
- `func_888(0x7)` 是进入 alternate shell mode，不是位移本身。
- `sys_46(0x5,0,0x46,0x64)` 是动作局部 movement 初值候选。
- `func_532/535/536` 控接近、窗口、派生输入的可能性更高。
- `func_321(0x651e4f06)` 是 camera preset wrapper。

可改点：

| 目标 | 改哪里 | 风险 |
|---|---|---|
| 改突进参数 | `func_219(0x769a714e)` 对应资源 row、`sys_46(0x5,...)`、`func_532/535` | 中到高，`sys_46` native case 未最终命名 |
| 改派生窗口 | `func_536(0x1,0,func_945)` | 中，mask 需要对应输入 |
| 改变形外观 | `func_888(0x7)`、`func_1037`、`func_1038`、`func_887` | 高，必须测恢复 |
| 改镜头 | `func_321(0x651e4f06)` 和清理点 `sys_53(0x5)` | 中，容易残留 |
| 改 cancel 时机 | `func_123(0x381)`、`func_123(0x200)` | 高，会影响动作可取消性 |

验证：

- 地上 / 空中。
- overheat。
- N 输入 / 方向输入。
- 命中 / 空挥。
- 被打断 / BD cancel。
- 动作结束后 shell 是否回默认。
- 镜头是否清掉。

## 4. 改 N 格派生窗口

玩家目标：

```text
调整 N 格第 2 段后能接哪些派生、哪个时间点可派生。
```

完整链路：

```text
func_1043
  -> func_241(0x178d1109, ACTION_B_MELEE)

ACTION_B_MELEE
  -> func_488()
  -> func_219(0xde3d1477)
  -> global602 = func_966
  -> callFunc3(func_965)

func_965
  -> func_489()

func_966
  -> func_308(global20,0x3894dc3b,...)
  -> func_531(func_967)
  -> global170 = 1
  -> func_887()
  -> func_123(0x200)

func_967
  -> func_308(global20,0xe50205be,...)
  -> func_532(0x2,0xd,0x58)
  -> func_535(0x1,0xa)
  -> func_536(0x1,0xf,func_968)
  -> func_536(0x20,0xf,func_980)
  -> func_536(0x4,0xf,func_1007)
  -> func_123(0x200)
  -> func_125(0xc00000)
```

人话：

- `ACTION_B_MELEE` 只安装 N 格 runtime。
- `func_489` 驱动 melee runtime。
- `func_966` 是第一段 segment，切 shell group 并进入 `func_967`。
- `func_967` 才是派生窗口密集出现的位置。
- `func_536(mask,time,callback)` 是派生窗口注册候选。

可改点：

| 目标 | 改哪里 | 一起检查 |
|---|---|---|
| 改派生时间 | `func_536(...,0xf,callback)` 的时间参数 | `func_239` 如何消费窗口 |
| 改派生方向 / 输入 | `func_536` 的 mask `0x1/0x20/0x4` | `global172/global175` 方向 bit |
| 改二段 motion | `func_308(...,0xe50205be,...)` | 命中帧、派生窗口 |
| 改接近 / 追踪 | `func_532(0x2,0xd,0x58)`、`func_535(0x1,0xa)` | hit / contact 语义仍需 native 验证 |
| 改取消路线 | `func_123(0x200)`、`func_125(0xc00000)` | step / BD / 派生 |

验证：

- 空挥能不能派生。
- 命中后能不能派生。
- 前后左右输入是否正确。
- step cancel / BD cancel 是否仍正常。
- hitstop 或命中后移动有没有异常。

## 5. 改镜头演出

玩家目标：

```text
给某段格斗 / 特格 / 觉醒技改镜头 preset，且不残留。
```

基础语义：

```text
func_321(hash)
  -> sys_53(0x4,hash,0x4650)

sys_53(0x5)
  -> 清理 camera preset 候选
```

查找路径：

```text
1. 从 action registry 找目标 ACTION_*。
2. 进入 segment callback。
3. 搜 func_321 或 sys_53(0x4)。
4. 同一条动作链上搜 sys_53(0x5)。
5. 检查动作结束、被打断、BD cancel、死亡复归是否都会清理。
```

本样本例子：

```text
特格后续段 func_937
  -> if func_544() && global36 == 0 && global241 == 0:
       func_321(0x651e4f06)
```

可改点：

| 目标 | 改哪里 | 风险 |
|---|---|---|
| 换镜头 | `func_321(cameraHash)` 的 hash | 中，hash 必须存在 |
| 改镜头触发条件 | 包住 `func_321` 的 `func_544/global36/global241` 条件 | 高，可能触发过多或不触发 |
| 改镜头触发时间 | 相关 `func_309` 或条件 | 中，需和命中/演出帧对齐 |
| 防残留 | 找 `sys_53(0x5)` 清理路径 | 必须做 |

验证：

- 命中镜头正常。
- 空挥不乱切镜头。
- 被打断清镜头。
- BD cancel 清镜头。
- 下一次动作不继承上一次镜头。

## 6. 改 shell / 换装 / 组件

玩家目标：

```text
改某动作时挂什么组件、是否进入变形 shell、结束后如何恢复。
```

基础链：

```text
func_877
  -> sys_4B(0,0xab9c3043)
  -> global20 = sys_4B(1)
  -> global170 = 0
  -> func_887()
  -> func_1042()

func_887
  -> if global170 == 0: func_888(0)
  -> else: func_888(1)

func_888(mode)
  -> 0..6: shell loadout variants
  -> 7: func_1037()
  -> 8: func_1038()

func_1037
  -> sys_4B(0x3)
  -> sys_4B(0,0xcb05586)
  -> global20 = 0xcb05586
  -> sys_4F(0xb,...)
  -> global143 = 1

func_1038
  -> sys_4B(0,0xab9c3043)
  -> global20 = 0xab9c3043
  -> global143 = 0
  -> global170 = 0
  -> func_887()
```

Notion / 项目语义：

- `sys_4B(0x2, modelHash, boneIndex, actionHash, targetModel)`：接模型到模型 / bone。
- `sys_4B(0x3)`：解除装备 / detach。
- `sys_47(0x10/0x11/0x12, model, bone, x,y,z)`：rotate / translate / scale。

可改点：

| 目标 | 改哪里 | 风险 |
|---|---|---|
| 改默认挂件 | `func_888(0/1)` 下游 loadout helper | 高，影响全机 |
| 改动作中临时变形 | 动作 segment 里的 `func_888(0x7)` / `func_1037` | 高，必须找恢复 |
| 改恢复到默认 | `func_1038`、`func_887`、动作结束路径 | 高 |
| 改骨骼挂点 | `sys_4B(0x2,model,bone,...)` 的 bone index | 中，需 JNTT 骨骼索引 |
| 改部件缩放 / 位置 | `sys_47(0x10/0x11/0x12,...)` | 中 |

验证：

- 动作开始外观正确。
- 动作中 cancel 外观能恢复。
- 被击中 / down / 死亡复归后能恢复。
- 下一个动作不继承错误 shell。
- 自定义骨骼如果没有动画，不要期待它跟随原模型动作。

## 7. 每次 patch 前的审计单

```text
目标:
玩家输入:
action hash:
ACTION callback:
primary / secondary channel:
runtime driver:
segment callback:
motion hash:
weapon / assist syscall:
movement syscall:
camera syscall:
shell change:
cancel mask:
ammo slot:
cleanup path:
不改的基础函数:
实机验证场景:
```

最小验证场景：

- 地上。
- 空中。
- overheat。
- 有弹 / 空弹。
- 命中 / 空挥。
- 被打断。
- BD cancel。
- step cancel。
- 死亡复归。
- 连续使用两次。

## 8. 来源和相关页

- 当前样本：`E:\XB\解包\com\file\0xBDBE6FEA\2.c`
- Notion MSC 页：`https://app.notion.com/p/1601ebad394d8027a042df115e61b6dd`
- OverBoost wiki 系统页：`https://w.atwiki.jp/exvs2ob/pages/593.html`
- OverBoost wiki テクニック页：`https://w.atwiki.jp/exvs2ob/pages/683.html`
- [2.c 逐帧生命周期：从玩家动作到 MSC 输出](./2c-frame-lifecycle-human-trace.md)
- [2.c 函数角色地图：把 `func_N` 翻成人话](./2c-function-role-map-for-modders.md)
- [MSC 模组开发 cookbook：按改动目标反查 `2.c`](./modding-cookbook-action-editing.md)
