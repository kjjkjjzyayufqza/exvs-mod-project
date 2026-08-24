# TV Wing Zero 飞形态特格落地：要对到 Rebellion 的复制清单

**Date:** 2026-08-17  
**Status:** 2026-08-23 四方向已改为真实 motion-end 驱动，待实机复验。
**Kind:** 闭包 B 武装移植前置  
**Primary trees:**

```text
Source MSC     E:\XB\mod\040msc\028gunwtv_001gunwtv_001\
Source Motion  E:\XB\mod\003motion\001hito_028gunwtv_001gunwtv_001
Target MSC     E:\XB\mod\040msc\wing_gundam_zero_rebellion_msc\
Target Motion  E:\XB\mod\003motion\wing_gundam_zero_rebellion_motion
```

**Related:** 闭包 B 形态特格组见 [transform-port-plan §2.2](./2026-08-09-wing-zero-rebellion-transform-port-plan.md)。鸟 `0x200` 现状见 [bird-form-0c-input-map](./wing-zero-rebellion-bird-form-0c-input-map.md)。

---

## 一句话

TV 飞形态「特格落地」在 `0.c` 里是 **3 个 action hash**（左 / 右 / N），动作资源能清楚数出 **4 组要复制的 motion**。  
Rebellion 鸟形态 `0x200` 已接 TV N action hash `0xC0B814FF`。当前只有一组 target body+wing Folder：`trans_te_motion_stk_air_fr_out`，structure raw `unk1=1ee99211`，MSC Runtime `0x1192E91E`；N 落地、左右俯冲和收招仍未完成。

不是地面 4 向特格（`0xe35b996c` / `0xd55f840` / `0x2f5f1a92` / `0x22051a36`），也不是 Rebellion 现成的跳起特格 `15flight11a` / `35flight11a` / `maenobori11a`。

---

## 四个要复制的 motion 组

| # | 玩家向 | Runtime ID | LE `unk1` | 形态 | 类型 | 规范名核心 |
|---|--------|------------|-----------|------|------|------------|
| 1 | N 空中段 | `0x72394A81` | `814a3972` | 已拆鸟、普通身 | Folder ×5 | `40tkkneo2stk11a_stk_air_fr` |
| 2 | N 落地段 | `0x63327DCF` | `cf7d3263` | 已拆鸟、普通身 | Folder ×5 | `40tkkneo2stk11a_stk_gnd_fr` |
| 3 | 左俯冲 | `0xD25BE7EB` | `ebe75bd2` | 仍在鸟 `body_tf` | direct Item | `032gwtvTR_..._35tkkneo2kam_sht_air_lf` |
| 4 | 右俯冲 | `0xF5A3A97C` | `7ca9a3f5` | 仍在鸟 `body_tf` | direct Item | `032gwtvTR_..._35tkkneo2kam_sht_air_rt` |

TV `0.c` 鸟 `0x200` 没有单独的「后」hash：`0x4` 前进和松开都进 N。不要为了对齐地面四向去发明第四个 hash。

### 1 / 2：N 特格 Folder 五个通道

两套 Folder 子项一一对应，只是 `_air` / `_gnd`：

| 通道 `unk2` | 文件核心 |
|-------------|----------|
| body `4af2f09d` | `001hito_028gunwtv_001gunwtv_001_40tkkneo2stk11a_stk_{air,gnd}_fr` |
| wing `bd317fff` | `482gwtvwing_..._wing00_40tkkneo2stk11a_stk_{air,gnd}_fr` |
| rifle `a7b347e5` | `400stick_..._brifle00_t_40tkkneo2stk11a_stk_{air,gnd}_fr` |
| shield `d5af02ff` | `400stick_..._shiled00_40tkkneo2stk11a_stk_{air,gnd}_fr` |
| saber `2d273ac9` | `400stick_..._bsaber00_r_40tkkneo2stk11a_stk_{air,gnd}_fr` |

`func_308` 播 Folder 的 runtime ID（`0x72394A81` / `0x63327DCF`），不是单个 nuanmb。

### Rebellion 当前 N 空中单阶段（2026-08-22）

| 用途 | Target Folder | structure raw `unk1` | MSC Runtime | 通道 |
|------|---------------|----------------------|-------------|------|
| 鸟特格 N 空中 | `trans_te_motion_stk_air_fr_out` | `1ee99211` | `0x1192E91E` | body `9c5e24c7` + wing `c1a9c1f6` |

