# 弹体类（Projectile UnitTask Class）全目录与机制报告（OB v27）

> 对象：`vsac27_Release.exe`（OB v27），基址 `0x140000000`。
> 证据等级：**E2** = 在 exe 里直接读到（反编译 / 反汇编 / 模拟执行）；**E3** = 只从调用上下文推断，未单独验证。
> 本目录只含元数据（类名、地址、hash、计数），不含代码字节或反编译清单。

---

## 0. 这份资料怎么用

| 文件 | 内容 | 什么时候看 |
|---|---|---|
| `README.md`（本文） | 机制说明、槽位语义、原型总览、modding 指南 | 先读这个 |
| `projectile-classes.json` | **1426 个类**逐条记录：类 ID、vtable、工厂、对象大小、继承链、自有槽位（带语义名）、UnitTask 读的列、Manager 与其 step 列表和读的列、能力标记 | 查某个类 / 某个 class id |
| `projectile-classes.csv` | 上面的扁平版，一行一个类 ID，可直接用表格软件筛选 | 批量筛选 |
| `projectile-archetypes.json` | 206 个中间基类（原型）：子类数、自有函数数、引入的槽位、读的列 | 研究某一类武装的共同行为 |
| `projectile-class-tree.md` | 继承树（只含有子类的节点） | 看全局结构 |
| `automata-vtable-slots.json` | Automata 系列 108 个虚槽：语义名、证据、基类实现、实现数、被重写数 | 查槽位 |

重新生成（只读 exe，不改任何东西）：

```bash
python tools/extract_projectile_class_catalog.py <path>/vsac27_Release.exe docs/projectile-class-research
```

依赖 `capstone`、`unicorn`；约 10 秒。

**查一个 bulletparam 行到底是什么类：**

```bash
# 150080102 是 FAUC 的常驻浮游盾
grep '"class_ids":\[150080102\]' docs/projectile-class-research/projectile-classes.json
# 或在 CSV 里按第一列筛选
grep '^150080102,' docs/projectile-class-research/projectile-classes.csv
```

---

## 1. 核心结论

1. **bulletparam 列 `0x0D6A5CD5` 是类 ID**，它决定这一行用哪个 C++ 类。类决定行为，行里其余列只是这个类读的参数。同一列在不同类里意义可能完全不同（见 §7）。 **E2**
2. OB 里共有 **1426 个弹体类**，其中 **1407 个有类 ID**；剩下 19 个是抽象基类。 **E2**
3. 分两大家族：
   - **ActorProj 通用子弹**：28 个类，类 ID 只有 1–81（普通光束、火箭弹、散弹、激光、爆风……）。
   - **Automata 机体专用弹体**：1396 个类，全部挂在 `Radicon → RadiconParentActor` 下，再分成 Funnel、Throw、Summon 等原型。 **E2**
4. 机体专用类的 ID 编码是 `系列×10^7 + 机体×10^4 + 变体×100 + 序号`。例如 `150080102` = 015 系列、008 号机、变体 01、第 02 个类。1407 个 ID 里有 170 个不符合这个规则：5xx/6xx/7xx 系列和 `000COMMON` 另有编码，以 JSON 为准。 **E2**
5. 行为全部编译在 exe 里。**只改数据文件能做两件事**：调这个类会读的参数，或者把类 ID 换成别的类。**加新行为（例如让不挡弹的弹体挡弹）只能改 exe**。 **E2**

---

## 2. 类 ID 是怎么变成类的

```text
bulletparam row
  └─ 0x0D6A5CD5 = classId
       └─ sub_14097E740(core, classId)        dispatcher: binary search + jump tables, 1407 cases
            └─ register function (one per id) pushes a 0x220 record, +0x208 = factory
                 └─ factory: alloc(object_size) → base ctor → write the class vtable
```

