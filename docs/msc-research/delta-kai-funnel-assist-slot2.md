# Delta Kai 浮游炮 / 援护 slot 2 调用链研究

本文记录当前对 `E:\XB\解包\com\file\0xBDBE6FEA\2.c` 的研究结论。目标是回答：

- 德尔塔 Plus / Delta Kai 右边第三个槽为什么是 2 发。
- 这个槽怎么触发援护 / 特殊装备。
- 什么条件下会变红、不可召唤。
- `//connect funnel to backpack` 现在的改法是否足够。
- 浮游炮发出去后，怎样避免立刻再次发射。

本文记录当前证据、已落地的 `2.c` patch、以及仍未证明的资源链路。

最新范围约束：

```text
当前阶段专注 MSC 层。
不继续展开 bulletparam。
真实飞出去的武器实体暂时只在 2.c 的 sys_51 发射点用英文注释记录为后续工作。
AI 修改过的 MSC 代码必须使用 AI block：// AI decision ... 到 // End, origin is ...
代码注释可使用 Future work，不写项目禁用标记。
```

## 一句话结论

Delta 普通形态的右边第三槽是 slot `2`：

```text
2.c:25415  sys_4F(0xb, 0x2, 0xa8e202bf)
```

当前 armsparam 里 `0xa8e202bf` 的关键值是：

| entry id | ammo_count | reload_type | reload_per_shot_frame | cooldown_frame | bullet_type |
|---:|---:|---:|---:|---:|---:|
| `0xa8e202bf` | `2` | `0` | `360` | `240` | `2` |

kind-7 label 解码后，这个 entry 的人类名是：

| entry id | action label | resource label |
|---:|---|---|
| `0xa8e202bf` | `GUN_015GNDMUC_004DELTPL_001_ASSIST` | `CHR_015GNDMUC_004DELTPL_001` |

所以“2 发槽位”不是写在特射 action 里，而是来自 slot 2 绑定的 armsparam entry。
它的原始语义更接近 `ASSIST`，还不是已经证明的 `FUNNEL` projectile。

另一个关键点是角色系统 selector：

```text
2.c:25416  sys_1(0x60008, 0x1b12ae7d)
```

`0x1b12ae7d` 不是 `chrsysparam.csyspm`，也不是 `speedparam.bin`。它在当前
`0x08248A8D/characterparam.bin` 中是 entry id：

| characterparam entry | action label | resource label |
|---:|---|---|
| `0x1b12ae7d` | `ORDER_0` | `CHR_015GNDMUC_004DELTPL_001` |
| `0x6c159eeb` | `ORDER_1` | `CHR_015GNDMUC_004DELTPL_001` |
| `0xf51ccf51` | `ORDER_2` | `CHR_015GNDMUC_004DELTPL_001` |

所以当前 clone 的外层资源名是 `026gnbelt_003delatkai_001_*`，但参数内部的
角色系统 label 仍然是原 Delta Plus 的 `CHR_015GNDMUC_004DELTPL_001`。
这会影响后面判断 native assist gate / 资源身份错位，不能只看 `2.c`。

Delta 特射 / 援护 action 不是用 `sys_4F(0,2,hash)` 直接发射。它在动作中：

```text
sys_51(0x20000, 0, 0x2, ..., ...)
sys_4F(0x7, 0x2, 0x1)
```

当前读法：

- `sys_51(...)`：生成 / 调度援护、特殊装备、子机一类的行为；第三参 `0x2` 当前更像 native 子系统 / depiction family，不应直接写成 HUD slot。
- `sys_4F(0x7,2,1)`：Delta 当前 action 里扣 slot 2 一发；slot 证据来自这个扣槽调用和 `sys_4F(0xb,2,0xa8e202bf)` 的槽位绑定。

## 输入层：为什么按特射前先查 slot 2

Delta 的 `0.c func_143` 中，特射输入是 `global48 & 0x100`：

```text
0xBDBE6FEA/0.c:3425-3444
else if (global48 & 0x100)
{
    if (!(sys_0(0x90000, 0x2) == 0))
    {
        if (global2 & 0x3c)
        {
            if (sys_0(0xd0001, 0) && sys_0(0xd000b, 0) == 0 &&
                sys_0(0xd0001, 0x1) && sys_0(0xd000b, 0x1) == 0)
            {
                func_95(0x23df217e, 0x1, 0x401, 0x8);
            }
        }
        else if (same d0001/d000b gate)
        {
            func_95(0x23df217e, 0x1, 0x401, 0x8);
        }
    }
    else
    {
        func_98(0x2);
    }
}
```

人话：

```text
按 AC / 特射
  -> 先看 slot 2 是否有可用资源：sys_0(0x90000,2)
  -> 再看两组 d0001/d000b 条件
  -> 成功才提交 action hash 0x23df217e
  -> slot 2 不可用就走 func_98(2)，也就是失败反馈
```

`0x23df217e` 在 Delta `2.c` 注册为：

```text
2.c:29448  func_241(0x23df217e, ACTION_AC_SPECIAL_SHOT_DIRECTIONAL)
```

锁定切换 / 特殊状态下还有：

```text
2.c:29467  func_241(0x9c05b42d, ACTION_AC_SPECIAL_SHOT_LOCK_SWITCH)
```

## 特射 action：援护生成和扣槽

Delta 的普通特射 action：

```text
2.c:26957  ACTION_AC_SPECIAL_SHOT_DIRECTIONAL
  -> global609 = func_952
```

关键输出在 `func_952`：

```text
2.c:27000-27013
if (func_309(global20, 0x1f4))
{
    if (global200 == 1)
    {
        sys_51(0x20000, 0, 0x2, 0, 0x5);
        sys_51(0x20000, 0, 0x2, 0x1, 0x6);
    }
    else
    {
        sys_51(0x20000, 0, 0x2, 0, 0x2);
        sys_51(0x20000, 0, 0x2, 0x1, 0x4);
    }
    sys_4F(0x7, 0x2, 0x1);
    func_123(0x281);
}
```

当前解释：

| 调用 | 当前读法 |
|---|---|
| `global200` | 是否有方向输入。来自 `global87 & 0x3c`。 |
| `sys_51(0x20000,0,2,...)` | 特射援护 / 特殊装备生成。第三个参数 `0x2` 不能直接等同 HUD slot；Delta 的 slot 2 由 `sys_4F(0xb,2,0xa8e202bf)` 和后续扣槽调用证明。 |
| `sys_4F(0x7,2,1)` | 主动扣 slot 2 的 gauge/ammo 1 点。 |
| `func_123(0x281)` | cancel / route mask，具体语义仍需实机验证。 |

所以如果要把“浮游炮发射”做成特射，应该沿用这个结构：

```text
输入 gate 仍检查 sys_0(0x90000,2)
动作输出先生成浮游炮 / 子机
然后 sys_4F(0x7,2,1) 扣一发
```