身体动作源自 `001hito_028gunwtv_001gunwtv_001_40tkkneo2stk11a_stk_air_fr`，翼使用 Rebellion 自制 `wing00` clip。当前 handler 在 motion 结束时直接退出；不会调用 TV N 落地 `0x63327DCF`。

实机确认：鸟形态特格可进入 `0xC0B814FF`，新 Folder `0x1192E91E` 的 body 与 wing 同步播放，motion 结束后安全退出。

### 3 / 4：左右是 `body_tf` 单 Item

和变形 enter/loop/exit 一类：`type=Item`、`unk2=00000000`、前缀 `032gwtvTR`。  
只在鸟形态（已加载 source `body_tf`）下能直接播。

---

## 附属（要一起带，但不算「四个」）

| 用途 | Runtime ID | 说明 |
|------|------------|------|
| 左右收招 | `0xFBC136EF` (`ef36c1fb`) | Folder ×2：`kamae_stk_air_fr` + `bsaber00_r_kamae_stk_air_fr`。左右俯冲结束 `func_1077` 拆鸟后再播 |
| 左右刀光 | `sys_4A(0, 0x3728d323, 0xa341f1ef, …)` | 挂在鸟 root `0xA341F1EF` |
| SE | `sys_58(0x9, 0x78f8e1f0)` / `sys_58(0, 0xaca6604a)` / `sys_58(0x6, 0x7578e138)` / 结束 `0x9c1b440d` | 未在 target effect 包按 hash 命中；落地前再对 TV effect / nus3bank |

### 2026-08-23：完整播放必须沿用 `e9239b5` 的 `func_91()` 结束语义

实机症状：左右首段播不到一秒便恢复普通形态并自由落体；仅把自然收招与强制中断 helper 分离后，用户确认症状不变，因此“提前关闭飞行移动是主因”的假设已作废。

- 已实机正常的提交 `e9239b5` 把所有方向输入都送入 `0xC0B814FF`，播放75帧的 `0x1192E91E`，只在 `func_91()`确认当前 motion 结束后退出。
- 当前前后 A 同为75帧，但 TV ALT_7 固定在第18帧切段；地面 B 为79帧却从第3帧起播。
- 当前左右 Body 为37帧，本来完整时长约0.62秒；TV ALT_5 又在末尾前3帧切换并用130%速率，实际约0.44秒。左右 Wing 只有19帧，是独立的资源同步问题，不负责 action 退出。
- Target 四方向现已沿用 `e9239b5` 的真实结束语义：A 与左右首段均由 `func_91()`转段，B/左右收招从第0帧播放，左右取消130%加速；前后在 A 完整结束后等待接地再进入 B。
- `rebellion_bird_special_melee_natural_exit()`仍只负责自然收招；它不再被视为本次固定帧截断的主修复。
- `func_41`、`func_882` 与动作替换中断仍使用原强制 helper；不能为了自然收招而削弱受击恢复。

后续代码审计又发现两个 owner/参数陷阱：

