# Wing Zero Rebellion 飞行武装栏 armsparam

日期：2026-08-22  
目标：为 `900000004` 的飞行形态增加独立 0/1/2 武装 entry；第 3 个玩家可见栏位之后复用普通形态 Zero System。

## 文件与备份

- 目标：`E:\XB\mod\041cpm\wing_gundam_zero_rebellion_param\armsparam.bin`
- 原始 SHA-256：`A4665B7C6395198094DFC3267A73C12EE75F0EC9BC62243DE59B08BEFCCBF8D8`
- 备份：`tmp/exvs2-json/20260822-wing-rebellion-flight-arms/armsparam.original.A4665B7C63951980.bin`
- 编辑请求：`tmp/exvs2-json/20260822-wing-rebellion-flight-arms/edit-request.json`
- 崩溃副本 SHA-256：`63C161E50BDA8CA226DC4B48BB785F54D054D5C0A800AB078F10E1176D823371`
- 有序修正版：`tmp/exvs2-json/20260822-wing-rebellion-flight-arms/armsparam.sorted-fixed.bin`
- 有序修正版 SHA-256：`2388C188437646B25C397FFD27E0CBC86D43F356198671918C6952609DB7D406`

恢复时把备份复制回目标即可。不要用 TV Wing 或 Delta Plus 整文件覆盖 Rebellion。

## 证据边界

`exvs2-json` 只负责无损结构化读写。字段名不是 native 语义证明；reload 类型由 raw row 与玩家侧行为交叉判断：

- TV Wing 普通主射：raw `reloadBehaviorType=1`、default `180`；wiki 为“常时リロード 3秒/1発”。因此 type 1 用作逐发常时回复。
- Delta Plus WR 主射：raw `reloadBehaviorType=2`、default `180`；wiki 为“撃ち切りリロード 2秒”。因此 type 2 用作打空/整仓回复。
- TV Wing 页面：<https://w.atwiki.jp/exvs2/pages/124.html>
- Delta Plus 页面：<https://w.atwiki.jp/exvs2/pages/193.html>

## 新 entry

| 飞行槽 | Canonical name / CRC32 | 模板 | 弹数 | 默认 reload | 类型 |
|---:|---|---|---:|---:|---:|
| 0 | `wing_gundam_zero_rebellion_armsparam_trans_mode_main` / `0x77A3426B` | Rebellion `0x750B4B8E` Buster Rifle | 2 | 120f ≈ 2s/发 | 1，常时逐发 |
| 1 | `wing_gundam_zero_rebellion_armsparam_trans_mode_sub` / `0x04DC0DEE` | Rebellion `0x11BE199D` Assist | 1 | 480f ≈ 8s | 2 |
| 2 | `wing_gundam_zero_rebellion_armsparam_trans_mode_special_shot` / `0x233C4626` | Rebellion `0x11BE199D` Assist | 1 | 720f ≈ 12s | 2 |
| 3 | 复用 `0xFA64E4D0 / 0x8D5B747A` | 原 Rebellion FLYING / FLYING_EX（CS/状态显示） | 不改 | 不改 | 不改 |
| 4 | 复用 `0x0D7FCDE2` | 原 Rebellion Zero System | 不改 | 不改 | 不改 |

三个新 row 都由目标本机 row 复制，保留未知字段、`resourceLabel` 与布局。只修改 entry id、`actionLabel`、弹数、reload 类型及 reload timer。

### HUD art index (2026-09-02)

Copying Assist onto flight slot 1 also copied `fieldBb93d195=1` (tallgeese). MSC still binds `sys_4F(0xB, 1, 0x04DC0DEE)`. Art selection is that field into `weapon_icon` Folder order, not the slot number. TV / Hambrabi do the same. Set `0x04DC0DEE` `fieldBb93d195` to `7` (`wep_3_h_n_b_g`). Ground `0x11BE199D` stays `1`. Owner: `docs/exvs-character-weapon-icon-table.md`. E3 2026-09-02 user: bird cell 1 shows the new art, ground 援护 unchanged.

- Before SHA-256: `AC585FE1E16CFFAD29EE558D77804375147DE741C5A0EA315545E653DAA3D64A`
- After SHA-256: `C47BFFBDC4B985FED134C1918DF9B51ECA409D7EC7B635FB1FE176C928651B60`
- Backup / request: `tmp/exvs2-json/20260902-flight-slot1-hud-art/`

### Burst/mode timer

- 主射：default `120`；A mode1/3/4/5=`75`、A mode2=`25`；B mode1=`75`、B mode2/3/4/5=`60`。按原 Buster Rifle 比例缩放。
- slot 1：default `480`；mode1/3/4/5=`320`、mode2=`107`。按原 Assist 比例缩放。
- slot 2：default `720`；mode1/3/4/5=`480`、mode2=`160`。按原 Assist 比例缩放。

