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
| 3 | 复用 `0x0D7FCDE2` | 原 Rebellion Zero System | 不改 | 不改 | 不改 |

三个新 row 都由目标本机 row 复制，保留未知字段、`resourceLabel` 与布局。只修改 entry id、`actionLabel`、弹数、reload 类型及 reload timer。

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

当前目标路径 `armsparam.bin` 已由用户恢复为原版 SHA
`A4665B7C...`。MSC 已引用三个新 ID；在安装有序修正版 Param 之前，不要
用这套 MSC 进入鸟形态，否则 entry 缺失仍可能崩溃。

## MSC 接线（2026-08-22）

`2.c` 已接入飞行栏：

```text
slot 0 -> 0x77A3426B
slot 1 -> 0x04DC0DEE
slot 2 -> 0x233C4626
slot 3 -> 0x0D7FCDE2
slot 4 -> 0
```

实现位置：

- `rebellion_install_bird_weapon_bar()`：简单 `sys_4F(0xB,slot,entry)` 绑定，主射不使用 normal-main paired entry，因此 ammo 独立。
- `rebellion_transform_start()` phase 0：写 `global143=2` 后安装一次飞行栏。
- `rebellion_restore_normal_hand_weapons()`：自然退出与 FORCED_RECOVERY 共用；追加 `func_1034(0)` 恢复普通 0..4 bank。
- `func_875`：鸟形态暂停普通 slot 1 availability/presentation。
- `func_1033`：鸟形态暂停普通 slot 4 reload/rebind 状态机。
- `func_876` / `func_879`：鸟形态禁止普通 slot 3 availability/entry 回写。

当前功能边界：现有鸟主射已消费 ammo slot 0；slot 1/2 只完成 HUD/ammo entry 接入，尚未配置新的输入 action 与 projectile。slot 3 按产品决定显示共享 Zero System entry；其鸟形态输入动作仍需单独实机确认。
