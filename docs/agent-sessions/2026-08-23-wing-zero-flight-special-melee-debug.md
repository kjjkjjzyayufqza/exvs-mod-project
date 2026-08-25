# Wing Zero Rebellion 飞行特格落地链调试复盘

**Date:** 2026-08-23  
**Status:** 最终采用统一落地链；左右独立行为延期，相关函数保留但不可达  
**Scope:**

```text
Target MSC    E:\XB\mod\040msc\wing_gundam_zero_rebellion_msc\0.c / 2.c
Target Motion E:\XB\mod\003motion\wing_gundam_zero_rebellion_motion
TV Reference  E:\XB\mod\040msc\028gunwtv_001gunwtv_001\0.c / 2.c
```

## 1. 当前可用基线

当前三个方向全部使用已接受的落地handler：

| 输入 | Action hash | 当前 handler |
|---|---:|---|
| 左 | `0x8D96C52F` | `ACTION_BC_SPECIAL_MELEE_BIRD_LANDING` |
| 右 | `0x279F0DA4` | `ACTION_BC_SPECIAL_MELEE_BIRD_LANDING` |
| N / 前 / 后 | `0xC0B814FF` | `ACTION_BC_SPECIAL_MELEE_BIRD_LANDING` |

`0.c func_143` 三条均保持 TV 原始 selector 类别：

```c
func_95(action_hash, 0x1, 0x4, 0x9);
```

`ACTION_BC_SPECIAL_MELEE_BIRD_LANDING` 当前重新接通三个 callback：

```c
global608 = rebellion_bird_special_melee_landing_air_start;
global609 = rebellion_bird_special_melee_landing_air_wait;
global610 = rebellion_bird_special_melee_landing_ground;
```

右与N/前/后的实际时序：

```text
0x1192E91E (air A, start frame 0)
  -> frame 18 / 0x708
  -> wait: func_296(0x3E8, 0), disable flight movement
  -> wait until !func_287(0x3ED)
  -> clear global24 0x1000000
  -> 0x33B742CD (ground B, start frame 0)
  -> motion end -> normal action exit
```

Target 特化：TV 在 wait 还有 frame 24 / `0x960` 超时；当前 Target 删除该超时，防止尚未落地就走 airborne fallback 并结束。

`0x99ED237A`、`0x728EFF43`、`0x301D3299`及ALT_5相关函数仍保留在`2.c`，但当前注册与callback表不会到达它们。

## 2. 当前资源事实

| 用途 | Runtime | Raw `unk1` | Body末帧 | Wing末帧 |
|---|---:|---:|---:|---:|
| 空中 A | `0x1192E91E` | `1ee99211` | 75 | 74 |
| 地面 B | `0x33B742CD` | `cd42b733` | 79 | 78 |
| 左侧向 | `0x99ED237A` | `7a23ed99` | 37 | 36 |
| 右侧向 | `0x728EFF43` | `43ff8e72` | 37 | 36 |
| 左右收招 | `0x301D3299` | `99321d30` | 59 | 59 |

NUANMB v1.2 双字段检查：`unk1`为持续秒数，`unk2`为末帧；`final_frame_index=60`是采样率字段。逐帧轨道统计确认八个A/B/左右 Body/Wing文件都持续变化至各自最后一帧，“后半段实际静止”已排除。

Body/Wing相差1帧不是当前落地链主因；此前四个Wing共同只有19帧的版本已被用户替换。

## 3. TV源码钉死的事实

### 3.1 `0.c`

TV `func_143` 三个飞行特格均为：

```c
func_95(hash, 0x1, 0x4, 0x9);
```

特射 selector `(1, 0x400001, 0x8)` 会原地制动并进入普通形态，只能用于隔离诊断，不能作为最终飞行特格类别。

### 3.2 `2.c func_41`

TV `func_41`只发布 `global3/global4/global24/global143`，不会按 action hash 自动拆form。Target的FORCED_RECOVERY是移植特化，只应处理真正的受击、取消、倒地或动作替换，不能冒充自然ALT_5/ALT_7转换。

### 3.3 TV ALT_7