## exvs2-json 证据

- dry-run：57 operations，0 warnings，8 rows → 11 rows。
- edited inspect：11 rows，`roundtripCheck.byteIdentical=true`。
- 原 8 rows 的结构化字段逐项未改变。

### 2026-08-22 崩溃根因与工具修复

用户实机确认旧编辑产物导致游戏崩溃，并提供：

```text
原版：armsparam.bin
崩溃版：armsparam - 副本.bin
```

二者结构化对比：header、48 descriptors、原 8 rows 与三个新 row 内容均可解析；kind-7 单元的后 4 bytes 也与模板一致为 0。决定性异常是 entry ID 顺序：

```text
official original / TV Wing / Delta Plus: strictly ascending u32 IDs
crash copy tail: ..., 0xFA64E4D0, 0x77A3426B, 0x04DC0DEE, 0x233C4626
```

旧 `exvs2-json copyParamEntry` 使用 `Vec::push`，builder 又按当前 vector
顺序原样序列化，因此低 CRC 被追加到高 ID 后。工具自己的 round-trip 仍为
true，但这不证明 native 查表可接受无序 ID。

工具修复：`copyParamEntry` 与新增 `upsertParamEntry` 改为按 unsigned
`entryId` 有序插入，并新增两个集成回归测试。RED 为 0 passed / 2 failed；
GREEN 为 2 passed。

有序修正版 IDs：

```text
0x04DC0DEE, 0x0D7FCDE2, 0x11BE199D, 0x233C4626,
0x55B03548, 0x750B4B8E, 0x77A3426B, 0x82E67E43,
0x8D5B747A, 0x9398CED9, 0xFA64E4D0
```

当前目标路径 `armsparam.bin` 已安装有序修正版，SHA-256 为
`2388C188437646B25C397FFD27E0CBC86D43F356198671918C6952609DB7D406`，
共 11 rows，entry ID 严格按 unsigned u32 升序。原版 8-row 备份仍保留在
`tmp/exvs2-json/20260822-wing-rebellion-flight-arms/armsparam.original.A4665B7C63951980.bin`。

最终状态：工具有序插入修复、修正版 Param 安装、MSC 三个飞行 ID 绑定三者
已经一致。此前“MSC 引用新 ID、目标 Param 却恢复为原版”的崩溃窗口已关闭。

## MSC 接线（2026-08-22）

`2.c` 已接入飞行栏：

```text
slot 0 -> 0x77A3426B
slot 1 -> 0x04DC0DEE
slot 2 -> 0x233C4626
slot 3 -> 不重绑；继承当前 FLYING/FLYING_EX 状态
slot 4 -> 不重绑；继承当前 Zero System loading/ready 状态
```

实现位置：

- `rebellion_install_bird_weapon_bar()`：slot 0 使用五参数 mode-4 adapter，`0x77A3426B` 与普通主射 `0x750B4B8E` 共享 charge state、保留各自 ammo state；slot 1/2 独立绑定；slot 3/4 不写。
- `rebellion_transform_start()` phase 0：写 `global143=2` 后安装一次飞行栏。
- `rebellion_restore_normal_hand_weapons()`：自然退出与 FORCED_RECOVERY 共用；slot 0 反向 mode-4 adapter，slot 1/2 恢复普通行，slot 3/4 不写；不调用 `func_1034(0)`。
- `func_875`：鸟形态暂停普通 slot 1 availability/presentation。
- `func_1033`：所有形态持续推进 slot 4 Zero System loading→ready 状态机。
- `func_876` / `func_879`：所有形态保留 slot 3 FLYING/FLYING_EX availability、entry swap 与 CS presentation。

当前功能边界：鸟主射第一发消费真实 ammo slot 0，第二发通过虚拟 slot `0x5` 生成而不再次扣弹；slot 1/2 只完成 HUD/ammo entry 接入，尚未配置新的输入 action 与 projectile。slot 3/4 保持原生 FLYING/Zero System 状态链。

### 普通/飞行主射 CS 共享与双发单次扣弹（2026-08-22，source 已修，待实机）

最早用三参数 `sys_4F(0xB, slot, row)` 重绑主射 row，会让两种形态的
charge state 分离。随后改成不带 mode 的四参数 adapter，蓄力可以继承，
但它同时复制 raw ammo：普通 10 发进入鸟形态成为 2 发是正确的，退出时却把
鸟形态当前 2 发写回普通槽，结果普通槽显示 2/10。

