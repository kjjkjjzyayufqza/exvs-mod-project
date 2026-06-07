# 使用 Scene Editor 移植可破坏大石头流程

本文说明如何把 `0xBAAFF3FD` 地图里的大石头破坏流程移植到另一个新地图。

目标效果：

```text
开场显示完整大石头
  -> 被攻击打爆
  -> 隐藏完整大石头
  -> 显示破坏后的残体
  -> 释放小石头碎块 PROP
```

这里先不处理爆炸 `EFFECT`，只处理大石头和小石头，优先保证资源引用不报错。

## 一、需要复制哪些资源

从源地图：

```text
E:\XB\解包\com\map\0xBAAFF3FD\0\0
```

复制这 3 个对象文件夹到目标地图的 `0\0` 根目录下，和目标地图已有 object 文件夹放在同一层：

```text
015stage015_object_rockmountain_before
015stage015_object_rockmountain_after
015stage015_object_rockmountain_break
```

含义：

| 文件夹 | 用途 |
|---|---|
| `rockmountain_before` | 开场可见、可被打爆的大石头 |
| `rockmountain_after` | 打爆后留下的残体 |
| `rockmountain_break` | 打爆后飞散的小石头碎块 |

每个文件夹都要完整复制，不要只复制模型文件。尤其不要漏掉：

```text
map_hit.hkt
0/*.numdlb
0/*.numshb
0/*.nusktb
0/*.numatb
0/*.jnttbl
```

`rockmountain_break` 的模型、骨架和 `map_hit.hkt` 很大，很多小石头的数据就在这个资源内部。

## 二、用 Scene Editor 确认 objectNumber

打开目标地图文件夹：

```text
Scene Editor -> Open Stage Folder
```

加载后，在对象列表或 placement 的 `VDK_OBJECTNUMBER` 下拉里确认这 3 个新对象的编号。

不要假设它们一定是源地图里的 `10/11/12`。到了新地图后编号一定要按新地图为准。

记下：

```text
afterObj  = rockmountain_after  的新 objectNumber
beforeObj = rockmountain_before 的新 objectNumber
breakObj  = rockmountain_break  的新 objectNumber
```

例子：

```text
afterObj  = 20
beforeObj = 21
breakObj  = 22
```

## 三、在 placement.csv 添加 3 行

在 Scene Editor 的底部 `Placement` CSV 编辑器里新增 3 行。

这 3 行建议按这个顺序添加：

```text
1. after 残体 OBJECT，开场不显示
2. before 大石头 OBJECT，开场显示，可被打爆
3. break 小石头 PROP，开场不显示
```

如果目标地图原来有 `M` 行 placement，那么这 3 行追加后：

```text
afterPlacementIndex  = M
beforePlacementIndex = M + 1
breakPlacementIndex  = M + 2
```

注意：`VDK_SUBSTITUTE_PLACEMENT` 用的是 placement 的 0-based 行索引，不是 objectNumber。

## 四、推荐的 3 行模板

把 `<x>`、`<y>`、`<z>`、`<ry>` 改成你想放的位置和朝向。

### 1. after 残体

```csv
VDK_TYPE,OBJECT,VDK_INITIAL_SPAWN,FALSE,VDK_POSITION_X,<x>,VDK_POSITION_Y,<y>,VDK_POSITION_Z,<z>,VDK_ROTATION_X,0.0,VDK_ROTATION_Y,<ry>,VDK_ROTATION_Z,0.0,VDK_PLACEMENT_NAME,,VDK_OBJECTNUMBER,<afterObj>,VDK_PROGRAMID,0,VDK_HITPOINT,UNBREAKABLE,VDK_SHADOW_CAST,TRUE,VDK_BREAK_SHOCKWAVE_RADIUS,0.0,VDK_BREAK_SHOCKWAVE_POWER,0.0
```

### 2. before 可破坏大石头

这行最重要。它被打爆后，会激活 after 和 break。

```csv
VDK_TYPE,OBJECT,VDK_INITIAL_SPAWN,TRUE,VDK_POSITION_X,<x>,VDK_POSITION_Y,<y>,VDK_POSITION_Z,<z>,VDK_ROTATION_X,0.0,VDK_ROTATION_Y,<ry>,VDK_ROTATION_Z,0.0,VDK_PLACEMENT_NAME,,VDK_OBJECTNUMBER,<beforeObj>,VDK_PROGRAMID,0,VDK_HITPOINT,MEDIUM,VDK_SHADOW_CAST,TRUE,VDK_BREAK_SHOCKWAVE_RADIUS,5000.0,VDK_BREAK_SHOCKWAVE_POWER,5000.0,VDK_SUBSTITUTE_PLACEMENT,<breakPlacementIndex>,VDK_SUBSTITUTE_PLACEMENT,<afterPlacementIndex>
```