- 用 unicorn 直接模拟执行分派函数，记录每个 ID 第一次跳出函数时到达的地址，这就是注册函数。再从注册函数里找到工厂，从工厂里找到 vtable。1407 个 ID 全部解析成功，没有歧义。 **E2**
- 对象大小（工厂分配的字节数）大多是 0x3530 / 0x3540 / 0x3550 / 0x3560，都记录在 `object_size` 里。某个函数写对象的偏移超过这个大小就会越界，借用其他类的函数时一定要核对（见 `docs/unit-task-automata-fauc-shield-funnel.md` §11 的例子）。
- 分派表是全局的：任何机体的 bulletparam 行，在技术上都能填任何类 ID。但很多类依赖所属机体的资源，例如模型、动作、常驻表、父子弹，跨机借用必须实机验证（**E3**）。

---

## 3. 继承体系

完整树见 `projectile-class-tree.md`。标 `novt` 的节点是 VDK 框架基类，在 exe 里没有自己的 vtable，它们的函数用"最近公共祖先"归属法找回（§11）。

### 3.1 ActorProj 通用子弹（类 ID 1–81）

| 类 ID | 类 | 父类 | 自有槽位 |
|---:|---|---|---|
| 1 | `BulletMobileBeamrifle` | MobileAbstract | 0, 2, 51, 67 |
| 3 | `BulletMobileBazooka` | MobileAbstract | 0, 18 |
| 4 | `BulletShotgun` | Bazooka | 0, 2 |
| 20 | `BulletMortar` | BulletAbstract | 0, 2, 12, 18, 29, 51, 61, 65 |
| 21 | `BulletMortarShotgun` | Mortar | 0, 2 |
| 30 | `BulletDivideMobileCurve` | DivideMobileAbstract | 0, 2, 12, 71 |
| 31 | `BulletDivideMobileCurveReduce` | DivideMobileCurve | 0, 2, 12, 50, 71 |
| 40 | `BulletLaser` | BulletAbstract | 0, 2, 18, 29, 51, 61, 64, 65, 71 |
| 41 | `BulletDivideLaser` | BulletAbstract | 0, 2, 18, 29, 51, 61, 64 |
| 60 | `BulletStationaryBlast` | StationarySphereAbstract | 0, 67 |
| 61 | `BulletStationaryPillar` | StationaryCapsuleAbstract | 0, 68 |
| 62 | `BulletStationaryBlastPowerupGaugeUP` | Blast | 19 |
| 63 | `BulletStationaryBlastNoInteraction` | Blast | 2 |
| 70 | `BulletMobileTwoStageGuided` | MobileAbstract | 0, 2, 12 |
| 71 | `…TwoStageGuided_SecondSameTarget` | SecondAbstract | 0, 74 |
| 72 | `…TwoStageGuided_SecondOtherTarget` | SecondAbstract | 0, 74 |
| 80 | `BulletMobileBeamrifleIntersectExplode` | Beamrifle | 51 |
| 81 | `BulletMobileBeamrifleInteractionOffset` | Beamrifle | 0, 2, 72, 73 |

- 这 18 个可实例化的类覆盖了绝大多数普通射击。它们没有 CmdActionManager，行为直接写在类里。
- 物理相关的列（速度、诱导、重力、射程……）由 `BulletAbstract` / `Mortar` / `Laser` 读取。完整列表见 `projectile-archetypes.json`。
- 注意：slot 62 以上在这个家族里的含义和 Automata 家族**不同**。本报告只给 Automata 家族命名这些槽。

### 3.2 Automata 原型（RadiconParentActor 之下，1393 个类）

