# 百式 Motion Folder / Single Item 结构研究

日期：2026-07-05

## 目标

解释百式 motion 资源里为什么有些动作是 `0\0` 下的单个 `.nuanmb`，有些动作则是
`0\0\<n>\` 文件夹。重点样本：

```text
E:\XB\解包\com\file\003motion\001hito_002zgundm_002hyaksk_001_e316088b\0\0\3
```

## 证据来源

- Motion root:
  `E:\XB\解包\com\file\003motion\001hito_002zgundm_002hyaksk_001_e316088b`
- Structure JSON:
  `E:\XB\解包\com\file\003motion\001hito_002zgundm_002hyaksk_001_e316088b_structure.json`
- 对照文档：
  - `docs/example/stage_example.md`
  - `docs/msc-research/units/2002001-hyaku-shiki/README.md`
  - `docs/superpowers/specs/2026-06-27-gyan-hyaku-shiki-flight-porting-notes.md`

本次只读取已解包文件和 structure JSON，没有修改资源。

## 总体形态

百式 motion pack 的 `SubFileParseStructure` 顶层是：

```text
Root
└─ 0
   ├─ 0
   ├─ 1  empty
   └─ 2  empty
```

关键内容集中在 `Root/0/0`：

| 项 | 数量 |
|---|---:|
| `SubFileData` | 306 |
| `Root/0/0` 直接 Item | 236 |
| `Root/0/0` 子 Folder | 31 |
| 子 Folder 内 Item 总数 | 70 |
| Item reference 总数 | 306 |

因此这里不是“文件夹里藏了额外 archive”，而是 `SubFileStructure` 把 306 个
`.nuanmb` item 分成两类表达：

1. 直接 Item：一个 motion key 只指向一个 clip。
2. 子 Folder：一个 motion key 指向多个子 clip。

## 单文件动作的形态

单文件动作直接挂在 `Root/0/0` 下。其结构特征是：

```text
Root/0/0
└─ Item(fileIndex=N, unk1=<motion key LE>, unk2=00000000)
```

样本：

| fileIndex | item `unk1` | item `unk2` | fileBaseName |
|---:|---|---|---|
| 2 | `9d280f00` | `00000000` | `001hito_002zgundm_002hyaksk_001_runloop_sht_gnd_fr` |
| 5 | `4d2dc005` | `00000000` | `001hito_002zgundm_002hyaksk_001_35kaky11a_sht_air_fr` |
| 21 | `2c52030a` | `00000000` | `001hito_002zgundm_002hyaksk_001_jumpbsttop_sht_gnd_fr` |

直接 Item 的 motion key 放在 item 自己的 `unk1`。`unk2` 在本 pack 的 236 个直接
Item 中全部是 `00000000`。

## 文件夹动作的形态

文件夹动作挂在 `Root/0/0/<n>`。其结构特征是：

```text
Root/0/0/<n>
  Folder(unk1=<motion key LE>, unk3=<group kind>)
  ├─ Item(fileIndex=A, unk1=00000000, unk2=<clip channel>)
  └─ Item(fileIndex=B, unk1=00000000, unk2=<clip channel>)
