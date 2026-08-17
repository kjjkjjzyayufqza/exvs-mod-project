# MSC 模组开发系统卡片手册

样本：

```text
E:\XB\解包\com\file\0xBDBE6FEA\2.c
```

当前静态分析快照：

```text
lineCount: 29664
functionCount: 1047
actionFunctionCount: 21
sha256: 1BE5DACB24FC6565680CC15C4B4045FEC80229E958D690E5AE8BABE973224589
```

这页不是新的 syscall 百科，而是给实际改机体的人用的系统卡片。每张卡固定回答：

```text
玩家语言里这是什么
2.c 里它在哪一层
从哪里进入
真正可改点在哪里
哪些地方不要先碰
改完怎么测
```

## 0. 总路线卡

先把任何目标放进这条主链：

```text
main
  -> func_1                         启动初始化
  -> func_877                       shell / resource / action table 初始化
  -> func_1042 / func_1043          action hash registry
  -> callFunc3(func_4)              每帧 action loop

func_4
  -> func_21/24/25                  读方向、action candidate、route state
  -> func_11                        boost / cancel gate
  -> func_44 / func_52              action hash -> ACTION_* callback
  -> ACTION_*                       runtime setup
  -> runtime driver                 ranged / melee / special movement
  -> segment callback               motion、发射、移动、镜头、shell、effect
```

第一条规则：

```text
如果你还没找到 ACTION_* 和 segment callback，就还没到真正可改点。
```

第二条规则：

```text
如果一个函数只在 init 链里出现，先不要把它当成动作性能函数改。
```

第三条规则：

```text
如果一个 syscall 出现在 action commit 清场里，先不要把它当成动作参数改。
```

## 1. 启动 / 初始化卡

玩家语言：

```text
机体脚本开局装载了哪些系统？为什么 func_1 看起来什么都管？
```

当前锚点：

| 符号 | 行号 | 工作名 |
|---|---:|---|
| `main` | 779 | script entry / VM callback install |
| `func_1` | 789 | init depiction script runtime |
| `func_877` | 25407 | init unit shell / resource / action tables |
| `func_1043` | 29413 | register action hash handlers |

读法：

```text
main 先注册 func_3/26/27，再调用 func_1，最后进入 func_4。
因此 func_1 是主循环前的总初始化。
```

`func_1` 初始化的系统：

| 证据 | 初始化对象 | 模组含义 |
|---|---|---|
| 清 `global1..19` | 顶层 callback、active / pending action、route state | 不要把这些清零当成动作参数 |
| `func_386()` | 大量 runtime global | 射击、格斗、移动、shell、状态缓存默认值 |
| `func_61/62()` | gate / cancel 默认状态 | 影响全局动作门控 |
| `sys_1(0x10002,0x2,hash,func)` | 基础 action callback 表 | 少量默认动作注册 |
| `func_877()` | 本机体 depiction 初始化 | active shell、resource slot、action table |

可改点：

- 一般不把 `func_1` 当作性能改点。
- 查“某动作入口在哪里”时，看它最后进入的 `func_877 -> func_1042/1043`。
- 查“默认外观是什么”时，看 `func_877 -> func_887/888`。

不要先碰：

- `func_1` 开头的全局清零。
- `func_386` 大面积默认值，除非已经知道具体 global 家族。

验证：

| 场景 | 观察 |
|---|---|
| 进战斗 | 不崩，active shell 正常 |
| 主射 / 格斗 / 特格 | action registry 能 dispatch |
| 死亡复归 | 默认 shell 和资源槽恢复 |

## 2. Action Registry / Dispatch 卡

玩家语言：

```text
A、B、AB、AC、BC、ABC 这些动作怎么找到对应函数？
```

当前锚点：

| 符号 | 行号 | 工作名 |
|---|---:|---|
| `func_1043` | 29413 | register action hash handlers |
| `func_241` | 6225 | bind action hash handler |
| `func_44` | 2615 | dispatch primary action hash |
| `func_52` | 2765 | dispatch secondary action hash |