| 原型 | 子类数 | 典型用途 | 常见重写 |
|---|---:|---|---|
| `Funnel` → `FunnelFly` → `FunnelMawarikomi` | 372 / 276 | 浮游炮：飞出、绕到目标、射击、回收 | 62–64（模型 / 判定 ID）、69、96–98 |
| └ `FunnelFlySword`（含 `Penetrate`） | 75 | 浮游剑、突刺型浮游 | 76 |
| └ `FunnelShotImmediate` / `…Tukimatoi_ShotOrder` | 47 | 就地射击、跟随射击 | |
| └ `FunnelSwarm` | 20 | 环绕机体的群游（FAUC 借盾驾驶弹就在这里） | 78、79、96 |
| └ `FunnelShiftPos` → `FunnelShotStayShift` | 88 / 54 | 移动到定点后射击 | 86（部分带护盾） |
| └ `FunnelFlyStick` → `FunnelDefence` → `FunnelDefenceFormation` | 26 / 24 / 21 | **防御阵形浮游**（Cherudim、Zabanya、AGE-FX、Phenex、Hyperion 等） | 91、93、96、101 |
| `Throw` | 337 | 投掷物：回旋、落地、爆炸、贴墙 | 71–73、76、78–79、84、86–91 |
| └ `ThrowMortar` / `ThrowStopRotateOnStick` / `ThrowBlade` / `Detonator` / `ThrowReturn` | 36 / 25 / 14 / 8 / 7 | 曲射、插地、刃、定时爆、回收 | 74（Detonator） |
| `Summon` → `SummonRush` → `SummonRushShot` | 302 / 219 / 124 | **援护（Assist）机体**：冲刺、射击、格斗 | 2、11、30、46、72–74、83 |
| └ `SummonTukimatoi` / `SummonGrap` / `SummonDefence(Formation)` | 31 / 19 / 8 | 跟随、抓取、护卫阵形 | 86（护卫类带护盾） |
| `Sticker` → `StickerLaunchBone` / `StickerConnectLazer` | 83 / 26 / 3 | 贴附在骨骼 / 目标上的物体、连线激光 | 100、101 |
| `AttachAbstract` → `Attach` → `AttachReturn` | 53 / 25 / 12 | 挂到机体上、换装、回收 | 96–98 |
| `FreeFall` / `FreeFall_Interaction` | 42 / 12 | 掉落物（弹壳、脱落零件） | 79 |
| `Anchor` → `AnchorReturn` → `AnchorThrow` | 34 / 28 / 8 | 锚 / 钢索 | 11、18、23、73 |
| `PutObj` | 34 | 放置物 | 79、80、83 |
| `Boomerang` → `BoomerangSpline` | 30 / 6 | 回旋镖 | 73 |
| `AttachToRadicon` | 14 | 挂到另一个弹体上 | |
| `Resident` → `ResidentUnizon…Floating` | 9 | **常驻物**（FAUC 三面盾） | 2、78、79（认领逻辑在 RadiconParentActor 的 95 / 99） |
| `FreeFly` / `Relay` / `ShockHalo` | 5 / 4 / 3 | 自由飞行、中继、冲击环 | |

每个原型读哪些 bulletparam 列（UnitTask 层）都在 `projectile-archetypes.json` 的 `param_reads` 里。例子：
- `Throw` 读 21 列，包括旋转角、目标距离、重力 / 爆炸 / 弹数相关列。
- `Boomerang` 读 19 列。
- `Funnel` 本层只读 4 列，其余由各个 Manager 读取。

---

## 4. 一个 Automata 弹体的一生（伪代码）

下面是按 exe 行为抽象出来的流程，名字是本报告起的，括号里是槽号。