TV `ACTION_BC_SPECIAL_MELEE_ALT_7`使用 `func_488/func_502`和三个callback：

1. `func_1053`：`func_1077()`后播放空中A；frame18转wait。
2. `func_1054`：关闭飞行移动；等待ground或frame24超时。
3. `func_1055`：ground时播放B；仍air时走A fallback。

### 3.4 TV `func_1077`

自然form转换会：

- `global143 = 0`
- `global142 = normal speed row`
- 切normal模型、刷新`global20`
- 重绑normal motion/loadout

但不会：

- `func_296(0x3E8, 0)`
- 清 `global24 & 0x4000`

所以自然切普通形态不等于强制清飞行惯性。

## 4. 调试过程与实机结论

| 阶段 | 改动 / 假设 | 实机结果 | 结论 |
|---|---|---|---|
| 1 | 复制TV ALT_5/ALT_7并接新Runtime | 只播前几帧/1帧 | 不能从静态相似直接宣称完整移植 |
| 2 | 延后自然EXIT的`func_296`关闭 | 无变化 | 提前关闭移动不是唯一动作中止原因 |
| 3 | 用`func_91()`替代固定帧 | 无变化 | motion-end条件不是唯一边界 |
| 4 | 检查Body/Wing时长 | 发现Wing旧版共同19帧 | 合理怀疑，但延长后问题仍在 |
| 5 | 检查NUANMB双字段与逐帧活动 | 数据持续到末帧 | 排除“只改header”和“后半段静止” |
| 6 | 三hash统一播放完整特射action | 特射完整执行 | action dispatch可工作，但两层同时变化，不能单因归因 |
| 7 | 特射selector `(1,0x400001,8)` + custom handler | custom仍1帧，且无惯性 | 特射类别不适合作为最终方案 |
| 8 | 多个`func_593`/视觉owner probe | 仍取消或原地normal | probe扩大变量数量，未形成可复用结论，全部删除 |
| 9 | 直接核对TV `0.c/2.c` | 找到selector、func_41、ALT阶段、func_1077真实边界 | 后续只按源证据修改 |
| 10 | 回到e9239b5单阶段`0x1192E91E` | 重新建立可控基线 | 三方向先统一，不急于恢复左右 |
| 11 | 恢复A→wait→B，A完整结束后才wait | 可落地B，但A碰地仍等完整 | ground检查只在wait太晚 |
| 12 | A中使用`0x80002`接触组合 | 空中误结束且无B | `0x80002`不是该场景可靠ground谓词，已撤销 |
| 13 | A frame18转wait，wait无超时只等native ground | 用户评价“目前这个很不错” | 当前接受基线 |

## 5. 为什么会绕圈

### 5.1 同时改变太多层

多次实验同时改变了：

- `0.c func_95` selector类别
- `2.c func_241` handler
- `func_488`与`func_593`动作框架
- `global143`切换时点
- `func_296`移动所有权
- motion Runtime和阶段数

实机成功或失败因此无法归因。正确方法应始终只改变一个边界，并保留可立即回滚的已知基线。

### 5.2 把视觉形态当成逻辑form

拆挂件、恢复normal weapon、`global143=0`、normal speed row和关闭flight movement是不同状态。视觉变normal不能证明`global143`已经清零；相反，逻辑form保留也不代表bird视觉资源仍在。

### 5.3 把wrapper当语义

`func_287(0x3ED)`只是：

```c
sys_0(0x30000) == 1
```

它是native airborne state，不是几何碰地传感器。在flight movement仍持有时，视觉碰地不保证该state变化。

### 5.4 未先完整读取TV反向路径

早期只复制ALT动作正文，没有先钉死TV `func_41`与`func_1077`。自然转换被错误地复用了Target FORCED_RECOVERY，混淆了正常EXIT与INTERRUPT ownership。

### 5.5 静态通过不等于游戏通过

AI block、opaque pointer和`msclang`编译只能证明源码结构安全，不能证明native动作状态机正确。所有MSC行为结论必须保留“待实机”状态，直到用户实际确认。

## 6. 后续执行顺序