字段含义：

| 字段 | 作用 |
|---|---|
| `VDK_HITPOINT,MEDIUM` | 让大石头可以被打爆 |
| `VDK_BREAK_SHOCKWAVE_RADIUS,5000.0` | 破坏冲击半径 |
| `VDK_BREAK_SHOCKWAVE_POWER,5000.0` | 破坏冲击力度 |
| `VDK_SUBSTITUTE_PLACEMENT,<breakPlacementIndex>` | 打爆后生成小石头碎块 |
| `VDK_SUBSTITUTE_PLACEMENT,<afterPlacementIndex>` | 打爆后显示残体 |

### 3. break 小石头 PROP

这是负责很多小石头飞散的行。

```csv
VDK_TYPE,PROP,VDK_INITIAL_SPAWN,FALSE,VDK_POSITION_X,<x>,VDK_POSITION_Y,<y>,VDK_POSITION_Z,<z>,VDK_ROTATION_X,0.0,VDK_ROTATION_Y,<ry>,VDK_ROTATION_Z,0.0,VDK_PLACEMENT_NAME,,VDK_OBJECTNUMBER,<breakObj>,VDK_SHADOW_CAST,TRUE,VDK_PROP_RELEASE_ATTACH,TRUE,VDK_PROP_IMPULSE_EFFECT_WEAK_ID,EFF_NULL,VDK_PROP_IMPULSE_EFFECT_STRONG_ID,EFF_NULL,VDK_PROP_IMPULSE_EFFECT_RESTRAINT_RATIO,0.0,VDK_PROP_IMPULSE_EFFECT_SCALE,1.0,VDK_PROP_IMPULSE_EFFECT_STRENGTH,1.0,VDK_PROP_DISAPPEAR_EFFECT_ID,EFF_NULL,VDK_PROP_LIFE_MAX,1800,VDK_BREAK_SHOCKWAVE_RADIUS,0.0,VDK_BREAK_SHOCKWAVE_POWER,0.0,VDK_SE_ID,__NULL__,VDK_SE_TIME_OFFSET,0
```

这里把 effect 和 SE 都设为空，避免目标地图缺少特效资源时报错。

关键字段：

| 字段 | 作用 |
|---|---|
| `VDK_TYPE,PROP` | 表示这是一个碎块/物理表现对象 |
| `VDK_INITIAL_SPAWN,FALSE` | 开场不显示，等大石头被打爆后再出现 |
| `VDK_PROP_RELEASE_ATTACH,TRUE` | 释放内部绑定的小石头碎块 |
| `VDK_PROP_LIFE_MAX,1800` | 小石头存在时间 |

## 五、具体例子

假设目标地图里：

```text
afterObj  = 20
beforeObj = 21
breakObj  = 22
```

并且你追加 3 行之前，目标 `placement.csv` 已经有 50 行。

那么：

```text
afterPlacementIndex = 50
beforePlacementIndex = 51
breakPlacementIndex = 52
```

`before` 大石头那行的结尾应该是：

```csv
VDK_SUBSTITUTE_PLACEMENT,52,VDK_SUBSTITUTE_PLACEMENT,50
```

意思是：

```text
大石头被打爆后：
  -> 激活第 52 行的小石头 PROP
  -> 激活第 50 行的残体 OBJECT
```

## 六、小石头生命周期怎么计算

小石头的生命周期主要看这个字段：

```text
VDK_PROP_LIFE_MAX,1800
```

从本地地图数据看，`PROP_LIFE_MAX` 常见值是：

| 值 | 按 60fps 推算 | 出现情况 |
|---:|---:|---|
| `90` | 1.5 秒 | 常见短生命周期碎块 |
| `120` | 2 秒 | 常见短生命周期碎块 |
| `360` | 6 秒 | 中等生命周期碎块 |
| `1800` | 30 秒 | 当前 rockmountain_break |

因此高置信推断：

```text
小石头存在秒数 = VDK_PROP_LIFE_MAX / 60
```

当前大石头碎块：

```text
1800 / 60 = 30 秒
```

生命周期应该从 `break` PROP 被激活时开始算，而不是从比赛开场开始算。因为这行是：

```text
VDK_INITIAL_SPAWN,FALSE
```

也就是说：