```js
// Spawn: MSC fires a bulletparam row -> dispatcher -> factory
function Spawn(row) {
  const obj = Factory[row.classId]();          // alloc object_size, write vtable
  obj.OnInit();                                // slot 2
}

function OnInit() {                            // Abstract: sub_140673A40
  createStatusObjects();
  const modifier = this.CreateInitDataModifier();     // 82
  applySpawnData(modifier);
  this.BuildParamBlock();                      // 48 -> 78 Create, 79 Fill, 91 FillSub, 80 Finalize
  createServices();                            // attack / receive / barrier / intersection / shell / alert
  // sub_140675240: spawn hooks
  this.SetupModel(model);                      // 83 (model id from 62 = column 0xD8F283FB)
  this.DescribeAttackShape(shape);             // 84
  this.AdjustAttackShape(shape);               // 85
  barrier.Configure(this.DescribeBarrier());   // 86 (default: none)
  this.ConfigureAlert(alert);                  // 87
  this.SetupModelAnimation(modelHolder);       // 88
  this.SetupModelSubObject(modelHolder.sub);   // 90
  this.OnInitHookA(obj3040);                   // 89
  if (stageCollider) this.ConfigureStageCollider(stageCollider);   // 92
  this.PreCreateManagerHook();                 // 69
  this.manager = this.CreateCmdActionManager();   // 81
  this.manager.Execute(ctx);                   // builds the CmdAction step tree
}

// RadiconParentActor adds, around OnInit (sub_1406A5BA0):
//   if (param.claimResident) parent = this.SelectResidentEntry(table);   // 95
//   this.PostClaimHook();                                                 // 99
//   for (i < this.GetSpawnOrderCount())                                   // 96
//     SendOrder(this.GetSpawnOrderId(i), this.GetSpawnOrderArg(i));       // 97, 98 -> message 0x20000017

function EveryFrame() {
  this.PreUpdate();              // 11: reset interactors, hit-stop time scale 0.01
  this.Update();                 // 12: manager steps advance, movement
  this.ProcessInteractionResults();   // 20 (see below)
  this.PostUpdateEffects();      // 72
}

function ProcessInteractionResults() {      // sub_1406734C0
  if (anyOrdinaryHit)  this.OnHitConsumed();          // 74
  if (anyFlaggedHit)   this.OnBarrierInteraction(hits);   // 75
  if (hitCounter == 0) this.OnHitCountExhausted();    // 71 -> default Dispose (94)
}

function OnStageContact(contact) {          // 73
  if (param.stageMode == 1) this.Dispose();                     // 94
  if (param.stageMode == 2 && contact.ground) this.Dispose();
}

function OnVanish(reason) {                 // 77
  spawnBullet(row[0x41435BE6]);             // on-expire bullet
  playVanishEffects(reason);
  disableInteractors(); barrier.Disable();
}
```

---

## 5. 虚槽语义表（Automata）

完整表见 `automata-vtable-slots.json`（含每个槽的实现数、被重写数）。"实现数"指全部 1393 个类里出现的不同函数个数。

### 5.1 值得 modding 关注的槽