固定形状：

```text
注册:
  func_1043 -> func_241(hash, ACTION_*)
  func_241 -> sys_1(0x10002, 0x2, hash, callback)

执行:
  func_44 / func_52
    -> callback = sys_0(0x10002, 0x2, actionHash)
    -> sys_2(0, channel, callback)
```

核心 ACTION：

| 玩家侧语义 | action callback | 行号 |
|---|---|---:|
| 主射 | `ACTION_A_SHOT` | 25765 |
| 副射 | `ACTION_AB_SUB` | 26257 |
| 方向特射 / 援护 | `ACTION_AC_SPECIAL_SHOT_DIRECTIONAL` | 26957 |
| 特格 alt | `ACTION_BC_SPECIAL_MELEE_ALT_2` | 26424 |
| 特格 | `ACTION_BC_SPECIAL_MELEE` | 26586 |
| N 格 | `ACTION_B_MELEE` | 27343 |
| 觉醒技 | `ACTION_ABC_FINAL_ATTACK` | 27023 |

可改点：

- 改某动作前先在 `func_1043` 找 action hash 和 callback。
- 真正动作内容通常不在 `func_1043`，而在 `ACTION_* -> runtime -> segment`。
- `func_44` / `func_52` 可用于理解 primary / secondary channel 差异，不适合先改性能。

不要先碰：

- `func_44` 中 `sys_46(0x1,channel,0,0,0)` 是 action 切换清场，不是动作位移参数。
- action hash 不等于 raw 按键。raw input 还在 `0.c` / native selector 层。

验证：

| 场景 | 观察 |
|---|---|
| 普通输入 | 进入预期 ACTION |
| 取消输入 | primary / secondary channel 不串错 |
| 方向输入 | `global172` / `global200` 分支正确 |

## 3. 射击 / Ammo 卡

玩家语言：

```text
主射、副射、特射怎么出弹？怎么改弹种、扣弹、空弹行为？
```

当前锚点：

| 符号 | 行号 | 工作名 |
|---|---:|---|
| `ACTION_A_SHOT` | 25765 | setup main shot runtime |
| `func_913` | 25785 | main shot driver wrapper |
| `func_914` | 25790 | main shot start segment |
| `func_915` | 25835 | main shot fire segment candidate |
| `func_586` | 15404 | reset ranged runtime |
| `func_587` | 15514 | run ranged runtime |
| `func_593` | 15992 | run multi-phase ranged runtime |

典型链路：

```text
func_1043
  -> ACTION_A_SHOT
  -> func_586()
  -> global677 = func_914
  -> global680 = func_915
  -> global681 = 0
  -> func_913 -> func_587()
  -> func_914 / func_915
      -> sys_0(0x90000, slot, 0)
      -> sys_4F(0, slot, weaponHash)
      -> func_123(cancelMask)
```

Notion 经验：

| 调用 | 脚本侧含义 |
|---|---|
| `sys_0(0x90000, slot, 0)` | weapon slot / ammo 可用检查 |
| `sys_4F(0, slot, hash)` | 射击 / weapon request |
| `sys_4F(0x7, slot, 1)` | 主动扣弹 |
| `sys_4F(0xa, slot)` | 清 charge gauge 候选 |
| `sys_4F(0x11, slot, 0)` | 移除 charge gauge 候选 |

可改点：

- 改弹种：先找 `sys_4F(0,slot,weaponHash)`。
- 改扣弹：找同 action 中 `sys_4F(0x7,slot,1)`。
- 改空弹：找 `sys_0(0x90000,slot,0)` 的分支。
- 改取消路线：找同 segment 的 `func_123(mask)`。

不要只改：

- 只改 weapon hash，不改 ammo slot / 扣弹，会出现表现和资源不同步。
- 只改 ACTION 入口，不追 `global677/680` segment，会漏掉实际发射帧。

验证：