不要只写 `sys_4B` 挂模型。`sys_4B` 只处理当前机体 shell / component，不等于武装发射和 ammo 状态。

## RX-78-2 对比

RX 的 `0.c` 也检查 slot 2：

```text
040msc/0xF22E425D/0.c:3366-3375
else if (global48 & 0x100)
{
    if (sys_0(0x90000, 0x2) == 0)
    {
        func_98(0xffffffff);
    }
    else if (same d0001/d000b gate)
    {
        func_95(0xe7d67e59, 0x1, 0x401, 0x8);
    }
}
```

RX 的 `2.c` 中 `0xe7d67e59` 进入 `func_950`，关键输出同样是：

```text
040msc/0xF22E425D/2.c:27067-27085
sys_51(0x20000, 0, 0x2, 0, ...);
sys_51(0x20000, 0, 0x2, 0x1, ...);
sys_4F(0x7, 0x2, 0x1);
```

这说明 `sys_51` + 后续扣槽 syscall 是跨机体复用的援护 / 特殊装备模式，不是
Delta 独有写法。但 `sys_51` 第三参不能直接当作 HUD slot；例如 Sazabi 的真
funnel arms entry 绑定在 slot `1`，它的 `sys_51` 调用仍然使用第三参 `0x2`。
所以后续文档里把 slot 判断统一压回 `sys_4F(0xb,slot,armsEntry)` 和扣槽
syscall，而不是压在 `sys_51` 参数上。

## 红槽 / 不可召唤是哪里维护的

Delta 每帧维护 slot 2 UI / 可用状态：

```text
2.c:29366-29386
void func_1040()
{
    if (global143 == 0)
    {
        if (sys_0(0xd0001,0) && sys_0(0xd000b,0) == 0 &&
            sys_0(0xd0001,1) && sys_0(0xd000b,1) == 0)
        {
            sys_4F(0x16, 0x2, 0);
        }
        else
        {
            sys_4F(0x16, 0x2, 0x1);
        }
    }

    if (same d0001/d000b gate)
    {
        sys_4F(0x15, 0x2, 0x1, 0xa8e202bf);
    }
    else if ((sys_0(0x90000, 0x2, 0) != 0) <= 0)
    {
        sys_4F(0x15, 0x2, 0, 0xa8e202bf);
    }
}
```

当前读法：

| 条件 | 调用 | 现象推测 |
|---|---|---|
| 普通形态且 `d0001/d000b` gate 通过 | `sys_4F(0x16,2,0)` | slot 2 不被额外禁用 |
| 普通形态但 `d0001/d000b` gate 失败 | `sys_4F(0x16,2,1)` | slot 2 进入不可用 / 灰红状态 |
| gate 通过 | `sys_4F(0x15,2,1,0xa8e202bf)` | HUD 使用 `0xa8e202bf` 显示可用 |
| gate 失败并且 slot 2 ammo <= 0 | `sys_4F(0x15,2,0,0xa8e202bf)` | HUD 显示不可用 / 空槽 |

RX 也有同形态逻辑：

```text
040msc/0xF22E425D/2.c:29783-29800
sys_4F(0x16,2,0/1)
sys_4F(0x15,2,1/0)
```

所以红槽需要同时看两层：

```text
1. slot 2 有没有 ammo/resource：sys_0(0x90000,2)
2. d0001/d000b gate 是否允许当前召唤 / 援护
```

2026-06-19 的 Delta Kai clone patch 对这层做了一个 MSC-only bypass：

```text
if normal form and not both cloned funnel shells are out:
  sys_4F(0x16, 2, 0)              // do not let missing native assist actors mark slot 2 red
  if sys_0(0x90000, 2, 0) != 0:
    sys_4F(0x15, 2, 1, 0xa8e202bf)
  else:
    sys_4F(0x15, 2, 0, 0xa8e202bf)
  return
```

原因：Delta Plus wiki 说明普通特射是 `ジェスタ 呼出`，弹数 2；当前 clone
从 Delta Plus 复制了 MSC 和 arms slot，但没有完整载入原援护 actor 时，
`d0001/d000b` 会失败并把 slot 2 打红。这个 bypass 只修 HUD / MSC 显示
层：有 ammo 时不红；两枚 cloned funnel 都 out 时仍由脚本 gate 打红。
它不证明 `sys_51` 真实生成的实体已经变成 Delta Kai funnel。

当前 patch 又加了一层脚本侧 visible-shell gate：

```text
if (deltaKaiFunnelShell0IsOut != 0 && deltaKaiFunnelShell1IsOut != 0)
{
    sys_4F(0x16, 2, 1);
    sys_4F(0x15, 2, 0, 0xa8e202bf);
    return;
}
```

人话：两枚 cloned funnel shell 都已经在外面时，即使 native ammo / reload
先恢复，也先把 slot 2 显示成不可用，直到某个 timer 回收并重新把 shell 挂回背包。

另外，`func_952()`、`func_1025()`、`func_1026()` 和 `func_1027()` 的 segment 顶部也做了同一层 guard：

```text
if (both cloned funnel shells are out)
  -> sys_4F(0x16,2,1)
  -> sys_4F(0x15,2,0,0xa8e202bf)
  -> global252 = 1
  -> return
```

这不是改输入层，而是 MSC action 内部的快速拒绝。它的目的不是改变真实
weapon resource，而是避免“slot 2 看起来红了，但 action 仍播放完整空动作”。
其中 `func_1025()` 必须一起 guard，因为它是锁定切换特射的前段，并且原逻辑
会写 `sys_4F(0x16,2,0)`，可能短暂把 slot 2 标成可用。
`func_1025()` 的 guard 还会写 `global722=1`，这是 `func_593` runtime 的
startup-complete flag；否则只写 `global252=1` 仍可能等完整 startup 时间。
`func_1027()` 的 guard 用来跳过被拒绝动作的锁定切换末段效果。

## 为什么 clone 到 Delta Kai 后 slot 2 会红

当前已经验证：不是 `2.c` 的 action hash 错，也不是 Delta Kai clone 的
`armsparam.bin` 缺 `0xa8e202bf`。

`custom_unit.json` 的 Delta Kai 资源绑定是：

| 字段 | signed | unsigned hex | 当前证据 |
|---|---:|---:|---|
| `Model` | `-1571248862` | `0xa258a522` | `E:\XB\解包\com\file\0xa258a522` 存在 |
| `Effect` | `-193844023` | `0xf4722cc9` | `E:\XB\解包\com\file\0xf4722cc9` 存在 |
| `Param` | `136612493` | `0x08248a8d` | `E:\XB\解包\com\file\0x08248A8D` 存在 |
| `Msc` | `-1111592982` | `0xbdbe6fea` | 当前正在分析的 `0xBDBE6FEA/2.c` |
| `Motion` | `-230704377` | `0xf23fbb07` | `E:\XB\解包\com\file\0xf23fbb07` 存在 |