| 槽 | 偏移 | 名字 | 作用 | 实现数 | 证据 |
|---:|---:|---|---|---:|---|
| 2 | 0x10 | OnInit | 生成总流程（§4） | 195 | E2 |
| 11 | 0x58 | PreUpdate | 每帧重置判定；受击硬直期间时间缩放 0.01 | 7 | E2 |
| 12 | 0x60 | Update | 每帧主更新 | 108 | E2 |
| 20 | 0xA0 | ProcessInteractionResults | 分发本帧命中结果到 74 / 75 / 71 | 1 | E2 |
| 28 | 0xE0 | GetTaskKind | 常量任务种类（RadiconParentActor = 465）；**不是** bulletparam 类 ID | 3 | E2 |
| 48 | 0x180 | BuildParamBlock | 依次调用 78 → 79 → 91 → 80 | 1 | E2 |
| 54 / 55 | 0x1B0 / 0x1B8 | IsTargetInside / OutsideOwnerRange | 参数开关打开时，按机体的锁定目标距离与机体射程比较 | 2 / 1 | E2 |
| 58 | 0x1D0 | BuildHitInfo | 用 63 / 64 组装攻击记录 | 4 | E2 |
| 62 | 0x1F0 | GetModelId | 读 `0xD8F283FB` | 3 | E2 |
| 63 | 0x1F8 | GetInteractionId | 读 `0xEDD1C108` | 5 | E2 |
| 64 | 0x200 | GetHitgroupId | 读 `0xD32D39ED` | 11 | E2 |
| 68 | 0x220 | SetWorldPosition | 写位置并同步模型 | 2 | E2 |
| 69 | 0x228 | PreCreateManagerHook | OnInit 里紧挨在 81 之前 | 11 | E2 |
| 71 | 0x238 | OnHitCountExhausted | 命中次数用完；默认调 94 消失 | 20 | E2 |
| 73 | 0x248 | OnStageContact | 碰到地形；模式 1 = 碰到就消失，2 = 落地消失 | 56 | E2 |
| 74 | 0x250 | OnHitConsumed | 普通命中；重写通常让 step 树跳到"命中"标签 | 21 | E2 |
| 75 | 0x258 | OnBarrierInteraction | 护盾 / 反射器被打中时调用 | 14 | E2 |
| 77 | 0x268 | OnVanish | 发射消失弹（`0x41435BE6`）、播消失特效、关掉判定和护盾 | 1 | E2 |
| 78 | 0x270 | CreateParamBlock | 分配参数块（放在 `+0x34A0`；RadiconParentActor 为 0x1B0 字节） | 54 | E2 |
| 79 | 0x278 | FillParamBlock | **每个类自己的参数装配**，大多读 bulletparam | 1095 | E2 |
| 80 | 0x280 | FinalizeParamBlock | 收尾；有生成指令时设置标志 | 3 | E2 |
| 81 | 0x288 | CreateCmdActionManager | 返回这个类的 `CCmdActionManager_*` | 1198 | E2 |
| 82 | 0x290 | CreateInitDataModifier | 默认 `CAutomataInitDataModifier_Default` | 6 | E2 |
| 83 | 0x298 | SetupModel | 用 62 的模型 ID 加载模型；为 0 时用默认模型 `0x082EA0D7` | 21 | E2 |
| 84 | 0x2A0 | DescribeAttackShape | 攻击判定形状（默认类型 3，从行读） | 265 | E2 |
| 86 | 0x2B0 | DescribeBarrier | **护盾描述**；默认类型 −1 = 无护盾 | 55 | E2 |
| 87 | 0x2B8 | ConfigureAlert | 配置警报组件（被锁定提示等） | 18 | E2 |
| 91 | 0x2D8 | FillParamSubBlock | 参数块 `+0x10` 的子块 | 191 | E2 |
| 92 | 0x2E0 | ConfigureStageCollider | 地形碰撞器设置 | 10 | E2 |
| 94 | 0x2F0 | Dispose | 移除弹体 | 1 | E2 |
| 95 | 0x2F8 | SelectResidentEntry | 从 12 格常驻表里选最近的待机项 | 2 | E2 |
| 96–98 | 0x300–0x310 | GetSpawnOrderCount / Id / Arg | 生成时发出的 order 消息列表（消息 `0x20000017`） | 30 / 36 / 46 | E2 |

### 5.2 只能从上下文推断的槽（E3）

| 槽 | 名字 | 依据 |
|---:|---|---|
| 18 | CollisionResolve | 阶段钩子；连线激光、护卫、锚类重写 |
| 21 | PreInit | RadiconParentActor 先做 `sub_1406A4DF0` |
| 22 | UpdateModelVisibility | 按 `+0x451` 开关模型绘制 |
| 23 | TypeFlags | 返回类型标志 |
| 59 | CreateMotionComponents | 分配动作 / 动画辅助对象；回旋剑类会替换 |
| 65–67 | UpdatePreMotion / AliveCheck / PostMotion | 由 Abstract 的 Update 调用 |
| 70 | StoreSpawnArgument | Radicon 把参数存到 `+0x3518` |
| 72 | PostUpdateEffects | 更新附着特效和 manager 的待处理列表 |
| 76 | ArchetypeEventHook | 主要是 Throw / FlySword 家族；参数开关打开时把事件转给 manager |
| 85 | AdjustAttackShape | 对攻击形状的第二次处理 |
| 88 / 90 | SetupModelAnimation / SubObject | 接收模型持有者及其 `+0x20` |
| 89 | OnInitHookA | 接收 `+0x3040` 对象 |
| 93 | RadiconHook93 | FunnelDefence 家族重写 |
| 99 | PostClaimHook | 跳转到 `sub_1406A6400` |
| 100+ | 原型扩展槽 | 每个原型各自扩展 vtable，**同一个编号在不同原型里含义不同**；实现者列在 JSON 里 |