决定性参考不是 TV Wing（其普通/鸟主射都是 7 发），而是 Delta Plus
`func_1037` / `func_1038`：普通主射 `0x1486A84F` 为 4 发、WR 主射
`0x377D1397` 为 2 发，双方 charge profile 相同；官方双向 adapter 都带
最后一个 `0x4`。Rebellion 改为同一模式：

```text
ENTER  sys_4F(0xB, 0, 0x77A3426B, 0x750B4B8E, 0x4)
EXIT   sys_4F(0xB, 0, 0x750B4B8E, 0x77A3426B, 0x4)
```

自然退出与 `rebellion_interrupt_bird_form_to_ground()` 都走同一个反向 adapter；
charge 跨形态继承，normal 10-round 与 bird 2-round ammo state 不再互相覆盖。
`func_874 -> func_1034(0)` 仍只负责出击/复活时的真正重置。

鸟主射的两个 projectile 原先都使用 `global681 == 0`，因此同一 firing tick
消费两次 slot 0。参考 Delta Plus `func_1012`，现在只有
`0xCDA9F561` 使用真实 slot 0，`0xCDA9F562` 使用虚拟 slot `0x5`。

静态测试、AI block、opaque function pointer 和 `msclang` 编译均已通过；
普通蓄力→进入→退出、飞行蓄力→退出、满蓄力两方向切换仍需实机验证。

最终使用 legacy `msclang.py -i` 同步目标二进制。`2.dscex` 已经与最终编译
逐字节相同；旧 `0.bscex` 尚未包含 `0.c func_143` 的 CSA selector 修复，因此
备份后替换。对目标二进制重新反编译，已回读到：

```text
0.c: func_95(0x2194F05D, 0, 0x1, 0)
2.c: 双向 sys_4F(..., oldRow, 0x4)
2.c: bird -> 0x616971CE 后 func_104(0,0,0) + func_107(0,0,0)
```

没有安装到游戏包；实机结果仍需用户 repack/package 流程确认。

### 飞行 CSA / CSB action 接线（2026-08-22，source 已修，待实机）

`0.c func_113` 与正常形态 `func_143` 证明：`0x800` 是 charge-A release，
`0x1000` 是 charge-B release。鸟分支此前没有处理这两个 bit，所以 HUD
即使有蓄力状态，也没有具体 action 被提交。

- CSA：`0x800 -> 0x2194F05D -> ACTION_CHARGE_SHOT_BIRD`。selector 参数必须
  与飞行主射完全一致：`func_95(0x2194F05D, 0, 0x1, 0)`，不能沿用地面 CSA
  的 `(1, 1, 0xB)`，否则动作类别会让飞行移动停住。handler 直接调用
  `ACTION_A_SHOT_BIRD`，所以 motion、两发 projectile、只扣一次 slot 0、
  recovery 与飞行主射一致；`func_41` allowlist 保持鸟 form。
- CSB：`0x1000 -> 0x616971CE -> ACTION_MASK_1000`。不加入 allowlist；
  `func_41` 先执行统一 FORCED_RECOVERY、恢复普通 row/挂件，再对该边专门调用
  `func_104(0,0,0)` 与 `func_107(0,0,0)` 清掉飞行 body 基础/偏移旋转，最后由
  现有 `func_1031` 消费 slot 4 并启动普通 Zero System。普通模式 Zero System
  与鸟近战路径不受影响。

没有新增 motion、projectile 或 Param row。`0x2194F05D` 仅复用 TV Wing
已经存在的 bird-main action key，在当前 target registry 中无冲突。

### CS action 入口消费 charge slot（2026-08-22）

用户实机补充了必须长期保留的规则：CS 满蓄后，action 开始时必须消费对应
charge slot；播放动作本身不会自动清掉 native 满蓄状态，否则动作结束后仍可
无限重复使用。

Rebellion 三个 CSA action 原先都缺少这一步。现已在
`ACTION_CHARGE_SHOT`、`ACTION_CHARGE_SHOT_DIRECTIONAL`、
`ACTION_CHARGE_SHOT_BIRD` 入口最前面加入一次 `sys_4F(0xA,0)`。飞行 CSA
只在专用 wrapper 清 slot，未修改普通鸟主射共用的 `ACTION_A_SHOT_BIRD`。

CSB 不重复添加：`ACTION_MASK_1000` 在启动 driver 前调用 `func_1031()`，其
`sys_4F(0x11,4,0)` + `0x5/0x3` 已负责清空、关闭并消费 slot 4。

通用规则与中断陷阱记录在
`docs/msc-research/cs-action-charge-slot-consumption.md`。

### HUD/CS 状态回归（2026-08-22，source 已修，待实机）

症状：第五栏 Zero System 一直停在 loading，且 CS 蓄能条消失。