Delta Kai clone 当前实际加载的参数包：

```text
E:\XB\解包\com\file\0x08248A8D\armsparam.bin
```

它的 entry 列表是：

| index | entry id | 说明 |
|---:|---:|---|
| 0 | `0x10b251b4` | 普通 slot 1 |
| 1 | `0x1486a84f` | 普通 slot 0 |
| 2 | `0x1799c911` | 飞机形态 slot 2 |
| 3 | `0x377d1397` | 飞机形态 slot 0 |
| 4 | `0xa8e202bf` | 普通形态 slot 2 / 特射援护槽 |
| 5 | `0xf100a0da` | 飞机形态 slot 1 |

`0xa8e202bf` 在 clone 参数包中的关键字段：

| 字段 | 值 |
|---|---:|
| `is_enabled` | `1` |
| `ammo_count` | `2` |
| `reload_type` | `0` |
| `reload_start_frame` | `240` |
| `reload_time_total` | `80` |
| `reload_per_shot_frame` | `360` |
| `ammo_reload_wait_frame` | `80` |
| `cooldown_frame` | `240` |
| `bullet_type` | `2` |

所以这条链是成立的：

```text
sys_1(0x60008, 0x1b12ae7d);
sys_4F(0xb, 0, 0x1486a84f);
sys_4F(0xb, 1, 0x10b251b4);
sys_4F(0xb, 2, 0xa8e202bf);
```

但这条链只证明“slot 2 绑定到了 `ASSIST` arms entry”。它没有证明 clone 的
native 资源身份已经切到 Delta Kai。`sys_1(0x60008,0x1b12ae7d)` 当前实际选择
`characterparam[0x1b12ae7d]`，而这个 entry 的 `resource_label_offset` 解码为：

```text
CHR_015GNDMUC_004DELTPL_001
```

同一个参数包中的 `0x6c159eeb` 和 `0xf51ccf51` 也都还是这个 resource label。
因此，如果 native 的 `d0001/d000b` gate 或 `sys_51` 生成援护时依赖角色系统
resource label，那么单改 `2.c` 不能把 native 身份变成 `026gnbelt_003delatkai_001`。

剩下的红槽原因要往两层查：

```text
1. sys_0(0xd0001,0/1) 和 sys_0(0xd000b,0/1) 的 assist gate
   - func_1040 会按这组 gate 写 sys_4F(0x16,2,0/1)
   - gate 失败时 HUD 会被脚本维护成不可用 / 红

2. sys_51(0x20000,0,2,index,type) 需要的援护 / projectile / depiction 资源
   - armsparam slot 有 ammo 不代表援护实体资源完整
   - 当前 Effect 包仍主要是 Delta Plus 旧 effect 名
   - projectile_depiction_table 只有 2 条，且没有直接指向 delatkai_funnel shell entry

3. characterparam 角色系统 entry 的 resource label
   - sys_1(0x60008, hash) 当前命中 characterparam entry id
   - Delta Kai clone 的三条 entry 都还是 CHR_015GNDMUC_004DELTPL_001
   - 如果 native gate 按 CHR label 找 assist actor/resource，这会造成 clone 身份错位
```

红槽排查顺序应该更新为：

| 检查项 | 当前结果 | 结论 |
|---|---|---|
| Delta Kai 当前使用的 armsparam 文件 | `0x08248A8D/armsparam.bin` 有 `0xa8e202bf`，`ammo_count=2`，`is_enabled=1` | 已通过 |
| `2.c` 普通初始化 | `sys_4F(0xb,2,0xa8e202bf)` 存在 | 已通过 |
| `0x60008` 角色系统 selector | `0x1b12ae7d` / `0x6c159eeb` / `0xf51ccf51` 都在 `characterparam.bin`，但 resource label 都是 `CHR_015GNDMUC_004DELTPL_001` | clone 身份错位，需继续查是否影响 gate |
| `chrsysparam.csyspm` | Delta Kai / RX / Sazabi 样本都是 68 字节，两张 1x1 空表 | 不是当前红槽 gate 的数据来源 |
| SHL shell entry | `0x10B0AAAA` / `0x11B0AAAA` 存在，均指向 folder index 13 | 背包模型入口已通过 |
| folder index 13 | `delatkai_funnel.numdlb` | 背包模型资源已通过 |
| `sys_51` 所需 assist/special resource | 尚未证明 type `2/4/5/6` 指向新 funnel | 仍需查 |
| `d0001/d000b` gate | 只看到脚本调用，未拿到 native 语义 | 仍需查 |

不建议先改 `0.c` 跳过 `sys_0(0x90000,2)`。那会让动作能进，但资源缺失仍然可能空发、红槽、崩溃或 HUD 异常。

### 参数 label 候选修复：不覆盖原文件的试验版

为了验证“红槽是否来自 clone 内部 `CHR_...` label 仍是原机体”，已生成一份不覆盖原包的
候选参数文件：

```text
C:\Users\kjjkjj\AppData\Local\Temp\delta_kai_param_label_candidate\characterparam.bin
C:\Users\kjjkjj\AppData\Local\Temp\delta_kai_param_label_candidate\armsparam.bin
C:\Users\kjjkjj\AppData\Local\Temp\delta_kai_param_label_candidate\report.json
```

这个候选没有改 entry id、ammo、reload、slot 绑定，只改 kind-7 label 指针，
并重建了字符串池，因为新字符串比旧字符串更长，不能原地覆盖。

`characterparam.bin` 候选修改：

| entry id | 旧 resource label | 新 resource label |
|---:|---|---|
| `0x1B12AE7D` | `CHR_015GNDMUC_004DELTPL_001` | `CHR_026GNBELT_003DELATKAI_001` |
| `0x6C159EEB` | `CHR_015GNDMUC_004DELTPL_001` | `CHR_026GNBELT_003DELATKAI_001` |
| `0xF51CCF51` | `CHR_015GNDMUC_004DELTPL_001` | `CHR_026GNBELT_003DELATKAI_001` |

`armsparam.bin` 候选修改：

| entry id | 修改 |
|---:|---|
| `0x10B251B4` | resource label 改成 `CHR_026GNBELT_003DELATKAI_001`，action label 改成 `GUN_026GNBELT_003DELATKAI_001_GRENADELAUNCHER` |
| `0x1486A84F` | resource label 改成 `CHR_026GNBELT_003DELATKAI_001`，action label 改成 `GUN_026GNBELT_003DELATKAI_001_BEAMRIFLE` |
| `0x1799C911` | resource label 改成 `CHR_026GNBELT_003DELATKAI_001`，action label 改成 `GUN_026GNBELT_003DELATKAI_001_BEAMMAGNUM_WR` |
| `0x377D1397` | resource label 改成 `CHR_026GNBELT_003DELATKAI_001`，action label 改成 `GUN_026GNBELT_003DELATKAI_001_BEAM_GRENADE_WR` |
| `0xA8E202BF` | resource label 改成 `CHR_026GNBELT_003DELATKAI_001`，action label 改成 `GUN_026GNBELT_003DELATKAI_001_ASSIST` |
| `0xF100A0DA` | resource label 改成 `CHR_026GNBELT_003DELATKAI_001`，action label 改成 `GUN_026GNBELT_003DELATKAI_001_MOVEATTACK_WR` |