```text
开场：break PROP 不存在或不激活
大石头被打爆：break PROP 被 substitute 激活
激活后：开始计数 PROP_LIFE_MAX
计数到 1800 帧：小石头消失
```

如果你想让小石头更快消失，可以改：

```text
VDK_PROP_LIFE_MAX,120
```

大约 2 秒。

如果你想保持原效果，就保留：

```text
VDK_PROP_LIFE_MAX,1800
```

大约 30 秒。

## 七、哪里控制小石头数量

小石头数量不在 `placement.csv` 里控制。

`placement.csv` 只做一件事：

```text
大石头被打爆后，激活 rockmountain_break 这个 PROP
```

真正控制“小石头有多少个”的地方是这个资源内部：

```text
015stage015_object_rockmountain_break
```

特别是：

```text
015stage015_object_rockmountain_break__maya__.nusktb
015stage015_object_rockmountain_break__maya__.numshb
015stage015_object_rockmountain_break.numdlb
map_hit.hkt
```

我把这 3 个石头资源转成 JSON 后，统计结果是：

| 资源 | 骨骼数 | mesh object 数 | MODL 条目数 | 说明 |
|---|---:|---:|---:|---|
| `rockmountain_before` | 0 | 4 | 4 | 普通完整大石头 |
| `rockmountain_after` | 0 | 3 | 3 | 普通残体 |
| `rockmountain_break` | 239 | 454 | 454 | 碎块集合 |

`rockmountain_break` 里有大量这种骨骼名：

```text
object_rockmountain_break_all__C0
object_rockmountain_break_all__C1
object_rockmountain_break_all__C2
...
```

进一步统计：

| 项 | 数量 | 含义 |
|---|---:|---|
| `object_rockmountain_break_all` 下面的一级 `__C*` 骨骼 | 77 | 大的碎块组 |
| 带 `__C数字` 的碎块式骨骼 | 237 | 碎块层级骨骼 |
| 被 mesh 使用的唯一骨骼名 | 238 | 接近可见碎块节点数量 |
| mesh object / MODL entries | 454 | 材质拆分后的绘制子块，不等于真实石头个数 |

所以，如果你问“哪里有一个字段能改成 10 个、20 个小石头”，目前结论是：

```text
没有发现 placement 字段可以直接控制数量。
```

数量是美术资源内部已经做好的：

```text
碎块骨骼数量 + 碎块 mesh 数量 + HKT 物理数据
```

如果要减少或增加小石头数量，需要改 `rockmountain_break` 这个模型资源本身，而不是改 `before` 那行 placement。

### HKT 里的证据

我用项目里的 Havok 转换链路，把这个文件转成了 XML：

```text
015stage015_object_rockmountain_break/map_hit.hkt
```

结果说明它不是普通地图碰撞那种简单 HKT。

普通地图碰撞通常会有：

```text
hknpCompressedMeshShape
meshTree
```

但这个 break HKT 里：

```text
hknpCompressedMeshShape = 0
meshTree = 0
```

它真正包含的是 Havok 破坏数据：

| HKT XML 项 | 数量 | 含义 |
|---|---:|---|
| `hkndDestructionSystemData` | 有 | 破坏系统数据 |
| `hkndHierarchy` | 有 | 碎块层级 |
| `hkndFracturePiece` | 238 | 破裂后的物理碎块 |
| `hkndConnection` | 272 | 碎块之间的连接关系 |
| `IS_BREAKABLE` connection | 272 | 可断开的连接 |
| shape pointer | 239 | 碎块/整体物理形状引用 |

最关键的是：

```text
HKT fracturePieces = 238
SSBH 里被 mesh 使用的唯一碎块骨骼 = 238
```

这两个数能对上，所以高置信结论是：

```text
小石头数量不是 CSV 控制的。
小石头数量在 rockmountain_break 的模型/骨架/HKT 破坏层级里一起控制。
```

## 八、如果想自制一个会炸成很多块的新大物体

如果只是把现有石头移植到另一个地图：

```text
复制 before / after / break 三个文件夹
再设置 placement substitute
```

这样就够。

但如果你想从零做一个新的大物体，例如新的墙、新的楼、新的石头，然后它被打爆后变成一堆新碎块，那就不是只做一个普通模型那么简单。

你至少需要这几部分都能互相对应：

| 部分 | 用途 |
|---|---|
| `before` 模型 | 开场完整大物体 |
| `after` 模型 | 打爆后留下的残体 |
| `break` 模型 | 所有小碎块的可见模型 |
| `break` 骨架 `.nusktb` | 每个碎块对应的骨骼/节点 |
| `break` 的 `map_hit.hkt` | 每个碎块的物理形状、连接、破裂层级 |
| placement CSV | 只负责触发：before 被打爆后激活 break/after |