当前不要同时恢复左右与修改落地链。建议：

1. 冻结当前统一A→wait→B基线。
2. 单独恢复左hash `0x8D96C52F → 0x99ED237A`，右与N仍走落地链。
3. 左实机完整后，再恢复右 `0x279F0DA4 → 0x728EFF43`。
4. 左右首段都稳定后，才加入 `0x301D3299`收招。
5. 每步验证：ENTER惯性、motion持续、自然EXIT、中断、连续使用、复活。

若任何一步失败，立即回到本文件§1基线，不在失败版本上继续叠补丁。

### 2026-08-23 左侧第一次实机

方向分流正确：左进入左handler，右仍走落地基线；但左`0x99ED237A`只播放1帧。资源契约差异是TV ALT_5使用bird `body_tf` direct Item，而Target侧向资源是normal Body/Wing Folder。当前将natural adapter前移到左首段开始前，先建立normal motion owner，再播左motion；首段结束处不再重复转换。

前移natural adapter后左仍只播放1帧。为停止修改ALT_5状态机，当前把左hash重新映射到已接受的landing handler；该handler只按`global6`把A Runtime替换为`0x99ED237A`，其它ENTER、frame18、wait、B、EXIT完全不变。该实机结果将直接判定左Folder契约是否可用。

纯Runtime实验成功：`0x99ED237A`在稳定landing first-phase框架中能够播放，证明Folder契约有效；随后卡住是因为仍继承wait→ground B。当前左hash仍使用同一稳定action入口，但callback表改为左专用`side run → finish`：完整播放`0x99ED237A`后直接接`0x301D3299`，不经过接地判断。右与N继续走落地链。

左专用`side run → finish`实机已能完成旋转与收招，但没有TV横向位移。当前将left first-phase callback替换为完整target-adapted TV `func_1058`逻辑：`global390=4`、`0x1F40`偏航目标、`sys_46(0x2,0x3,...)`侧向移动、后续朝目标修正、刀光/SE、1–30帧130%速率、末尾前3帧转收招、`0x301D3299`从frame5开始。右/N落地链不变。

## 7. 当前验证边界

已完成的静态门：

- `check_msc_ai_blocks.py`：通过
- `check_msc_opaque_func_ptrs.py`：通过
- `msclang.py`编译：通过
- 编译后action hash、callback与Runtime反编译核对：通过

当前实机确认：统一落地链表现“很不错”。最终决定让左、右、N/前/后全部使用该链；左右独立motion、左右收招和完整方向矩阵延期。

## 8. 延期 TODO 计划

该计划仅供未来明确恢复左右特格时使用；当前代码不应自动执行这些步骤。

- [ ] 冻结并备份当前统一落地基线的`0.c/2.c`与编译产物。
- [ ] 只恢复左hash，右与N保持落地基线；不得同时修改selector、handler、form adapter与motion资源。
- [ ] 先在稳定landing first-phase框架内验证`0x99ED237A`，确认资源仍可完整播放。
- [ ] 明确左侧产品行为：是否继承惯性、何时切normal、是否需要`0x301D3299`、位移距离与朝向规则。
- [ ] 只在左motion稳定后加入TV `func_1058`位移；逐项启用`0x1F40`偏航、`sys_46`移动、追踪、速率、VFX/SE，不一次全开。
- [ ] 左侧通过ENTER/ACTIVE/EXIT/INTERRUPT/RESPAWN实机矩阵后，再镜像恢复右`0x728EFF43`。
- [ ] 任何失败立即回滚到统一落地基线，不在失败版本上继续叠补丁。

## 9. Normal特格接纯N：固定30帧飞行冲刺（2026-08-23）

状态：前两版跨action方案均实机失败；第三版内部phase仍未进入，因为
N派生窗口把request条件写得比原016分流更严。2026-08-23已改回原
`global87 & 0x30` 左右分流：else 一律latch dash request。
该功能不改变§1的飞行特格统一落地链。待实机确认冲刺与30帧后飞控。