验证结果：

| 文件 | 原大小 | 新大小 | 验证 |
|---|---:|---:|---|
| `characterparam.bin` | `5692` | `5782` | header file_size 与实际长度一致；3 个 entry 指针都解码到新 CHR label |
| `armsparam.bin` | `2437` | `2874` | header file_size 与实际长度一致；6 个 entry 的 action/resource label 都解码到 Delta Kai |

实机测试建议：

1. 先备份 `E:\XB\解包\com\file\0x08248A8D\characterparam.bin` 和 `armsparam.bin`。
2. 临时替换成候选文件。
3. 只观察右边第三槽是否还开局红 / 是否能通过 `d0001/d000b` gate。
4. 如果红槽恢复，说明 clone 内部 `CHR_...` label 是 native gate 的关键证据之一。
5. 如果仍然红，继续查 `sys_51` type `2/4/5/6` 的资源表或 native handler。

### 2026-06-19 已执行的参数替换

已经把候选参数文件复制到当前 Delta Kai clone 的 Param 包：

```text
E:\XB\解包\com\file\0x08248A8D\characterparam.bin
E:\XB\解包\com\file\0x08248A8D\armsparam.bin
```

原始文件已备份到：

```text
E:\XB\解包\com\file\0x08248A8D\_backup_delta_kai_label_patch_20260619_143905\characterparam.bin
E:\XB\解包\com\file\0x08248A8D\_backup_delta_kai_label_patch_20260619_143905\armsparam.bin
```

替换后解析验证：

| 文件 | 当前状态 |
|---|---|
| `characterparam.bin` | `0x1B12AE7D / 0x6C159EEB / 0xF51CCF51` 都解码为 `CHR_026GNBELT_003DELATKAI_001` |
| `armsparam.bin` | 6 个 entry 都解码为 `CHR_026GNBELT_003DELATKAI_001`，`GUN_...` label 也改为 `GUN_026GNBELT_003DELATKAI_001_*` |
| backup | 备份文件仍解码为旧的 `CHR_015GNDMUC_004DELTPL_001` / `GUN_015GNDMUC_004DELTPL_001_*` |

回滚方法：

```powershell
Copy-Item -LiteralPath 'E:\XB\解包\com\file\0x08248A8D\_backup_delta_kai_label_patch_20260619_143905\characterparam.bin' -Destination 'E:\XB\解包\com\file\0x08248A8D\characterparam.bin' -Force
Copy-Item -LiteralPath 'E:\XB\解包\com\file\0x08248A8D\_backup_delta_kai_label_patch_20260619_143905\armsparam.bin' -Destination 'E:\XB\解包\com\file\0x08248A8D\armsparam.bin' -Force
```

注意：这一步只修正 Param 内部 label 身份，尚未证明 `sys_51` 生成实体已经变成
Delta Kai funnel。它的实机观察目标是：右三槽开局是否还红、特射是否通过
`d0001/d000b` gate。

## 当前 `connect funnel to backpack` 是否正确

你当前加的是：

```text
2.c:25651-25653
//connect funnel to backpack
sys_4B(0x2, 0x10B0AAAA, 0xD50F498E, 0x4094b0f4);
sys_4B(0x2, 0x11B0AAAA, 0x2F0074ED, 0x4094b0f4);
```

并且同样加在 `func_897/898/899`。

当前判断：

| 目标 | 当前改法是否足够 | 理由 |
|---|---|---|
| 普通刷新时背包上显示两个浮游炮 | 基本可以 | SHL 已验证 `0x10B0AAAA` / `0x11B0AAAA` 存在，且都指向 `delatkai_funnel.numdlb`。上层 `func_889/890/891/892/893/894/895` 开头会 `sys_4B(0x3)` 清 shell，再调用这些装配函数。 |
| 确保所有外出的浮游炮都回到背上 | 不够 | 这两行只创建 / 挂接 shell component，不知道已经外出的 projectile / assist object 是否结束。 |
| 发射时让背包上的浮游炮消失 | 不够 | 特射 action 里没有 `sys_4B(0x3,0x10B0AAAA)` 或 `sys_4B(0x3,0x11B0AAAA)`。 |
| 发射后禁止立刻再次发射 | 不够 | 没有状态 flag，也没有把 input gate 和“浮游炮是否在外”绑定。 |
| 把特射援护实体变成浮游炮 | 不够 | `sys_51` 才是援护/特殊装备生成点；当前 projectile depiction 表没有直接指向 `delatkai_funnel`。 |

SHL 实证：

| SHL record | model_id | type | folder_index | folder name |
|---:|---:|---:|---:|---|
| 17 | `0x10b0aaaa` | `3` | `13` | `delatkai_funnel.numdlb` |
| 18 | `0x11b0aaaa` | `3` | `13` | `delatkai_funnel.numdlb` |

`projectile_depiction_table.bin` 当前只有两条：

| entry id | model_hash | main_effect_hash | render_mode |
|---:|---:|---:|---:|
| `0xd0bfbae7` | `0x026d6367` | `0x5e1893e6` | `2` |
| `0xf6b87bda` | `0x267abe88` | `0xceb2e8f7` | `1` |

以下内容只作为已冻结的证据边界：它解释为什么当前不继续从 bulletparam
方向推进，不作为本轮 patch 的输入。

`bulletparam.frontend.json` 当前没有直接用 `bulletResourceHash` 或
`bulletEffectHash` 引用这两个 projectile depiction entry：

```text
0xd0bfbae7
0xf6b87bda
```

这不能证明 projectile depiction 没被用到，因为 native 中间层可能还有映射。
但它能证明一件事：当前还没有一条简单的静态链能写成
“slot 2 -> bulletparam -> projectile_depiction -> delatkai_funnel”。

这说明：

```text
sys_4B shell layer:
  已经能把 delatkai_funnel 挂到背包

sys_51 / projectile layer:
  尚未证明发射出去的对象会使用 delatkai_funnel
```

### `sys_51` 当前证据边界

当前能确认：

| 层 | 证据 |
|---|---|
| 脚本层 | `func_952` 调 `sys_51(0x20000,0,2,index,type)`，随后 `sys_4F(0x7,2,1)` 扣 slot 2 |
| native handler | `CDepictionScript` handler table 的 slot 85 对应 `sys_51 -> sub_1406856A0` |
| native 分支 | 已记录 handler 会切 `0x20000` / `0x20001` 两组参数族 |
| 行为经验 | 现有研究把 `sys_51(0x20000,0,2,index,type)` 读作援护召唤 |