```

也就是说，文件夹动作的 motion key 不在子 `.nuanmb` item 上，而是在父 Folder 的
`unk1` 上。子 item 的 `unk2` 才区分这个 bundle 内的 clip channel。

## 样本：`Root/0/0/3`

`0\0\3` 是百式 Dodai entry motion：

| Field | Value |
|---|---|
| Folder path | `Root/0/0/3` |
| Folder `unk1` | `f07b6526` |
| Motion hash | `0x26657BF0` |
| Folder `unk3` | `2` |
| Children | 2 |

子 clip：

| fileIndex | item `unk1` | item `unk2` | fileBaseName |
|---:|---|---|---|
| 88 | `00000000` | `35b9ecdd` | `001hito_002zgundm_002hyaksk_001_kamaesht2ddy_sht_gnd_fr` |
| 29 | `00000000` | `5549d87a` | `400stick_002zgundm_002hyaksk_001_dodai00_kamaesht2ddy_sht_gnd_fr` |

结论：这个 folder 是一个同步 motion bundle。`0x26657BF0` 不是只播放
`001hito` 的 rider 动作，也同时携带 `400stick ... dodai00` 的载具动作。

### `Root/0/0/3` 两个 `.nuanmb` 的实际控制内容

使用 `tools/ssbh_data_json.exe` 解析两个 clip 后确认：它们都是 NUANMB v1.2，
`final_frame_index=44.0`，也就是 45 个采样帧的进入过渡动作。

`001hito_002zgundm_002hyaksk_001_kamaesht2ddy_sht_gnd_fr.nuanmb` 控制百式本体：

- 只有 `Transform` group。
- 控制 24 个 humanoid skeleton node，包括 `BASE`、`CENTER_RT`、`GBL_RT`、
  `KOSHI`、`MUNE1/2`、`KATA_*`、`UDE_*`、`TE_*`、`MOMO_*`、`HIZA_*`、
  `ASHI_*`、`TSUMASAKI_*`、`KUBI`、`ATAMA`。
- 主要内容是把百式从普通射击/构え姿势转到 Dodai riding pose。`BASE` 有一次
  过渡位移：frame 0 为 `(0.000, 1.730, 0.012)`，中途最高到约
  `(0.044, 7.592, 0.496)`，frame 44 回到 `(0.300, 1.800, 0.000)`。
- 其他人体骨骼主要是 rotation 变化，例如腰、腿、膝、脚、手臂会调整到骑乘姿态。

`400stick_002zgundm_002hyaksk_001_dodai00_kamaesht2ddy_sht_gnd_fr.nuanmb`
控制 Dodai 载具：

- 只有 `Transform` group。
- 只有两个 node：`GBL_RT` 和 `STICK`。
- `GBL_RT` 全程 identity。
- `STICK` 只有 translation 变化，没有 rotation / scale 变化。它从 frame 0 的
  `(-38.369, 0.000, 4.000)` 沿 local X 移到 frame 44 的
  `(0.000, 0.000, 4.000)`，中途约 frame 35 已到原点附近。

因此 `0\0\3` 的职责不是持续飞行移动，而是：

1. 本体 clip：让百式跳起/抬升并摆成骑乘姿态。
2. Dodai clip：让 Dodai 从偏移位置滑入本体下方并对齐。

实际的 shell/model 生成、是否存在 Dodai actor、进入 loop 后如何持续移动，都不在这
两个 `.nuanmb` 里决定；它们只负责已经被 runtime 选中的 participant model 的局部
骨骼/节点动画。

## 三段 Dodai 飞行动作

三段飞行动作都是同一类 folder bundle：

| 阶段 | Path | Folder `unk1` LE | Motion hash | 子 clip |
|---|---|---|---|---|
| Entry transition | `Root/0/0/3` | `f07b6526` | `0x26657BF0` | `001hito ... kamaesht2ddy` + `400stick ... dodai00_kamaesht2ddy` |
| Flight loop | `Root/0/0/16` | `6a653f7e` | `0x7E3F656A` | `001hito ... kamae_ddy` + `400stick ... dodai00_kamae_ddy` |
| Exit transition | `Root/0/0/25` | `276298db` | `0xDB986227` | `001hito ... kamaeddy2sht` + `400stick ... dodai00_kamaeddy2sht` |

这些正好对应百式 MSC motion slots：

| MSC slot | Motion hash | Meaning |
|---:|---|---|
| `0x37` | `0x26657BF0` | entry motion |
| `0x38` | `0x7E3F656A` | sustained flying motion |
| `0x3B` | `0xDB986227` | release / dismount motion |

## 子 item `unk2` 的含义

从 31 个 folder 的所有子 item 统计，`unk2` 与 clip 所属对象高度相关：

| item `unk2` | Count | Observed clip family |
|---|---:|---|
| `35b9ecdd` | 28 | 百式本体 `001hito_002zgundm_002hyaksk_001_*` |
| `5549d87a` | 14 | 百式 Dodai `400stick_002zgundm_002hyaksk_001_dodai00_*` |
| `bb16599f` | 10 | 百式 beam saber `400stick_002zgundm_002hyaksk_001_bsaber00_*` |
| `ddc39c44` | 2 | 百式 beam rifle `400stick_002zgundm_002hyaksk_001_brifle00_*` |
| `2a562d80` | 4 | 百式 hyper mega launcher `400stick_002zgundm_002hyaksk_001_hmlauncher00_*` |
| `b45fe58a` | 1 | 百式 backpack `400stick_002zgundm_002hyaksk_001_bpack00_*` |
| `f2b09016` | 2 | Susanoo assist `001hito_014gndm00_003susano_001_*` |
| `81cb7506` | 2 | Susanoo left saber `400stick_014gndm00_003susano_001_saberl00_*` |
| `fb45cd10` | 2 | Susanoo right saber `400stick_014gndm00_003susano_001_saberr00_*` |
| `00000000` | 5 | Folder `17` aiming-main direction variants |

强人 `.shl` 与 motion structure 的对照确认：`item.unk2` 不是 shell row index，
而是参与这个 motion bundle 的 model id/hash 的小端字节显示。例子：

| Motion `item.unk2` | Shell `model_id` as u32 | Meaning |
|---|---|---|
| `38aa0720` | `0x2007AA38` | 强人本体 actor |
| `584d10c0` | `0xC0104D58` | 强人 `bsaber00` weapon actor |
| `ec7a082e` | `0x2E087AEC` | 强人另一个 shell model actor |

因此百式 Dodai 的 `item.unk2=5549d87a` 应按小端解释为
`model_id=0x7AD84955`，正好对应 Dodai 模型 id。百式本体
`35b9ecdd` 则应解释为 `model_id=0xDDECB935`。

当前最稳妥的命名是：`item.unk2` 是 bundle 内的 motion participant model id/hash
（JSON 中按原始小端字节显示）。它告诉 runtime 这条 `.nuanmb` 应该应用到哪个
actor、武器、载具或 assist 对象。对本机体对象，它通常能在当前机体 `.shl` 的
`model_id` 字段中找到；对 assist / 外部对象，它可能对应外部资源的 model id，
不一定存在于当前机体 `.shl`。

## 不是所有 folder 都是载具动作

`Root/0/0/17` 是反例：

| Field | Value |
|---|---|
| Folder `unk1` | `d42a7c83` |
| Folder `unk3` | `1` |
| Folder `link` | `true` |
| Children | 5 |
| Clips | `aimingmain_sht_gnd_fr/lf/rt/up/lw` |

这个 folder 只有 `001hito`，没有 `400stick`。它更像一个 directional variant group：
同一个 motion key 下有 5 个方向版本，由 runtime 选择其中一个。

所以 folder 的本质不是“有载具才用 folder”，而是：

```text
一个 motion key 需要多个子 clip 时，用 Folder。
一个 motion key 只需要一个 clip 时，用直接 Item。
```

多子 clip 可以是：

- 本体 + 武器/载具/assist 的同步动作。
- 同一 actor 的方向/状态变体集合。

## 对强人移植的含义

1. 如果只复制 `001hito` 三个 rider `.nuanmb`，只能得到百式本体的骑乘姿势。
   Dodai / 载具自己的 `400stick` 同步动作没有被复制。

2. 如果要完整保留百式三段 Dodai motion 语义，目标 motion pack 应该保留 folder
   bundle 形态：

   ```text
   Folder(unk1=<motion hash LE>)
   ├─ target rider clip
   └─ target mount clip
   ```

3. 如果强人暂时没有坐骑模型，只有 movement / rider pose，那么可以只引入 rider
   clip，但这属于降级移植。它不等价于百式原始 folder bundle。

4. 不应盲目把百式 `item.unk2=5549d87a` 当作强人自定义坐骑的固定值。它按小端
   对应 `model_id=0x7AD84955`，是百式 Dodai 的 model id。强人新坐骑需要使用目标
   坐骑自己的 model id/hash；没有证据时，优先保留 rider 单 clip 或做显式实验，
   而不是复制百式 Dodai id。

5. Motion Editor 的编辑模型需要能表达“新增 folder bundle + 子 item metadata”，否则
   只能方便地添加单 `.nuanmb`，无法无损移植这类多 actor motion。

## 当前结论

- 百式 motion pack 的“文件夹 vs 单文件”不是随意目录整理。
- 单文件：motion key 存在 item `unk1`，`unk2=0`。
- 文件夹：motion key 存在 folder `unk1`，子 item `unk2` 用小端 model id/hash
  区分 bundle 内的 motion participant。
- `0\0\3`、`0\0\16`、`0\0\25` 三段 Dodai 飞行动作都是 folder bundle，原始语义是
  rider + Dodai 同步 motion。
- 强人当前如果只拿三条 `001hito` rider motion，就应该在记录里标成“rider-only
  fallback”，不要误认为已经完整复制百式 Dodai motion bundle。

## 仍需确认

- 是否所有 assist / 外部对象的 `item.unk2` 都能在对应外部对象的 `.shl` 或 model
  resource table 中稳定找到。
- `Folder.unk3=1/link=true` 与 directional variant 选择逻辑的精确定义。
- runtime 播放 folder bundle 时，是同时播放所有 child clip，还是按 channel 可用性 /
  active object 状态过滤。