触发边界：normal形态下任意方向特格进入现有两个N派生窗口后，
`func_233(0x7e, 0x8680)` 已接受格斗取消。`global87 & 0x30` 仍走
`0x8B97920E`；else（原N/前/后派生）设置request并提交`0x928CA34F`。
不再要求 `global87 & 0x2` 或空 `0x3C`：特格取消当下 `global87` 经常
没有0x2，或残留前/后bit，旧条件会落到无request的原`func_937`格斗。
飞行形态格斗仍是原`0x928CA34F`，不设request。

实现时序：

```text
pure-N request -> 0x928CA34F / func_937
  -> func_937在request存在时跳过原近战func_488/func_489正文
  -> func_937直接注册dash tick callback
  -> global24 = 0x1804000（flight loop 0x1004000 + 强制输入门0x800000）
  -> global142 = 0xC2B19D13, global143 = 2
  -> 安装bird武装栏，直接调用slot 0x24 loop callback
  -> 播放slot 0x38 / runtime 0x9DE587CE（跳过enter动作）
  -> 有有效锁定时只读取一次0x40000/3并写入朝向；之后不追踪
  -> forward speed = speedparam[bird][0x459455EA] * 3
  -> sys_4A(0, 0xDC4314CD, global20, 1, 6, 0)
  -> sys_4A(0, 0x2133778D, global20, 1, 7, 0)

ACTIVE
  -> 每tick重写同一forward channel，不调用flight steering
  -> elapsed += func_274()，固定到0xBB8（30帧）
  -> 不检查地面或墙；不注册玩家cancel window
  -> 0x800000沿用native forced-action输入门

FRAME 30 INTERNAL HANDOFF
  -> 关闭group 0x6 transform burst，保留group 0x7 aura
  -> 不调用func_65，不更换action hash
  -> 清0x800000，恢复global24 = 0x1004000
  -> 原样初始化func_452的flight globals与slot 0x24 callback
  -> func_69(0x24) 之后再次 callFunc3(dash_tick)，与func_452同序
  -> 同一dash tick callback进入phase 1，每tick直接执行完整func_453
  -> 玩家恢复标准飞行转向、移动和bird输入

INTERRUPT / EXIT / RESPAWN
  -> hit/down/death替换为非飞行动作时仍走func_41 FORCED_RECOVERY
  -> manual bird exit在rebellion_transform_end phase 0清group 0x6/0x7
  -> func_874清dash owner、timer、speed与owned effects
```

资源与静态证据：`0x9DE587CE`在当前motion structure中为raw
`ce87e59d`的`trans_loop` Folder，Body/Wing文件分别为8014/12078字节；
`0x459455EA`沿用当前`func_452/453`的bird终端前速字段；两个effect hash
均已在当前target `2.c`中存在。

第一版失败证据：用户实机确认触发后“原地下坠、动作卡住”。私有
`0x4E424453`虽然通过registry、编译和回编译，但没有取得原生变形enter的
完整动作所有权。该方案已从`0.c/2.c`完全移除，不再保留slot `0x26`、
私有resolver、registry或`func_143`特判。

第二版失败证据：改为`func_81(0x9475130E)`后，用户实机确认“原地动作
卡住，全部无法操控”。`0x800000`已生效，但30帧后没有完成跨action交接。
扫描当前`E:\XB\mod\040msc`全部同目录`0.c/2.c`：除第二版新增的两行外，
不存在任何`func_80/81/82/95`直接提交本机slot `0x17` transform-enter hash
的范例。由此判定该转换方式不是现有MSC架构支持的工作路径；第二版的
`func_450` request分支与`func_35`特判也已完全移除。

当前第三版只使用本来就能从特格派生进入的`0x928CA34F / func_937`，并在
同一个scheduled callback中切phase，不再依赖任何跨action自然resolver。
2026-08-23 再测：用户 repack 后 N特格+N近战仍是原近战。判定 cancel 窗
latch 不可靠（`func_41` 会在非三hash之间清 request）。`func_937` 改为同时
认 `func_44` 留下的上一招 `global7`：`0xc805dc33` / `0x66eb879f` 即特格接N。
飞行形态近战的上一招不是这两个 hash，仍走原 `func_937` 格斗。