本地 human rewrite 输出也支持这个边界：

```text
native_call_unresolved("VDK::GAM::CDepictionScript", 0x51, 0x20000, ...)
decrement_slot_gauge(0x00000002, 0x00000001)
```

也就是说，`sys_4F(0x7,2,1)` 已经能较高置信写成 slot 2 扣槽；
但 `sys_51` 仍然是 unresolved native call，不能从脚本文本直接推出
projectile / UnitTask 资源。

当前不能确认：

| 未确认项 | 为什么重要 |
|---|---|
| type `2/4/5/6` 各自对应哪个援护/特殊装备资源 | 这决定发出去的是原 Delta Plus 援护，还是新 funnel |
| `index 0/1` 是两个援护对象、两个发射口，还是左右/前后分支 | 这决定能否自然映射成两枚 funnel |
| `0xd0001/d000b` 是否就是 assist actor 的“存在/冷却/占用” gate | 这决定红槽是否来自援护实体不可用，而不是 ammo 不足 |

### `sys_51` type 参数与 `0x10001/0xb` 注册表

新的跨机体对照显示，`sys_51` 最后一个小整数参数和
`sys_1(0x10001, 0xb, slot, hash)` 注册表在编号形态上高度对齐。
但这不是 native 读表证明；目前更准确的说法是：

```text
0x10001/0xb 是一张本机体表现事件 / extra hash 表。
sys_51 type 使用同一批小编号范围，但是否直接读取 0xb 表仍未确认。
```

Delta Kai clone 当前用到的 type：

| `sys_51` type | `func_1046()` 中的 `0x10001/0xb` hash |
|---:|---:|
| `0x2` | `0` |
| `0x4` | `0xfbc563c5` |
| `0x5` | `0x3002fe97` |
| `0x6` | `0xc189c240` |

RX-78-2 对照：

| `sys_51` type | `0x10001/0xb` hash |
|---:|---:|
| `0` | `0x5f2ccc5d` |
| `0x3` | `0x6c5a08f2` |
| `0x4` | `0xfca8a7dc` |

Sazabi 对照：

| `sys_51` type | `0x10001/0xb` hash |
|---:|---:|
| `0` | `0xb122ad71` |
| `0x1` | `0xf5339100` |
| `0x2` | `0` |
| `0x3` | `0x6c5a08f2` |

这个对照说明：

- 同一个 type 数字在不同机体上不一定代表同一个实体资源。
- type 更像“本机体内部编号”，而不是固定跨机体枚举。
- `0x10001/0xb` 表是相关的本机体表现事件 / extra hash 表，但还不能写成
  `sys_51` 的直接资源表。

但这还不是完整资源链。把这些 hash 按明文、LE u32、BE u32 搜索
Delta Kai 参数包、Delta Kai model/effect 包、RX 参数包、Sazabi 参数包后，当前没有命中。
所以它们不像是 `bulletparam` / `projectile_depiction_table` / model 包里的直接索引。

原始 `0xBDBE6FEA/2.c` 里还能看到一组明确用法：

```text
var0 = sys_0(0x10001, 0xb, slot);
sys_58(0 或 1, var0);
```

例如 `slot 0/1/3/5/6/7/8/c/d/e` 都有这种 wrapper。因此当前更稳的判断是：

```text
sys_51 last arg
  -> 使用本机体内部 type/index 编号
  -> 这些编号和 0x10001/0xb 表处在同一表现层编号体系中
  -> 但 0x10001/0xb 已确认主要可被 sys_58 作为表现事件 hash 读取
  -> 它不等于 bulletparam 行，也不等于 projectile depiction entry
```

更稳的背包挂接 helper 应该是：

```c
void attachFunnelsToBackpack()
{
    sys_4B(0x3, 0x10B0AAAA);
    sys_4B(0x3, 0x11B0AAAA);
    sys_4B(0x2, 0x10B0AAAA, 0xD50F498E, 0x4094b0f4);
    sys_4B(0x2, 0x11B0AAAA, 0x2F0074ED, 0x4094b0f4);
}
```

原因：

- 如果上层已经 `sys_4B(0x3)` 全清，前两行可能是冗余，但安全。
- 如果未来在动作中单独调用回收，不经过全清，前两行能避免残留/重复。

注意：这只保证 shell component 回到背上，不保证外部 projectile 被销毁。外部 projectile 要在武装 / assist 行为层处理。

## 发射后不能立刻再次发射：两种方案

### 方案 A：用 slot 2 ammo 做最小锁定

适合目标：

```text
两个浮游炮各代表 1 发。
发出去一个，slot 2 ammo -1。
两个都出去了，slot 2 ammo = 0，不能再发。
```

实现方式：

```text
armsparam entry 0xa8e202bf:
  ammo_count = 2

发射 action:
  if sys_0(0x90000,2,0) != 0:
      detach one backpack funnel
      spawn funnel / assist
      sys_4F(0x7,2,1)
```

优点：

- 和 Delta 原始特射一致。
- `0.c` 已经会检查 `sys_0(0x90000,2)`，不需要先改 common input。
- HUD ammo 也会跟着 slot 2 走。

缺点：

- 如果 `reload_per_shot_frame=360` 到点自动回弹，浮游炮可能“逻辑回来了”但画面上外部 projectile 还没结束。
- 它只能保证 ammo 层不能无限发，不能保证“同一个浮游炮实体一定回背包后才可用”。

### 方案 B：加脚本状态 flag 做实体锁定

适合目标：

```text
浮游炮只要还在外面，就不能再次发射同一个浮游炮。
必须等回收 / 超时 / 命中结束后才重新允许。
```

推荐状态：

```text
funnel0_out = 0/1
funnel1_out = 0/1
```

动作流程：

```text
发射前：
  if funnel0_out && funnel1_out:
      不发射，走失败反馈或空动作

发射第一个可用 funnel：
  sys_4B(0x3, funnelShellId)       // 从背包隐藏这一枚
  spawn projectile / assist
  sys_4F(0x7,2,1)                  // 扣 slot 2
  funnel_out = 1

回收 / 超时 / 命中结束：
  sys_4B(0x2, funnelShellId, modelHash, 0x4094b0f4)
  funnel_out = 0
```

如果暂时找不到 projectile 的真实“回收回调”，可以先用保守时间窗：

```text
发射后 N 帧内 funnel_out = 1
N 帧后重新 attach 到 backpack 并清 flag
```

但这只是近似。真正正确的是追 projectile / assist 生命周期回调。

## 建议的 Delta Kai 最小 patch 顺序

1. 不要再先修 `armsparam`：
   - `0x08248A8D/armsparam.bin` 已经有 `0xa8e202bf`。
   - `ammo_count=2`、`is_enabled=1` 已经成立。