### 5.3 其余槽

0、1、3–10、13–17、24–27、29–47、49–53、56、57、60、61 等在 1393 个类里几乎没有重写，属于框架内部，modding 不用关心。

### 5.4 对旧文档的更正

`docs/unit-task-automata-vtable-reference.md` 和 `docs/exvs2-unit-weapons.csv` 里的槽名有几处不对：

| 槽 | 旧名 | 实际 |
|---:|---|---|
| 28 | GetClassId / `class_id` 列恒为 465 | 常量任务种类，不是类 ID；真实类 ID 见本目录 JSON |
| 77 | OnSpawnHitEffects | OnVanish：消失时发射消失弹、关判定、关护盾 |
| 78 | Factory | CreateParamBlock；工厂是注册函数里的另一个函数 |
| 79 | ConfigureDamageInfo | FillParamBlock：每个类的参数装配 |
| 84 | Config（Summon 用） | DescribeAttackShape：所有类都有 |
| 86 | Internal | DescribeBarrier：决定弹体是否挡子弹 |

---

## 6. 弹体对象布局（服务组件）

由 `sub_140674970` 在 OnInit 时创建，偏移相对于对象基址：

| 偏移 | 组件 | 作用 |
|---|---|---|
| `+0x2E20` | 参数行指针 | `+0x38` 处是 bulletparam 行，所有 `sub_1405B2980(hash)` 读取都从这里取 |
| `+0x34A0` | 参数块（slot 78 创建） | 类自己的参数；RadiconParentActor 的基础块 0x1B0 字节 |
| `+0x34A8` | CmdActionManager（slot 81） | step 树 |
| `+0x34B0` | 模型持有者（4 种类型） | 模型、骨骼、动画 |
| `+0x34B8` | `CAutomataServiceInteractionAttack` | 攻击判定 |
| `+0x34C0` | `CAutomataServiceInteractionReceive` | 受击判定（能不能被打掉） |
| `+0x34C8` | `CAutomataServiceBarrier` | 护盾（挡弹） |
| `+0x34D8` | `CAutomataServiceIntersection` | 球形相交检测 |
| `+0x34E0` | `CAutomataServiceShellCollision` | shell 碰撞，由 step `SetCollisionEnableModeForShell` 开关（具体对象未单独验证，E3） |
| `+0x34E8` | `CAutomataServiceAlert` | 警报（slot 87） |
| `+0x34F0` | 地形碰撞器 | 由参数开关创建（slot 92） |

**碰撞体积 ≠ 挡弹**：
- 能看到的"体积"通常是攻击判定、受击判定或壳碰撞。
- 只有 `Barrier` 会挡住对方子弹，而它是否存在，完全由 slot 86 决定。

---

## 7. 谁在读 bulletparam

每个类的记录里有两组"读取列"：
- `param_reads`：UnitTask 类自己的函数读的列。
- `managers[].param_reads`：这个类的 CmdActionManager 专属函数读的列。

**两层加起来才是这个类的全部参数。** 以 FAUC 常驻盾（150080102）为例，UnitTask 层只读模型列 `0xD8F283FB`。部署偏移、待机距离、自转角等 12 列都是 `CCmdActionManager_…FunnelModel` 读的。两层合计 13 列，与 `src/lib/gameAlgorithms/bulletClassFieldRoles.ts` 里人工逐个逆向得到的 13 个用途列**完全一致（13/13）**，可以作为这套自动统计方法的校验。

基础层读的列（所有 Automata 类都会用到）：

| 层 | 读的列（pool 名） |
|---|---|
| `ActorProjectileAbstract` | 生成偏移、初始角、`speed_internal`、`sound_name_crc32`、`spread_angle`、`projectile_depiction_id`、`hit_id`、`lifetime` 等 13 列 |
| `AutomataAbstract` | `secondary_effect_hash`（模型）、`hitgroup_hash`、`interaction_hash`、`lifetime`、`bullet_size`、`on_expire_bullet_hash`、`hit_id` |
| `RadiconParentActor` | 另加子弹、轨迹 / 爆炸特效、`ammo_type_hash`、`spawn_pattern_hash` 等 |