- 左右曾把 Runtime ID 存入语义局部 `motion_runtime` 后传给 Hash 类型的 `func_308` 参数；legacy lowering 产生了无关常量，而不是任一方向 ID。现改为在左右分支中直接调用 `func_308(..., 0x728EFF43/0x99ED237A, ...)`。
- `func_91()`默认检查 `sys_4B(0x1)`，但动作实际播放 owner 是 `global20`；普通挂件重建可能改变当前活动 entry。四段完成条件现直接检查 `sys_47(0x7, global20)`，前后拆鸟后也先刷新 `global20`。
- 用户随后把四组 Wing 从共同的19帧版本延长；当前 Wing 仍比对应 Body 少一个末帧索引（36/74/78/36 对 37/75/79/37），但已不再是共同19帧终止点。
- 左右自然收招结束现在显式 `func_169(0x1000000)`，与前后 EXIT 对称；不能先清动作 ownership 再把该飞行位留给下一动作。
- 双字段与逐帧活动复核表明八个 NUANMB 的 `unk1`时长、`unk2`末帧和实际轨道都持续变化至末帧；“后半段静止”已排除。
- 为隔离 normal-form teardown，三个飞行特格 hash临时统一到 `ACTION_BC_SPECIAL_MELEE_BIRD_MOTION_PROBE`：保持 bird form，播放已知特射 motion `0xC827A30C`，只在该 motion结束后恢复普通形态。该 probe仅供实机判定动作框架与新增 Folder哪一层提前终止。
- 首版 probe保持 bird form时 `0xC827A30C`完全不播放并立即退出，说明 normal-form motion不能在 bird owner上直接启动。probe现改为两步 handoff：第1 tick只恢复普通形态，第2 tick刷新 `global20`后播放，且第3阶段才允许读取结束状态，避免同 tick的模型提交或旧 motion-end标志覆盖新动作。
- 两步 handoff首版在第1 tick发布 `global143=0`后仍于 phase 1前被选择器替换。probe再次收窄：第1 tick只恢复普通视觉资源与 `global20`，保持逻辑 form `global143=2`；第2 tick播放，motion结束后才执行真正的 form 0恢复。该结果用于证明 action persistence与visual/model owner必须分开。
- 保持 form的视觉恢复 probe仍完全不播放。最终隔离版不再复用任何 custom callback：`0x8D96C52F/0x279F0DA4/0xC0B814FF`直接注册到完整 `ACTION_AC_SPECIAL_SHOT`，并从 bird allowlist移除，使其与原特射 `0x8D3A4411`编译为同一 handler。该版本只检验 `0.c`提交类别与 form/action切换边界。
- 完整 action别名还要求 selector签名一致：正常特射使用 `func_95(...,1,0x400001,0x8)`，而鸟特格原来仍是 `(1,4,9)`。隔离版已把三个 `0.c`提交同步为特射类别；否则即使 `2.c` handler相同，native取消/持续属性仍不同。
- 用户确认“完整特射handler + 特射selector”能执行整套特射，但会原地制动并切普通形态；由于两层同时变化，不能把成功单独归因于selector。
- 恢复custom `func_488/func_502`后，用户确认仍只播放1帧，说明selector与custom框架是两个独立问题。新probe改用 `func_586/func_593`，设置`global681=5`绕过弹药检查，只播放各方向真实首段motion；完整A→B与左右收招暂不加入，避免混淆框架验证。
- 当前probe恢复TV特格selector `(1,4,9)`并把三个hash加入bird allowlist，以保留飞行惯性；`func_593`首段结束后才执行normal restore。特射selector `(1,0x400001,0x8)`仅为隔离工具，不是最终玩法。
- 首次惯性probe仍立即进入normal EXIT；当前版本在保持`global143=2`与飞行移动的同时先恢复normal视觉owner，再播放target Folder，并禁止第1帧前读取motion-end。该版本隔离“逻辑form持有”与“normal动画资源owner”。

### TV源码复核后的最终实现（2026-08-23）

此前所有特射/`func_593` probe均已删除。最终实现重新对齐TV：`0.c`保持`(1,4,9)`；`2.c func_41`允许三个特格hash保持bird；ALT_7首段入口与ALT_5侧向motion结束处调用target自然adapter。该adapter对应TV`func_1077`，会发布normal form、normal speed、重建normal视觉与刷新`global20`，但不清`0x4000`、不关闭`func_296`。真正受击/取消仍调用FORCED_RECOVERY并立即清移动。

随后按用户要求切换到最小e9239b5回归基线：三个hash全部进入同一个单阶段`0x1192E91E` handler，旧A→B/ALT_5函数保留但不可达。该基线优先确认历史实机行为，不代表最终方向设计。

当前基线只增加一项：恢复`global608/609/610`三段callback，使所有方向统一执行`0x1192E91E → 接地等待 → 0x33B742CD`；不恢复左右分流。

Target特化：接地检测不再只存在于wait callback。A callback每帧同时检查`!func_287(0x3ED)`与motion end；若A期间接地，立即清airborne bit并转向B，避免等A完整播完。

该谓词实机仍不触发，因为`func_287(0x3ED)`只是`0x30000`空中state。当前改用TV/Target其它落地动作已有的`0x80002 contact OR 0x30000 != airborne`组合，A与wait共用。

`0x80002`方案实机在空中误判，已撤销。当前A按TV frame18 (`0x708`)结束，随后wait关闭飞行移动并等待native非空中；特意删除TV frame24 (`0x960`)超时，保证Target不会在空中走fallback结束。

在该落地基线获用户认可后，按单变量顺序仅恢复左`0x8D96C52F → ACTION_BC_SPECIAL_MELEE_BIRD_SIDE_TV`；左加入bird allowlist并播放`0x99ED237A → 0x301D3299`。右与N仍走A→wait→B，待左实机通过后再恢复右。

左首次实机只播1帧。TV侧向资源是bird `body_tf` direct Item，Target `0x99ED237A`是normal Body/Wing Folder；因此Target不能在bird owner上照搬TV。natural adapter已移到侧向首段开始前，先刷新normal `global20`且不做FORCED_RECOVERY，再播放左motion；首段结束直接接收招。