2. 保持 `0.c` 不动：
   - 继续让 `sys_0(0x90000,2)` 当输入 gate。
3. 保持 Delta 原始扣槽方式：
   - 发射浮游炮时调用 `sys_4F(0x7,2,1)`。
4. 把背包浮游炮做成“可见 shell”，而不是 ammo 或 projectile：
   - 普通刷新 / 回收时 attach。
   - 发射时 detach 对应 shell id。
5. 先在 `ACTION_AC_SPECIAL_SHOT_DIRECTIONAL -> func_952` 做最小视觉同步：
   - 选一个可用 funnel shell id。
   - 发射前 `sys_4B(0x3, selectedFunnelShellId)`。
   - 保留原来的 `sys_51(...)` 和 `sys_4F(0x7,2,1)`。
   - 这样至少能做到“背包上少一枚 + slot 2 扣一发”。
6. 如果需要实体级锁定，新增两个 out flag：
   - 只靠 `connect funnel to backpack` 不够。
   - 只靠 `ammo_count=2` 也不一定能同步外部实体生命周期。
7. 真正要让“发出去的是 Delta Kai funnel”：
   - 需要继续找 `sys_51` type `2/4/5/6` 绑定的 resource 表。
   - 或者把对应 projectile depiction / bullet resource 改到 `delatkai_funnel`，但现在还没有足够证据直接改。

## 已落地的 `2.c` 脚本层 patch

本轮只改 `E:\XB\解包\com\file\0xBDBE6FEA\2.c`，不改 common `0.c`。

核心目标：

```text
按特射成功出援护 / 浮游炮，或者换锁特射分支扣 slot 2 那一帧：
  0. 如果两枚 cloned funnel shell 都已经 out，立刻把 slot 2 写成不可用并结束 action。
  1. 选第一枚还在背包上的 cloned Delta Kai funnel shell。
  2. sys_4B(0x3, shellId) 从背包隐藏这一枚。
  3. 保留原始 sys_51(...) / 特效 / 动作输出。
  4. 保留原始 sys_4F(0x7,2,1) 扣 slot 2 ammo。
  5. 启动 360 帧近似回收窗口。

loadout 刷新：
  如果某枚 funnel 标记为 out，不把它重新 attach 回背包。
  这样 func_887()/func_888() 重新刷 shell 时不会把已发射的 funnel 立刻挂回来。

360 帧后：
  清 out flag。
  如果当前不是变形形态，重新 attach 到 backpack。
  func_1040() 下一帧会重新按 native ammo / assist gate 恢复 slot 2 显示。
```

新增全局变量命名：

| 旧名 | 当前语义名 | 意义 |
|---|---|---|
| `global777` | `deltaKaiFunnelShell0IsOut` | 第一枚 cloned funnel 是否在外面，shell id `0x10B0AAAA` |
| `global778` | `deltaKaiFunnelShell1IsOut` | 第二枚 cloned funnel 是否在外面，shell id `0x11B0AAAA` |
| `global779` | `deltaKaiFunnelShell0ReturnTimer` | 第一枚 cloned funnel 的近似回收计时器 |
| `global780` | `deltaKaiFunnelShell1ReturnTimer` | 第二枚 cloned funnel 的近似回收计时器 |

反思：这些变量曾经用 `global777-780` 是不合格的 AI 命名。虽然能编译，
但它把“浮游炮出库状态 / 回收计时器”这层语义藏起来了，后续人类读 `2.c`
会更难。2026-06-19 已按上表改成语义名，并保持变量声明顺序不变。

修改点：

| 位置 | 修改 |
|---|---|
| `2.c:778-781` | 追加 `deltaKaiFunnelShell0IsOut`、`deltaKaiFunnelShell1IsOut`、`deltaKaiFunnelShell0ReturnTimer`、`deltaKaiFunnelShell1ReturnTimer`，声明顺序继承旧 `global777-780` 顺序。 |
| `2.c:25425-25431` | 在 `func_877()` 初始化 cloned funnel out flag / timer。 |
| `2.c:25441-25468` | 在每帧 callback `func_878()` 里递减 timer，到 0 后回挂 backpack。 |
| `2.c:25677-25743` | `func_896/897/898/899` 的 backpack funnel attach 改成受 out flag 控制。 |
| `func_952()` 顶部 | 两枚 funnel 都 out 时，写 slot 2 不可用并 `global252=1` 快速结束普通特射 segment。 |
| `func_952()` 发射帧 | 出 `sys_51` 前先隐藏一枚 funnel，并启动 `0x168` 帧 timer。 |
| `func_1025()` 顶部 | 两枚 funnel 都 out 时，先挡住锁定切换特射前段，避免它继续写 `sys_4F(0x16,2,0)`，并用 `global722=1` 跳过 startup 等待。 |
| `func_1026()` 顶部 | 两枚 funnel 都 out 时，写 slot 2 不可用并 `global252=1` 快速结束锁定切换特射中段。 |
| `func_1026()` 初始化帧 | 扣 slot 2 前也隐藏一枚 funnel，并启动同一套 timer。 |
| `func_1027()` 顶部 | 被拒绝的锁定切换特射进入末段时直接结束，避免播放无意义的 end effect。 |
| `2.c:29518-29529` | `func_1040()` 在两枚 cloned funnel 都 out 时强制 slot 2 不可用显示，避免 ammo 先回弹但 shell 还没回背。 |
| `2.c:29530-29545` | `func_1040()` 在普通形态且 funnel shell 还有库存时绕过 `d0001/d000b` native assist actor gate，只按 slot 2 ammo 维持 HUD 不红。 |

代码注释必须使用 AI block，规则见
[MSC AI 修改块注释规范](./msc-ai-edit-block-rule.md)。格式是：

```c
// AI decision (2026-06-19): short reason in English.
// Origin: AI-assisted MSC edit; source is Delta Kai slot-2 funnel shell sync research.
patched_code();
// End, origin is AI-assisted MSC edit; source is Delta Kai slot-2 funnel shell sync research.
```

原因是这部分属于推测型 mod patch，不是原始游戏脚本语义。以后如果实机验证发现真实回收回调或 `sys_51` resource 绑定，应优先替换这套 360 帧近似状态机。

已验证：

```text
python .\tools\msclang.py "E:\XB\解包\com\file\0xBDBE6FEA\2.c" -o "%TEMP%\2_delta_kai_funnel_patch_compile.mscsb"
```

结果：编译通过。验证没有使用 `--exvsMapping`。

重要边界：