第三版的request条件已按用户“N仍是旧格斗”证据收窄到原016 else分支。
`func_41` 的 `!(hash && (active || loop))` 在 legacy msclang 回编译中被取反，
已改成两层 `if / else if (!active) if (!loop)`，避免冲刺期间拆 form。

静态门：`check_msc_ai_blocks.py` / `check_msc_opaque_func_ptrs.py` 通过。
legacy `msclang.py` 已写入
`E:\XB\mod\040msc\wing_gundam_zero_rebellion_msc\2.dscex`。
回编译确认：两个特格窗口 else 分支 `global789=1` 后提交 `0x928CA34F`；
`func_937` 在 request 时 `return`；teardown 在 dash/loop owner 下跳过。
MSC行为只能由游戏实测确认。

## 11. 2026-08-25 特格接 N 鸟冲刺已实机成功

现行方案不要继续改本文件 §9/§10 的实验路径。完整记录：

`docs/msc-research/wing-zero-rebellion-special-n-bird-dash.md`

要点：`func_241(0x928ca34f, rebellion_enter_normal_special_n_bird_dash)`；`func_916`/`func_593` 四槽；676 里调 `rebellion_transform_start`；679 置 `global252` 并在无杆时拆鸟。禁止 `0x3d` 强制 enter、禁止 679 假飞行。

## 10. 2026-08-24：按星际凯旋飞行特射改 30 帧后交接（待实机）

用户实机：进入飞行后缓慢飞 30 帧，然后卡住保持前进、无法操控。
希望 30 帧快冲后进入可自由操控的飞行；不按键则按原游戏逻辑回普通形态。

对照 `053gbftry_004strwin_001` 飞行特射 `func_1073`：

- `func_167(0x1004000)` 保持飞行 bit
- 每 tick `sys_46(0x1, 0x1, 0, 0, speed)` 锁定前冲
- 动作自然结束，不 `func_81` 去 slot 0x17 enter

已作废路径：30 帧后 `func_81(0x9475130e)` + `func_143` 0x3d 强制 enter。
`0x928ca34f` 没有 `func_13` resolver，enter 不会提交，人停在格斗 hash 上继续前冲。

当前交接：

```text
30-frame rush (5x bird 0x459455ea, sys_46 0x1/0x1)
  -> func_167(0x1004000)
  -> 0x3d = 1
  -> func_65()
  -> 0.c rebellion_special_n_dash_action_end
       func_73/func_74 no stick+boost -> slot 0x19 / 0xa02d57dc / 回普通
       else -> slot 0x18 / 0x77b100ff / analog
```

`func_143` 遇到 0x3d 只 return，不再 `func_95(0x9475130e)`。
静态门通过；legacy msclang 已写入 `0.bscex` / `2.dscex`。待实机。

## 11. 2026-08-25 特格接 N 鸟冲刺已实机成功

§9/§10 是失败实验，不要当现行方案改。完整记录：

`docs/msc-research/wing-zero-rebellion-special-n-bird-dash.md`

要点：`func_241(0x928ca34f, rebellion_enter_normal_special_n_bird_dash)`；对标星际凯旋 `func_916`/`func_593` 四槽；676 里直接调 `rebellion_transform_start`；679 必须 `global252=1`，无杆拆鸟。禁止 `0x3d` 强制 enter，禁止 679 假飞行。

## 12. 2026-08-25 原地不动：锁冲必须在 593 之后

用户实机：变形成功但 30 帧期间钉在原地。对照 `func_917`→`func_862`→`func_1073`：

- 677 里的 `sys_46` 会被随后的 `func_300(global714)` 吃掉。
- ENTER 把 `global453`/`global454` 置 0 时 `global714=0`，倍率直接归零。
- `func_1073` 只写 `sys_46(0x1, 0x1, 0, 0, mag)`，不写 channel `0x2` 幅值 0。

现行：tick 在 `func_593()` 之后直接调 `locked_loop_move`；初速 `S(0x5e8caf43)-S(0xff7a9c8b)*0x1e`。完整记录仍以 special-n-bird-dash 页为准。