**关于列名的提醒：**
- `pool_name` 是 `src-tauri/src/format/bulletparam.rs` 里当前的全局列名，很多是通用猜测名。同一列在不同类里用途不同，改名必须按类走证据（项目已有 `bulletClassFieldRoles.ts` 机制）。
- `0xD8F283FB`（pool 名 `secondary_effect_hash`）对所有 Automata 类都是**弹体模型 ID**：slot 62 读它，slot 83 用它加载模型，为 0 时换成默认模型。 **E2**
- `0xEDD1C108` 是 interaction ID，`0xD32D39ED` 是 hitgroup ID（slot 63 / 64）。 **E2**

---

## 8. 能力标记

对 RadiconParentActor 之下的类，只要某个关键槽不同于默认实现，就标记一项能力（`capabilities` 字段）：

| 标记 | 槽 | 类数 | 含义 |
|---|---:|---:|---|
| `custom_attack_shape` | 84 | 1380 | 自己的攻击判定形状 |
| `custom_param_block` | 78 | 1333 | 自己的参数块类型 |
| `alert_config` | 87 | 996 | 配置了警报 |
| `stage_contact_override` | 73 | 426 | 自己处理碰地形 |
| `spawn_orders_override` | 96 | 90 | 生成时发 order 消息（父子弹联动） |
| **`barrier`** | 86 | **78** | **有自己的护盾描述**（大多会生成护盾；少数按参数决定，例如シャンブロ在列值大于 0 时才生成） |
| `init_data_modifier` | 82 | 45 | 修改生成初始数据 |
| `custom_model_setup` | 83 | 32 | 自己加载模型 |
| `hit_count_exhausted_override` | 71 | 31 | 命中次数用完时的自定义处理 |
| `hit_consumed_hook` | 74 | 27 | 命中时跳转 step 树（爆炸类） |
| **`barrier_interaction`** | 75 | **15** | **护盾被打中时有反应**（反射、计数、失效） |
| `custom_model_id` | 62 | 14 | 不从 `0xD8F283FB` 取模型 |

**带护盾的类（节选）：**
- 各种投掷盾：Gundam、F91、Aegis、Crossbone、Altron。
- 投掷岩石 / 陨石：Zaku II J、Guncannon、AGE-1、Sinanju、Gaia。
- 护卫阵形 Assist：Gun-EZ、Murasame、Bawoo、Hammahamma。
- 反射器：Impulse `ShieldReflect`、Ex-S Incom Reflector、Build Strike `TransparentLaserAmp`。
- ヘカテー `BitBarrierFly` 三个类、Aerial `AssistGundNodeGuard`。

**护盾被打中后有特殊反应的 15 个类：** Impulse / 521 Impulse `ShieldReflect`、Astray Blue Frame D `TransparentRefractor`、Ex-S `IncomReflector*` ×2、ヘカテー `BitBarrierFly*` ×3、Build Strike 系 `Transparent*Amp*` ×5、Aerial `LaserGuardSelf`、シャンブロ `FunnelReflect`。

完整名单用 `capabilities` 字段筛选即可。

> 更正：`docs/unit-task-automata-fauc-shield-funnel.md` §11 写的"约 50 个类重写了 slot 86"是按不同实现函数数（55）估的。按类计是 78 个，以本目录数据为准。

---

## 9. Modding 指南

### 9.1 只改数据（bulletparam / MSC）能做什么

1. **调参数**：先在 JSON 里查到这个类的两组读取列，只改这些列才有效果。改类不读的列，不会有任何作用。
2. **换类**：把 `0x0D6A5CD5` 改成另一个类 ID，这一行就换成那个类的全部行为。前提：
   - 新类读的列要按新类的用途重新填（同一列意义可能不同）。
   - 新类的 Manager 可能依赖特定的模型、动作、骨骼、常驻表或父子弹关系，跨机借用必须实机测（**E3**）。