| 场景 | 观察 |
|---|---|
| 有弹主射 | 弹体正确、ammo 正确减少 |
| 空弹主射 | 不应生成错误 projectile |
| BD cancel 后连射 | 能形成预期 cancel，ammo 不错乱 |
| 命中 / 未命中 | shell 和相机不残留 |

## 4. 援护卡

玩家语言：

```text
特射援护怎么召唤？方向输入为什么会变援护类型？
```

当前锚点：

| 符号 | 行号 | 工作名 |
|---|---:|---|
| `ACTION_AC_SPECIAL_SHOT_DIRECTIONAL` | 26957 | setup directional assist action |
| `func_952` | 26984 | assist summon segment |
| `func_488` | 12348 | reset melee / special runtime |
| `func_502` | 13212 | run special movement runtime |

典型链路：

```text
ACTION_AC_SPECIAL_SHOT_DIRECTIONAL
  -> func_488()
  -> global609 = func_952
  -> global200 = (global87 & 0x3c) ? 1 : 0
  -> func_502()
  -> func_952
      -> if global200:
           sys_51(... index/type for directional assist)
         else:
           sys_51(... index/type for neutral assist)
      -> sys_4F(0x7, ammoSlot, 1)
      -> func_123(0x281)
```

Notion 经验：

```text
sys_51(0x20000, 0, 0x2, assistIndex, type) = 援护召唤
global200 = 是否按着方向键候选
global172 / global175 = 方向位，0x4/0x8/0x10/0x20 前后左右候选
```

可改点：

- 改援护对象：`sys_51` 的 assist index。
- 改援护类型：`sys_51` 的 type。
- 改 N / 方向差异：`global200` 和 `global172` 分支。
- 改扣弹：同动作内 `sys_4F(0x7,slot,1)`。

不要先碰：

- `func_502` 通用 special movement driver，影响多个特殊动作。
- 方向输入的 raw 判定。`2.c` 只读已经整理好的方向 mask。

验证：

| 场景 | 观察 |
|---|---|
| N 特射 | assist index/type 正确 |
| 方向特射 | 左右 / 前后分支正确 |
| ammo 为空 | 不应无成本召唤 |
| BD cancel | 援护和扣弹都不重复触发 |

## 5. 格斗 / 派生卡

玩家语言：

```text
N 格、横格、派生、命中后推进怎么改？
```

当前锚点：

| 符号 | 行号 | 工作名 |
|---|---:|---|
| `ACTION_B_MELEE` | 27343 | setup neutral melee action |
| `func_966` | 27356 | neutral melee first segment |
| `func_967` | 27376 | neutral melee followup segment |
| `func_488` | 12348 | reset melee / special runtime |
| `func_489` | 12485 | run melee runtime |
| `func_532` | 14064 | setup contact / approach window candidate |
| `func_535` | 14081 | setup branch window parameter |
| `func_536` | 14087 | register branch window callback |

典型链路：

```text
ACTION_B_MELEE
  -> func_488()
  -> func_219(rowHash)
  -> global602 = func_966
  -> func_489()
      -> func_490 初始化 movement baseline
      -> func_71(global602)
  -> func_966
      -> func_308(... first motion ...)
      -> func_531(func_967)
      -> global170 = 1
      -> func_887()
      -> func_123(0x200)
  -> func_967
      -> func_308(... followup motion ...)
      -> func_532(...)
      -> func_535(...)
      -> func_536(mask,time,callback)
      -> func_123(...)
      -> func_125(...)
```

可改点：

- 改动作动画：`func_308(global20,motionHash,...)`。
- 改突进 / 追踪：先看 `func_219(rowHash)`，再看 `func_489` 和 `func_532`。
- 改派生窗口：`func_536(mask,time,callback)`。
- 改取消：`func_123(mask)` 和 `func_125(mask)`。
- 改外观 / 持刀状态：`global170` 和 `func_887()`。

不要先碰：

- 不要把 `func_532` 直接命名成 damage / hitbox。当前证据更像接近、接触、窗口 helper。
- 不要全局改 `func_489`，除非确认所有使用它的 melee action 都应改变。