- 这不是 projectile / assist 层的真回收。它只同步“背包上那两枚 visible shell”的显示和简单冷却窗口。
- `func_1040()` 的 shell gate 和 HUD bypass 只影响 slot 2 可用显示 / 脚本侧状态同步；它不能销毁已经生成的 assist / projectile，也不能补齐缺失的 native assist actor。
- `sys_51(0x20000,0,2,index,type)` 真正发出去的实体资源仍未完全证明。它可能仍然是原 Delta Plus 援护资源，而不是 `delatkai_funnel.numdlb`。
- `0x168` 即 360 帧，来自当前 `0xa8e202bf` 的 `reload_per_shot_frame=360`。如果实机表现太早或太晚，应优先改 timer 或继续找真实回收 callback。
- 当前已覆盖本文件里两个 `sys_4F(0x7,2,1)` 扣 slot 2 点：`func_952()` 和 `func_1026()`。
- 如果 action 已经进入，`2.c` 现在会在 `func_952()` / `func_1025()` / `func_1026()` / `func_1027()` 顶部快速结束，阻止后续生成 / 扣槽 / 完整空动作，并用 `func_1040()` 维持 slot 2 不可用显示。真正“按键层完全不进入动作”仍依赖 `0.c` 的 `sys_0(0x90000,2)` 是否读取到 `sys_4F(0x15/0x16)` 写出的状态；本轮按你的要求没有改 `0.c`。

## 真 funnel 参数对照：Sazabi vs Delta Kai

为了判断“发出去的实体是不是 Delta Kai funnel”，只看 `2.c` 不够。脚本只能证明：

```text
输入 gate -> action hash -> sys_51(...) -> sys_4F(0x7,2,1)
```

它不能单独证明 `sys_51` 最终实例化的 UnitTask / bullet 行已经换成
`delatkai_funnel.numdlb`。所以这里用 Sazabi 的真 funnel 参数做对照。

按最新工作范围，本节只保留已发现的 MSC 对照结论，不再继续展开
`bulletparam` graft 或真 projectile 数据移植。

### Delta Kai 当前参数包

当前 clone 使用：

```text
E:\XB\解包\com\file\0x08248A8D
```

其中 `armsparam.bin` 已经有 `0xa8e202bf`，所以 slot 2 有 2 发这个结论仍然成立。
kind-7 label 解码后，当前 6 个 arms entry 是：

| entry id | action label | ammo | reload_type | reload_per_shot | cooldown | bullet_type | shot_type |
|---:|---|---:|---:|---:|---:|---:|---:|
| `0x1486a84f` | `GUN_015GNDMUC_004DELTPL_001_BEAMRIFLE` | `4` | `1` | `0` | `0` | `0` | `1` |
| `0x10b251b4` | `GUN_015GNDMUC_004DELTPL_001_GRENADELAUNCHER` | `2` | `1` | `300` | `210` | `1` | `0` |
| `0xa8e202bf` | `GUN_015GNDMUC_004DELTPL_001_ASSIST` | `2` | `0` | `360` | `240` | `2` | `0` |
| `0x377d1397` | `GUN_015GNDMUC_004DELTPL_001_BEAM_GRENADE_WR` | `2` | `1` | `180` | `120` | `3` | `1` |
| `0xf100a0da` | `GUN_015GNDMUC_004DELTPL_001_MOVEATTACK_WR` | `1` | `0` | `360` | `240` | `4` | `0` |
| `0x1799c911` | `GUN_015GNDMUC_004DELTPL_001_BEAMMAGNUM_WR` | `1` | `0` | `600` | `420` | `5` | `0` |

这张表解释了为什么变形 / WR 流程里会重新绑定 slot：

```text
normal:
  sys_4F(0xb, 0, 0x1486a84f)  // BEAMRIFLE
  sys_4F(0xb, 1, 0x10b251b4)  // GRENADELAUNCHER
  sys_4F(0xb, 2, 0xa8e202bf)  // ASSIST

WR / MA-like special state:
  sys_4F(0xb, 0, 0x377d1397, 0x1486a84f, 0x4)  // BEAM_GRENADE_WR
  sys_4F(0xb, 1, 0xf100a0da)                    // MOVEATTACK_WR
  sys_4F(0xb, 2, 0x1799c911)                    // BEAMMAGNUM_WR
```

也就是说，`0xa8e202bf` 只在普通形态 slot 2 是 `ASSIST`；进入 WR/变形相关槽位表后，
slot 2 会被换成 `BEAMMAGNUM_WR`，这和“飞机模式动作模组、操作都改变”的观察一致。

但是 `bulletparam.frontend.json` 的 30 条 bullet 行呈现的是另一种形态：

| 字段 | 分布 |
|---|---|
| `moveType` | 全部 `255`，共 30 条 |
| `behaviorType` | 全部 `0`，共 30 条 |
| `hitEffectHash` | `1` x11、`3` x10、`60` x7、`100` x2 |

当前没有看到：

```text
hitEffectHash = 170020103
moveType = 0 / 1 / 2 的 funnel phase
behaviorType = 0xaa3934c0
bulletActionHash = 0x443b74ec
bulletResourceHash = 0x03c5d01e
```

这不代表 Delta Kai 绝对不能发 funnel，因为 `sys_51` 可能还有其他 native/resource
映射层。但它能证明一件事：当前参数包里没有一条像 Sazabi 那样明显的
“Radicon funnel bullet row”。

### Sazabi 真 funnel 对照

Sazabi 参数包：

```text
E:\XB\解包\com\file\0xB9859587
```

Sazabi 的 slot 表把 slot `1` 绑定到真 funnel arms entry：

```text
2.c:25401  sys_4F(0xb, 0x1, 0x44e2365f)
```

kind-7 label 解码后：

| entry id | action label | ammo | reload_type | reload_per_shot | cooldown | bullet_type | shot_type |
|---:|---|---:|---:|---:|---:|---:|---:|
| `0x44e2365f` | `GUN_017GYAKCH_002SAZABI_001_FUNNEL` | `3` | `0` | `300` | `210` | `1` | `1` |

Sazabi 的 funnel action 也会调用：

```text
sys_51(0x20000, 0, 0x2, ...)
```

但它后续使用的是：

```text
sys_4F(0xa, 0x1)
```

而不是 Delta 当前 assist action 的 `sys_4F(0x7,2,1)`。这进一步证明：

```text
sys_51 第三参 0x2 != HUD slot 2
```

slot 语义必须从 slot binding / ammo syscall 交叉判断。

Sazabi 的 action 层还显示了另一套真 funnel 状态面：

```text
func_911
  -> 读 sys_0(0x500000, 0/1/2) 三个 funnel 子机状态
  -> 选择第一枚空闲 funnel 的资源 hash
  -> sys_4F(0x7, 0x1, 0x1, 0x1)

func_947
  -> sys_51(0x20000,0,0x2,0x1,0/1)
  -> sys_51(0x20000,0,0x2,0,0/2)
  -> sys_4F(0xa, 0x1)
```

Delta 当前特射对照：

```text
func_952
  -> sys_51(0x20000,0,0x2,0,0x2/0x5)
  -> sys_51(0x20000,0,0x2,0x1,0x4/0x6)
  -> sys_4F(0x7, 0x2, 0x1)
```