3. **找同类行为**：想要"会挡子弹的浮游物"，用 `capabilities` 含 `barrier` 筛；想要"环绕机体"，看 `FunnelSwarm` 原型下的类。

### 9.2 必须改 exe 的事

- 给不挡弹的类加上护盾：改 slot 86。FAUC 的完整分析在 `docs/unit-task-automata-fauc-shield-funnel.md` §11，那里的补丁方案**没有执行**。
- 改变命中 / 碰地形 / 消失时的反应：改 slot 71 / 73 / 74 / 75 / 77。
- 改 step 树：改 slot 81 返回的 Manager。

借用别的类的函数前必须核对：
- 这个函数写对象时的最大偏移，是否小于本类的 `object_size`。
- 它读的参数块偏移，是否在本类参数块的范围内。

### 9.3 查询示例

```bash
# All classes that own a barrier descriptor
python -c "import json;[print(o['class_ids'],o['name']) for o in json.load(open('docs/projectile-class-research/projectile-classes.json',encoding='utf-8')) if 'barrier' in o['capabilities']]"

# Every column a class reads (UnitTask + Manager)
python -c "import json;o=[o for o in json.load(open('docs/projectile-class-research/projectile-classes.json',encoding='utf-8')) if 150080102 in o['class_ids']][0];print([p['hash'] for p in o['param_reads']]+[p['hash'] for m in o['managers'] for p in m['param_reads']])"
```

---

## 10. 局限与未闭合项

1. §5.2 的槽只有上下文证据（E3）；100 号以后的原型扩展槽没有逐个命名。
2. ActorProj 家族 62 号以后的槽没有命名。它们和 Automata 同编号的槽**不是**同一个函数。
3. Manager 读取列只统计了"只属于这一个 Manager"的函数。共用的 Manager 基类（例如 `FunnelSankaiBase`，被 Self / Target 两个类共用）读的列会显示为空，要去看基类 Manager。
4. 读取列是按"函数里出现了 pool 中的 32 位 hash 立即数"统计的。极少数经寄存器计算得到的 hash 会漏掉。
5. 能力标记只说明"这个槽有自己的实现"，不保证每次都会生效（例如按参数决定是否生成护盾）。
6. 类 ID 是否能跨机体借用，未实机验证。

---

## 11. 方法（可复现）

1. **类**：扫描 `.rdata` 里所有 offset 为 0 的 COL，用 RTTI 的 ClassHierarchyDescriptor 取得完整基类链，只保留 `CUnitTaskActorProjectileAbstract` 之下的类。
2. **类 ID**：候选 ID 取分派函数里所有比较 / 减法立即数附近 ±300，加上按类名推出的编码空间。用 unicorn 从 `sub_14097E740` 模拟执行，记录第一次离开函数的地址。出现次数最多的出口是 default，剩下的就是 1407 个 case。再依次解析注册函数 → 工厂（`lea` 引用）→ vtable（工厂或它的两层调用内引用到的最深派生类）。
3. **函数归属**：从每个类的 vtable 出发，沿两层调用收集可达函数，把每个函数归给所有使用者的最近公共祖先。这样没有 vtable 的 VDK 基类（Funnel、Throw、Summon……）也能拿到自己的函数。
4. **读取列**：在归属函数里找 `bulletparam.rs` pool 中的 32 位 hash 立即数。
5. **槽语义**：先扫框架函数里的 `call [reg+off]`，得到调用关系（例如 OnInit 调用 28 / 69 / 81 / 82 / 88–90 / 92；slot 48 调用 78 / 79 / 80 / 91；slot 20 调用 71 / 74 / 75）。再反编译各层基类实现和最小的重写样本逐个确认。

所有步骤都在 `tools/extract_projectile_class_catalog.py` 里，只读 exe 和仓库文件，不修改任何东西。