验证：

| 场景 | 观察 |
|---|---|
| 空挥 | 动作段和收尾正常 |
| 命中 | 追踪、推进、派生窗口正常 |
| BD cancel / step cancel | mask 生效且不残留 |
| overheat | gate 和动作可用性符合预期 |
| 被打断 | shell / camera / movement 恢复 |

## 6. BD / Boost / Step Gate 卡

玩家语言：

```text
BD、step、boost、overheat 和取消路线怎么落到脚本？
```

OverBoost wiki 语义：

- BD 用跳键二连触发，能取消多数射击和格斗。
- BD、step、上升、变形、部分武装都会消耗 boost。
- boost 空后进入 overheat，落地硬直变长，部分武装 / 特殊移动不可用。
- BR ズンダ就是 BR 后用 BD 取消，再重复射击的基础连携。

当前锚点：

| 符号 | 行号 | 工作名 |
|---|---:|---|
| `func_11` | 1325 | update boost / cancel gate |
| `func_21` | 1767 | read direction / action masks |
| `func_24` | 1865 | read primary action candidate |
| `func_25` | 1872 | read secondary action candidate |
| `func_44` | 2615 | primary action commit |
| `func_52` | 2765 | secondary action commit |

脚本层链路：

```text
raw input / boost gauge / BD / step / OH
  -> engine / upstream script
  -> sys_0(0x10000,...) and sys_0(0xc000*)
  -> func_21/24/25 读取当前状态
  -> func_11 更新 gate
  -> func_44/52 commit action
  -> ACTION segment 通过 func_123(mask) 决定 cancel route
```

可改点：

- 某动作能不能 BD cancel：先看动作 segment 的 `func_123(mask)`。
- 某动作在 OH 下能不能用：看 `func_11`、`sys_0(0xc000*)`、action availability、ammo check。
- 普通 BD 基础性能：更可能在 native / resource / `speed_param`，不在单条 `sys_46`。

不要先碰：

- 不要把 `func_11` 当“BD 速度函数”。
- 不要把 `sys_46` 当 raw BD 输入。

验证：

| 场景 | 观察 |
|---|---|
| 地上 BD | gate edge 正常 |
| 空中 BD | action cancel 正常 |
| step cancel | 格斗 / 射击取消符合预期 |
| overheat | 武装可用性和落地硬直不异常 |
| BR ズンダ | `BR >> BR >> BR` 类连携不破坏 ammo 和 cancel |

## 7. 动作内移动 / 特殊移动卡

玩家语言：

```text
某个特格冲多远、横移多远、格斗追踪多强，具体在哪里改？
```

当前锚点：

| 符号 | 行号 | 工作名 |
|---|---:|---|
| `func_489` | 12485 | run melee runtime |
| `func_502` | 13212 | run special movement runtime |
| `func_937` | 26520 | special melee rush followup segment |
| `func_940` | 26607 | directional special movement segment |
| `func_532` | 14064 | contact / approach window candidate |

两种典型链：

```text
格斗追踪:
  ACTION_B_MELEE
    -> func_219(row)
    -> func_489
    -> func_532 / func_535 / func_536
    -> sys_46(...)

特殊移动:
  ACTION_BC_SPECIAL_MELEE
    -> func_488
    -> global609 = func_940
    -> func_502
    -> func_940
      -> global172 direction bits
      -> sys_46(0, lateralDelta)
      -> sys_46(0x1 / 0x2, ...)
```

可改点：

- 横移距离：`func_940` 里左右方向常数和 `sys_46(0,global265)`。
- 突进起步：`func_937` 里的 `sys_46(0x5,...)`。
- 追踪强度：先看 `func_219(row)` 和 `global507/508/606` 家族，再看 `func_532`。
- 速度倍率：`func_298..302` 包装的 `sys_46(0x3,...)`。

不要先碰：

- `func_44` 的清场 `sys_46(0x1,channel,0,0,0)`。
- `sys_46` 子命令号本身，除非已经对齐 native handler。