也就是说，自制完整流程大概是：

```text
做完整模型 before
做残体模型 after
把 break 模型切成很多碎块
给每个碎块做骨骼或节点
做一个匹配这些碎块的 hknd 破坏 HKT
最后用 placement 把它们串起来
```

目前 `src-tauri` 的 HKT 工具主要支持的是：

```text
普通碰撞 HKT
hknpCompressedMeshShape
meshTree
OBJ/DAE/FBX -> 碰撞 HKT
HKT -> XML -> OBJ 预览
```

它还没有完整支持生成这种：

```text
hkndDestructionSystemData
hkndHierarchy
hkndFracturePiece
hkndConnection
```

所以当前最现实的方案不是从零生成，而是：

| 方案 | 难度 | 说明 |
|---|---:|---|
| 直接复用原石头 break 资源 | 低 | 最稳，能快速移植 |
| 换材质/轻微改外观，但保留碎块骨架和 HKT | 中 | 尽量不破坏 238 个碎块关系 |
| 以现有 break HKT 为模板改 XML | 高 | 需要保持 fracturePieces、shape、connection 对应正确 |
| 从零自制新的破坏 HKT | 很高 | 需要实现或外部导出 Havok `hknd` 破坏数据 |

### 可以改什么

可以通过 placement 改这些：

| 能改 | 字段 |
|---|---|
| 是否开场显示 | `VDK_INITIAL_SPAWN` |
| 打爆后生成哪个碎块资源 | `VDK_SUBSTITUTE_PLACEMENT` 指向哪个 `PROP` 行 |
| 碎块存在多久 | `VDK_PROP_LIFE_MAX` |
| 是否释放碎块 | `VDK_PROP_RELEASE_ATTACH` |
| 破坏冲击力度 | `VDK_BREAK_SHOCKWAVE_POWER` |
| 破坏冲击半径 | `VDK_BREAK_SHOCKWAVE_RADIUS` |

不能通过 placement 直接改这些：

| 不能直接改 | 实际位置 |
|---|---|
| 小石头数量 | `rockmountain_break` 的 SSBH/HKT 资源内部 |
| 每个小石头形状 | `numshb` / `map_hit.hkt` |
| 每个小石头绑定节点 | `nusktb` |
| 每个小石头物理体积 | `map_hit.hkt` |

### 如果想变少

最稳的方法不是删 placement，而是做一个新的 break 资源：

```text
rockmountain_break_small
```

这个新资源内部只保留更少的碎块 mesh、骨骼和 HKT 数据。

然后在 placement 里把 `PROP` 行的 `VDK_OBJECTNUMBER` 指向这个新的 break 资源。

流程变成：

```text
before 大石头
  -> substitute 到新的 break_small PROP
  -> break_small 内部有多少碎块，就生成多少碎块
```

## 九、检查清单

保存前检查：

- `before / after / break` 三个对象文件夹都已经复制到目标地图。
- Scene Editor 里能看到这三个对象，并确认了它们的新 objectNumber。
- `before` 行是 `VDK_INITIAL_SPAWN,TRUE`。
- `after` 行是 `VDK_INITIAL_SPAWN,FALSE`。
- `break` 行是 `VDK_INITIAL_SPAWN,FALSE`。
- `before` 行的 `VDK_SUBSTITUTE_PLACEMENT` 指向目标地图里的 after 行和 break 行。
- 没有保留目标地图不存在的 effect 或 SE 名称。
- 保存后重新打开目标地图，确认 placement 行还在，objectNumber 没变错。

## 十、最常见错误

### 错误 1：把 `VDK_SUBSTITUTE_PLACEMENT` 当成 objectNumber

这是错的。

```text
VDK_OBJECTNUMBER = 对象文件夹编号
VDK_SUBSTITUTE_PLACEMENT = placement.csv 行索引
```

### 错误 2：只复制 before，不复制 break

这样大石头可能能被打爆，但不会生成小石头。

### 错误 3：复制了 break，但漏了 `map_hit.hkt`

小石头物理表现可能异常，甚至报错。

### 错误 4：保留了原地图的 effect 名称

例如：

```text
EFF_015STAGE015_SMOKE_001
EFF_015STAGE015_BREAK_001
SE_STG_01_BUILDING_EXPLOSION_001
```

如果目标地图没有这些资源，可能会报错。先用：

```text
EFF_NULL
__NULL__
```

等基础流程正常后，再单独处理 effect 和 SE。