所以 `sys_51(0x20000,0,0x2,...)` 只是共同 native family，不是“真 funnel”
的充分证据。MSC 层更应该继续追 `0x500000` 子机状态、slot `1` 的 `0xa`
ammo event、Delta 的 `d0001/d000b` gate，以及 `sys_51` native route。

`docs/unit-task-automata-sazabi-weapons.md` 已经把
`hitEffectHash=170020103` 映射到 `FunnelFly / FunnelSwarm`，并说明它走
Radicon 多阶段流程。当前 bulletparam 里能看到 16 条真 funnel 行：

| 字段 | Sazabi 真 funnel 共同值 / 分布 |
|---|---|
| `hitEffectHash` | `170020103` |
| `moveType` | `0` x4、`1` x8、`2` x4 |
| `behaviorType` | `2855563392` = `0xaa3934c0`，16 条一致 |
| `bulletResourceHash` | `63292318` = `0x03c5d01e`，16 条一致 |
| `bulletActionHash` | `1144656300` = `0x443b74ec`，16 条一致 |
| `initialSpeed` | `0`，16 条一致 |
| `lifetime` | 多数 `100`，一条 `80` |

Sazabi 还有一条 `hitEffectHash=170020102`、`moveType=4` 的
`ThrowHissatsuAxis`，这反而能说明 `170020103` 不是普通射击值，而是和 Sazabi
funnel UnitTask 家族绑定的一组特殊行。

本轮按这些特征重新扫参数包，结果是：

| 参数包 | 真 funnel / Radicon 特征行 |
|---|---:|
| `0xB9859587` Sazabi | `17` |
| `0x08248A8D` Delta Kai clone | `0` |

这里的 `17` 包括 16 条 `behaviorType=0xaa3934c0` 的核心 funnel 行，以及一条
`hitEffectHash=170020102 / moveType=4` 的相关特殊行。Delta Kai 当前参数包按
同一条件没有命中，说明它还没有可直接指认的 Radicon/funnel bulletparam 行族。

### 对当前 patch 的影响

当前 `2.c` patch 的定位应该写得更保守：

| 层 | 当前状态 |
|---|---|
| 背包 shell 层 | 已能把 `0x10B0AAAA` / `0x11B0AAAA` 挂到背包，并在发射时隐藏一枚。 |
| slot 2 ammo 层 | 已沿用原逻辑 `sys_4F(0x7,2,1)` 扣 1 发，`0xa8e202bf` 负责 2 发与回弹时间。kind-7 label 显示它是 `..._ASSIST`。 |
| 动作层拒绝 | 两枚 cloned funnel 都 out 时，`func_952()` / `func_1025()` / `func_1026()` / `func_1027()` 直接写 slot 2 不可用并结束 segment，避免完整空动作。 |
| 输入 gate 层 | 保持 `0.c` 不动；普通特射输入里仍有 `d0001/d000b` gate。当前 `2.c` patch 先解决 HUD 红槽，不保证普通 `0.c` 输入一定进入 action。 |
| clone 参数身份层 | 已把当前 `0x08248A8D` 的 `characterparam.bin / armsparam.bin` 内部 label 替换为 `CHR_026GNBELT_003DELATKAI_001`，并保留旧文件备份。 |
| `sys_51` 编号层 | type `2/4/5/6` 和 `0x10001/0xb` 表编号对齐，但 0xb 表当前更像 `sys_58` 表现事件 hash 表。 |
| 真实发射实体层 | 尚未证明 `sys_51` type `2/4/5/6` 会实例化 Delta Kai funnel；当前只在 MSC 注释中标记为后续工作，不继续追 `bulletparam`。 |

所以现在不能说“已经把援护实体改成浮游炮”。更准确的说法是：

```text
脚本层已经把 slot2 特射 ASSIST 和两枚背包 funnel shell 同步起来。
参数 label 层已经把 clone 内部身份从 Delta Plus 改成 Delta Kai。
真正的飞行实体仍走原 sys_51/native route；本阶段不改。
```

后续如果要做真 funnel，需要二选一继续推进：

| 方向 | 要证明 / 要改的内容 |
|---|---|
| 找 native 绑定 | 追 `sys_51(0x20000,0,2,index,type)` 的 type `2/4/5/6` 到哪个 assist / UnitTask / bullet resource。 |
| MSC 层验证 | 继续比较 Delta assist、RX assist、Sazabi funnel 的 `sys_51`、`sys_4F(0x7/0xa)`、`0xd0001/d000b`、`0x500000` 状态面。 |

注意：Sazabi 的 `bulletResourceHash=0x03c5d01e` 也没有简单等于本地
`projectile_depiction_table.bin` entry id。因此不能只靠 projectile depiction 表
判断完整链路；它最多证明“没有一条简单静态链”，不能证明 native 没有中间映射。

## 当前不要做

| 做法 | 问题 |
|---|---|
| 改 `0.c` 跳过 slot 2 ammo 检查 | 会掩盖资源绑定问题，动作可能空发。 |
| 只加 `sys_4B(0x2, funnel, model, backpack)` | 只能显示背包组件，不会控制发射、ammo、冷却、回收，也不会让 `sys_51` 的援护实体自动变成 funnel。 |
| 强行每帧 `sys_4F(0x15,2,1,0xa8e202bf)` | 可能让 HUD 看起来可用，但实际 `sys_0(0x90000,2)` 仍是 0。 |
| 只把 `ammo_count` 改大 | 会允许更多次发射，不解决“浮游炮已经在外面”的实体锁定。 |
| 直接复用 `global770/771/775` 当 funnel_out | 这些变量已经被变形、觉醒技、特殊换装流程使用，除非完整验证生命周期，否则容易互相踩。 |
| 继续深挖 / 硬拷 `bulletparam` | 当前范围要求先专注 MSC 层；真实武器射出只用 `Future work` 注释记录为后续工作。 |

## 后续需要继续查

1. `sys_51(0x20000,0,2,...)` 的 native handler 和 resource 参数含义。
2. `sys_0(0xd0001,0/1)` 和 `sys_0(0xd000b,0/1)` 的 native 语义。
3. `sys_51` type `2/4/5/6` 在 MSC / native 表现层里的绑定关系；真实实体资源先不展开。
4. `sys_4F(0x7,slot,...)` 和 `sys_4F(0xa,slot)` 的扣槽 / ammo event 差异；Delta assist 和 Sazabi funnel 已经不是同一条扣槽 syscall。
5. 浮游炮 projectile / assist 的结束、命中、回收 callback 在哪里。
6. 是否能用 existing slot 2 reload 规则同步回收，还是必须加脚本 flag。
7. `sys_1(0x10001,0xb,slot,hash)` 是否在 `sub_1406856A0` / `sys_51` native handler 中被读取；若没有，它就只是相邻表现事件表。