验证：

| 场景 | 观察 |
|---|---|
| 有锁目标左 / 右输入 | 方向分支正确 |
| 无锁目标左 / 右输入 | fallback 常数正确 |
| 命中 / 空挥 | 位移不穿模，不残留速度 |
| OH / boost 不足 | gate 行为不异常 |

## 8. 镜头卡

玩家语言：

```text
格斗镜头、觉醒技镜头、特殊演出镜头怎么改？
```

当前锚点：

| 符号 | 行号 | 工作名 |
|---|---:|---|
| `func_321` | 7370 | play camera preset |
| `sys_53(0x4,...)` | 多处 | start camera preset |
| `sys_53(0x5)` | 多处 | clear camera preset candidate |

典型链：

```text
segment callback
  -> func_309(global20,time) 判断 motion 时间点
  -> func_321(cameraHash)
      -> sys_53(0x4, cameraHash, 0x4650)

结束 / 打断 / 切段
  -> sys_53(0x5)
```

Notion 经验：

| 调用 | 脚本侧含义 |
|---|---|
| `sys_53(0x4, hash, ...)` | camera preset |
| `sys_53(0x5)` | camera cleanup candidate |
| `sys_53(0,...)` | 画面震动 |
| `sys_53(0x2,...)` | 镜头缩放候选 |

可改点：

- 改镜头 preset：`func_321(hash)` 或 `sys_53(0x4,hash,...)`。
- 改触发时机：前面的 `func_309(global20,time)`。
- 改清理：找所有结束 / 被打断路径的 `sys_53(0x5)`。

不要只改：

- 不要只加镜头不找清理点。
- 不要只测命中，空挥和 BD cancel 更容易暴露残留。

验证：

| 场景 | 观察 |
|---|---|
| 命中进入镜头 | preset 正常 |
| 空挥 | 不误触发或能恢复 |
| 被打断 | camera 清理 |
| BD cancel | camera 不残留 |
| 死亡复归 | 镜头状态恢复 |

## 9. Shell / 换装 / 组件卡

玩家语言：

```text
机体组件怎么挂上、卸下、切形态？为什么 func_887/888 很像换装但又不是入口？
```

当前锚点：

| 符号 | 行号 | 工作名 |
|---|---:|---|
| `func_877` | 25407 | init shell / resource / action tables |
| `func_887` | 25522 | select default shell loadout |
| `func_888` | 25534 | dispatch shell loadout mode |
| `func_1037` | 29304 | enter alternate shell mode |
| `func_1038` | 29324 | return base shell mode |

典型链：

```text
启动:
  func_877
    -> sys_4B(0, baseShellHash)
    -> global20 = sys_4B(1)
    -> global170 = 0
    -> func_887()

默认恢复:
  func_887
    -> global170 == 0 ? func_888(0) : func_888(1)

动作内切换:
  ACTION_* segment
    -> global170 = ...
    -> func_887()
    -> func_888(mode)
    -> sys_4B / sys_47
```

Notion 经验：

| 调用 | 脚本侧含义 |
|---|---|
| `sys_4B(0x2, modelId, boneHash, actionHash[, parentModel])` | 挂模型；第三参 body `.jnttbl` `boneHash`（非 nusktb index），见 `docs/exvs-msc-syscall-4b-notes.md` |
| `sys_4B(0x3)` | 解除装备 / detach |
| `sys_47(0x10,...)` | rotate |
| `sys_47(0x11,...)` | translate |
| `sys_47(0x12,...)` | scale |

可改点：

- 改挂件：`sys_4B(0x2,...)`。
- 改卸下：`sys_4B(0x3,...)`。
- 改部位位置：`sys_47(0x10/0x11/0x12,...)`。
- 改动作中形态：`global170/global143` 和 `func_887/888`。

不要先碰：

- 不要只改 `func_888` 的一支，不找动作结束恢复。
- 不要把 `global170` 当纯外观。它也影响 `func_79` 的 resource group。