根因：旧 bird bank 把 Zero System 从原生 slot 4 移到 slot 3，并清空 slot 4；
同时 AI guards 暂停 `func_1033`，阻止 loading→ready，并阻止 `func_876/879`
维护 slot 3 的 FLYING/FLYING_EX charge presentation。

修复：bird 只替换 slot 0–2；slot 3/4 不重新绑定，直接继承 normal 进入前状态；撤销上述三个 guards，让原生状态机继续推进。
`func_875` 的 slot-1 guard 保留，避免普通副射 HUD 覆盖独立飞行 slot 1。

TV `func_1078` 会依据 form 与当前状态使用 paired `sys_4F(0xB,...)` 继承
武装栏状态。Rebellion 没有对应的完整双表，因此最小等价实现是根本不触碰
原生 slot 3/4，而不是在每次进入 bird 时把它们重新绑定到初始 row。

退出与中断也必须对称。`rebellion_restore_normal_hand_weapons()` 原先调用
`func_1034(0)`，会在退出时重绑完整 0..4 bank：slot 4 被重置为 Zero System
loading row，slot 3 的 CS/Flying presentation 也会丢状态。修复后该 helper 只
恢复 normal slot 0–2；slot 3/4 继续继承。`func_874` 的出击/复活初始化仍保留
`func_1034(0)`，因为那是真正的 reinitialize，而不是 form transition。

## 端到端复盘：变形闪退与鸟特格（2026-08-22）

### 现象

1. 按住 boost 并双击前进触发 `0x9475130E` 变形进入时，游戏立即崩溃。
2. 用户完成 Rebellion body+wing Folder `trans_te_motion_stk_air_fr_out`，希望把它接成飞行形态 N 特格。

### 排除的错误假设

闪退不是 motion/action ID 不存在。当前 motion structure 与磁盘均存在：

```text
transform enter  runtime 0xA621FD5E  raw unk1 5efd21a6
transform loop   runtime 0x9DE587CE  raw unk1 ce87e59d
transform exit   runtime 0x67A17368  raw unk1 6873a167
bird N special   runtime 0x1192E91E  raw unk1 1ee99211
```

四个 Folder 的 body/wing NUANMB 文件均存在且非空。`0x9475130E` 也已在
`2.c` registry 接到 `func_450`。因此不能通过替换 transform slot 来处理这次
崩溃。

### 决定性根因

`func_450 → slot 0x23 → rebellion_transform_start()` 的首帧顺序是：

```text
global142 = 0xC2B19D13
global143 = 2
rebellion_install_bird_weapon_bar()
...
func_74(0x37, 0)
```

motion 播放前，MSC 已尝试绑定三个独立飞行 armsparam ID。目标文件曾被恢复
为原版 8-row Param，因此三个 ID 全部缺失；这与“进入时、动画播放前立即崩”
的时序完全吻合。`0xC2B19D13` flight speed row 则真实存在。

另一 session 的首版 11-row Param 也会崩：三个低 CRC row 被追加到
`0xFA64E4D0` 后，破坏了 native 查表所需的 unsigned ID 升序。roundtrip
byte-identical 只能证明 builder 可逆，不能证明 native 接受无序表。

### 最终修复

1. `exvs2-json` 的 `copyParamEntry` / `upsertParamEntry` 改为 unsigned
   `entryId` 有序插入，并加入回归测试。
2. 安装 11-row sorted-fixed `armsparam.bin`，SHA-256：
   `2388C188437646B25C397FFD27E0CBC86D43F356198671918C6952609DB7D406`。
3. `rebellion_install_bird_weapon_bar()` 恢复独立绑定：
   `0x77A3426B / 0x04DC0DEE / 0x233C4626 / 0x0D7FCDE2`。
4. 鸟形态 `0x200` 改为 TV N 特格 action hash `0xC0B814FF`；Rebellion
   单阶段 handler 先幂等拆鸟，再播放 Folder runtime `0x1192E91E`，motion
   结束后退出。

### 实机结论

用户确认：

- boost + 双击前进可正常进入飞行，不再崩溃；
- 飞行形态特格可触发 `0xC0B814FF`；
- 新 body+wing Folder `0x1192E91E` 正常播放。

这同时验证了 Param row 顺序、MSC row 引用、鸟输入 selector、action registry
和 motion Folder Runtime 五层接线。

### 尚未移植

- TV N 落地第二段 `0x63327DCF`；
- 左右飞行特格 `0x8D96C52F / 0x279F0DA4`；
- 左右收招、TV 专用 effect 与 SE。

当前只可称为“已实机验证的 N 空中单阶段”，不能写成完整 TV `ALT_7` 移植。