natural adapter前移后实机仍为1帧。当前ALT_5再次不可达：左hash与右/N全部注册到稳定landing handler，仅在A callback中按`global6==0x8D96C52F`选择`0x99ED237A`，否则`0x1192E91E`。这是一项纯Runtime替换实验。

纯Runtime实验确认左Folder可正常播放；问题转为左仍被送入落地wait。当前左在稳定first-phase action入口中使用专用callback表：`0x99ED237A`完整结束后直接播放`0x301D3299`收招，再结束action；不再读取ground。右/N落地链不变。

左旋转/收招随后实机可用但无横向位移。现保留稳定first-phase入口，只把ACTIVE callback替换为完整TV `func_1058` target适配：恢复`global390=4`、`0x1F40`侧向目标、`sys_46`位移/追踪、VFX/SE、130%窗口、end-3混出和frame5收招。右/N不变。

最终用户决定延期左右独立行为。当前三个hash全部注册到`ACTION_BC_SPECIAL_MELEE_BIRD_LANDING`，固定执行`0x1192E91E → frame18 → wait ground → 0x33B742CD`；ALT_5/左右Runtime/收招函数保留但不可达。未来恢复步骤见`docs/agent-sessions/2026-08-23-wing-zero-flight-special-melee-debug.md` §8。

**不要原样抄 TV `func_1077`。** Rebellion 自然收招走 target-specific natural-exit adapter；受击/倒地才走 `rebellion_interrupt_bird_form_to_ground()`。

---

## MSC：3 hash + 2 handler

| 输入 | TV hash | `2.c` | 播什么 |
|------|---------|-------|--------|
| 鸟特格 + 左 `0x10` | `0x8D96C52F` | `ACTION_BC_SPECIAL_MELEE_ALT_5` | `0xD25BE7EB` → 拆鸟 → `0xFBC136EF` |
| 鸟特格 + 右 `0x20` | `0x279F0DA4` | 同上，`global781` 分流 | `0xF5A3A97C` → 拆鸟 → `0xFBC136EF` |
| 鸟特格 其它（N / 前 / 后） | `0xC0B814FF` | `ACTION_BC_SPECIAL_MELEE_ALT_7` | 先拆鸟 → `0x72394A81` → `0x63327DCF` |

Rebellion 当前：

```c
// 鸟分支 0x200
func_95(0xc0b814ff, ...);   // TV N special-melee action hash
```

`2.c` 已只注册 `0xC0B814FF → ACTION_BC_SPECIAL_MELEE_BIRD_N`。左右 `0x8D96C52F` / `0x279F0DA4` 尚未注册；地面特格 `0xC805DC33` / `0x66EB879F` 不动。

接线顺序（授权后再做）：

1. 已完成：N 空中 body+wing Folder `0x1192E91E`。
2. 已完成：`0xC0B814FF` 单阶段 target handler，拆鸟使用 Rebellion 幂等 restore。
3. 待做：N 落地、左右、收招资源完成后，再扩成 TV 完整两 handler/三 hash。官方解除仍留给 slot `0x19` / `0xA02D57DC`。

---

## 骨架约束（复制文件时）

已冻结：source `body_tf` 78 骨 vs Rebellion 普通身 52 骨；source `wing00` 21 骨 vs Rebellion wing 44 骨。禁止把 source wing 重定向到 Rebellion wing。

| 组 | 能不能原样播 |
|----|--------------|
| 3 / 4 `35tkkneo2kam` | 可以。鸟形态已经用 source `body_tf` |
| 1 / 2 `40tkkneo2stk11a` | **不能**把 TV `001hito_028gunwtv` / `482gwtvwing` 当 Rebellion 普通身+翼来播。要嘛重定向到 `001hito_016gundmw` + `410wzerowing`（翼骨仍不兼容），要嘛自制落地 NUANMB，只保留 TV Folder ID 和通道顺序 |
| 附属 `kamae_stk_air_fr` | 同样是普通身 Folder，和 1 / 2 同一问题 |

左右俯冲可以先用官方 `body_tf` Item 验证手感；N 落地是真正的「落地动作」，卡在普通身骨架。

---

## 明确不要复制

- 地面四向特格 hash / `0xEACA01A1`。
- `body_tf_40tkk11a`（`0x92856398`）：地面特格进鸟用的，不是飞形态落地。
- 整份 TV `0.c`、共通 `func_450..466`。
- Rebellion 现有跳起特格 Folder（`15flight11a` / `35flight11a` / `maenobori11a`）不要覆盖。
- 独立 `wep_wing00` 模型。Bird 翼在 `body_tf` 里。