验证：

| 场景 | 观察 |
|---|---|
| 战斗开始 | 默认 shell 正常 |
| 特格 / 格斗进入 | 组件切换正确 |
| 动作结束 | loadout 恢复 |
| 被打断 / 死亡 | 不残留错误组件 |
| 其他动作连携 | `global170` 不串状态 |

## 10. Dynamic Naming / Offset 变化卡

玩家语言：

```text
这次叫 func_489，下次 offset 变了怎么办？
```

稳定身份不要写成函数编号，写成 shape：

| 角色 | 稳定 shape |
|---|---|
| init runtime | 从 `main` 进入、清大量 global、写 registry、进入 shell init |
| action registry | 大量 `func_241(hash,ACTION_*)` |
| primary dispatch | 读 primary candidate，查 `sys_0(0x10002,0x2,hash)`，`sys_2(0,0x2,callback)` |
| secondary dispatch | 写方向 mask，查 action 表，`sys_2(0,0x3,callback)` |
| ranged runtime | `func_586` reset，`global676..681` callback / ammo slot |
| melee runtime | `func_488` reset，`func_219(row)`，`global602/608/609/610` |
| movement bus | `sys_46` 子命令组合 + 上下文 |
| shell loadout | `global170/global143` + `sys_4B/sys_47` |

Overlay 记录建议：

```json
{
  "semanticId": "depiction.action.neutralMelee",
  "currentSymbol": "ACTION_B_MELEE",
  "evidence": {
    "registry": "func_241(0x178d1109, ACTION_B_MELEE)",
    "runtime": "calls func_488, func_219, writes global602, enters func_489",
    "outputs": ["func_308", "func_532", "func_535", "func_536", "func_123"]
  }
}
```

验证：

| 场景 | 观察 |
|---|---|
| 重新反编译同文件 | overlay 仍能匹配 |
| 换第二个机体样本 | 至少 registry / runtime family 能重定位 |
| 行号变化 | 不影响语义 id |

## 11. 每次改动前的统一检查

把这张表复制到你的改动记录里：

| 字段 | 必填内容 |
|---|---|
| 玩家目标 | 主射 / 特射援护 / 特格 / N 格 / BD cancel / 镜头 / shell |
| action hash | `func_1043 -> func_241` 证据 |
| ACTION callback | 当前样本函数名 |
| action channel | primary `func_44` 或 secondary `func_52` |
| runtime family | ranged / melee / special movement / shell |
| segment callback | 真正输出所在函数 |
| motion | `func_308` / `func_79` / `func_610` |
| weapon / assist | `sys_4F` / `sys_51` |
| movement | `sys_46` / `func_532/535/536` |
| camera | `func_321` / `sys_53` |
| shell | `func_887/888` / `sys_4B/sys_47` |
| cancel | `func_123/125` |
| cleanup | camera / shell / movement / state restore |
| tests | 地上、空中、OH、命中、空挥、被打断、BD cancel、step、死亡复归 |

如果这张表填不完，说明还没到可改点，只是找到了入口或中间层。

## 12. 来源

- 当前样本：`E:\XB\解包\com\file\0xBDBE6FEA\2.c`
- 当前源码：`E:\XB\解包\com\file\0xBDBE6FEA\2.c`
- Notion MSC 页：`https://app.notion.com/p/1601ebad394d8027a042df115e61b6dd`
- OverBoost wiki 系统页：`https://w.atwiki.jp/exvs2ob/pages/593.html`
- OverBoost wiki 初心者指南 / BR ズンダ：`https://w.atwiki.jp/exvs2ob/pages/560.html`
- [逆向者第一小时：打开 `2.c` 后怎么读到可改点](./2c-first-hour-source-reading-roadmap.md)
- [2.c 逐帧生命周期：从玩家动作到 MSC 输出](./2c-frame-lifecycle-human-trace.md)
- [`sys_46` 脚本侧参数地图：动作内移动怎么读、怎么改](./sys46-script-parameter-atlas.md)
