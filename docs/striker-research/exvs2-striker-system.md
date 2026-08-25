# EXVS2 Over Boost 援护（Striker）系统

目标读者：要在 **Wing Gundam Zero EW（`16001001`）** 上再挂一台援护机的 modder。

证据等级见 `README.md`。本文所有 **[PROVEN]** 条目的复现命令在 `research-log.md`。

> **术语更正（重要）**：本文里说的「OB v27」指
> `E:\OBHK0.3_v27\data\x64\dplcache_release`。它**不是纯净街机数据** ——
> 它的 `character_id_table` 里已经有 `999001001 … 999704001` 一整段自定义 id，
> `strikertable` 里也已经有 `999022001 / 999027001 / 999047001` 三行。
> 也就是说 **OBHK 0.3 发行版把改动直接写进了 base 层**。
> 真正接近原版的参照是 `E:\XB\解包\vs2\x64`（EXVS2 街机）。**[PROVEN]**

---

## 0. 一句话结论

> 在 OB v27 里，**一台援护机 = 一个独立的角色 ID（`5` 开头 9 位）**，它在
> `character_id_table` 里拥有和普通机体**完全同构的 6 个资源包引用**，在
> `strikertable` 里被某台主机体的 slot1/slot2 引用，在
> `foroutgamearmsparam_striker` 里拥有一行出场配置。
>
> 所谓「轻量化援护」不是另一种格式，而是**同一套表结构下让新 ID 复用已有资源包哈希**。
> 游戏本体已经这么用了（`503703001` 与 `703003001` 共享全部 6 个包）。**[PROVEN]**

---

## 1. 数据链路总览

```
                 ┌──────────────────────────────────────┐
 编成/选择画面 ─→ │ 0xA8FCC349  foroutgamearmsparam_striker│  353 行，键 = striker id
                 └──────────────────────────────────────┘
                                   │
 对战载入 ──────→ ┌──────────────────────────────────────┐
                 │ 0xFEEB79F0  strikertable (vgsht1)     │  151 行，键 = 主机体 id
                 │   host_unit_id → [striker_a, striker_b]│  值 = 0 或 striker id
                 └──────────────────────────────────────┘
                                   │
 资源解析 ──────→ ┌──────────────────────────────────────┐
                 │ 0x036B9E67  character_id_table (vgsht1)│  1695 行，键 = 任意角色 id
                 │   id → [model, aleo, nu3bank,          │
                 │         param, msc, anime]  6×u32 哈希 │
                 └──────────────────────────────────────┘
                                   │
        ┌──────────┬──────────┬─────┴─────┬──────────┬──────────┐
   002chara     006effect   090sound    041cpm     040msc   003motion
    模型         特效        音色库      参数表      脚本      动作
```

三张表都必须同时改，缺一台援护机就不会出现。**[PROVEN]**（三张表的成员关系
在 vanilla 里 100% 闭合：strikertable 引用的 154 个 striker 全部出现在 outgame
表里，且全部在 character_id_table 里有行。）

---

## 2. `strikertable` 格式规范

包：`0xFEEB79F0`（`x64/041cpm/striker/strikertable`）
容器：`vgsht1`，magic `0xCEABB8A9`，与 `src-tauri/src/format/raw_path_id.rs`
里 `parse_vgsht1` 同构，只是 `stride` 不同。

| 偏移 | 大小 | 内容 |
|---:|---:|---|
| `0x00` | 4 | magic `0xCEABB8A9` |
| `0x04` | 4 | 0 |
| `0x08` | 4 | 文件总长 |
| `0x0C` | 4 | 0 |
| `0x10` | 4 | `count`（行数） |
| `0x14` | 4 | `stride` = **8** |
| `0x18` | 8 | 0 |
| `0x20` | `count*4` | **主机体 id 数组，必须严格升序** |
| `0x20+count*4` | `count*8` | 记录区，每行两个 `u32` |

每行两个 u32 = **援护栏位 1 / 栏位 2 的 striker id**，`0` 表示该栏位空。
两个值相同表示两个栏位放同一台（游戏里就是「只有一个选择」）。

文件长度必须精确等于 `0x20 + count*4 + count*8`；VS2 的 968B / OB 的 1844B
都精确闭合。**[PROVEN]**

版本对比：

| 版本 | 文件 | 行数 |
|---|---|---:|
| EXVS2 (VS2) | `E:\XB\解包\vs2\x64\041cpm\striker\strikertable.vgsht1` | 78 |
| OB v27 | `dplcache_release\0xFEEB79F0.fhm2d` | 151 |

> ⚠️ `E:\XB\解包\com\file\0xFEEB79F0\0.bin` 是**已被改过**的副本（152 行，
> 多了 `66004001`/`66005001`，少了 `21013001`）。做基线对比请用 dplcache 里的。

### 表内统计（OBHK v27 base，151 行）

| 指标 | 值 |
|---|---:|
| 已填的援护栏位总数 | 215 |
| 其中 **同系列** | 202 |
| 其中 **跨系列** | **13** |
| slot1 == slot2 的行 | 22 |
| **slot2 为空的行** | **87** |

跨系列样例（**说明栏位不受系列限制**）：

```
3001001  (系列 03) -> 502001001 / 502002001  (系列 02)
24001001 (系列 24) -> 501701001              (系列 01)
25002001 (系列 25) -> 501711001              (系列 01)
999022001(自定义)  -> 521007001              (系列 21)
```

⇒ **给 Wing Zero EW 的 slot2 挂任意系列的现成援护都是合法的。[PROVEN]**
（`16001001` 正是那 87 行 slot2 为空之一。）

### ID 规则

* 主机体 id：`SS NNN 001`（如 `16001001` = 系列 16、第 1 台）。
* striker id：**`5` + 主机体 id**（如 `16001001` → `516001001`）。**[PROVEN]**
  —— 由 `striker_id == 500000000 + unit_id` 在别名行上恒成立推出。
* `5SS7NN001`（第 4 位是 `7`）= **只作为援护存在、没有可选版本**的机体，
  例如 `501701001`、`528705001`。这类没有 `SS7NN001` 的主机体对应物。

---

## 3. `character_id_table`（机体 index）格式规范

包：`0x036B9E67`，文件名 `character_id_table.bin`
（工作区里也叫 `机体index_完整_*.bin`）。同样是 `vgsht1`，`stride = 0x18`。

| 偏移 | 内容 |
|---|---|
| `0x10` | `count` |
| `0x14` | `entrySize` = `0x18`（24 字节 = 6×u32） |
| `0x20` | id 数组（升序，`u32`） |
| 之后 | 每行 6 个 `u32` 包哈希 |

| 来源 | 行数 | 其中 striker id |
|---|---:|---:|
| **vanilla OB v27**（`dplcache_release\0x036B9E67.fhm2d` → 26 940 B） | **961** | 406 |
| 工作区改造版（`E:\XB\解包\com\file\012list\character_id_table\`，47 492 B） | 1695 | 406 |

`0x20 + count*4 + count*0x18 == file_size` 在两份上都精确闭合，id 数组均严格升序。
`E:\ob_unit\ob_v27_unit.json`（961 行）就是 vanilla 这张表的 JSON 转写 ——
**但它附带的 `constXxxExists` 布尔值是陈旧的派生数据，不要当真**（见 L-07）。

**6 个槽位的顺序（已验证）：**

| # | 槽位 | 路由 | 内容 |
|---:|---|---|---|
| 0 | `model` | `002chara` | numdlb / nusktb / numatb / nutexb |
| 1 | `aleo` | `006effect` | efxbn 特效 |
| 2 | `nu3bank` | `090sound` | 音色库 |
| 3 | `param` | `041cpm` | 9 张参数表 |
| 4 | `msc` | `040msc` | bscex / cscex / dscex |
| 5 | `anime` | `003motion` | nuanmb |

实测行（`E:\XB\解包\com\file\012list\character_id_table\character_id_table.bin`）：

```
16001001   0x8259CA6A 0x79025FAD 0x421D77F3 0x5DC95763 0x0C326D7B 0xAC9FE2E9
516001001  0x1976812D 0x79025FAD 0x421D77F3 0xC6E61C24 0x971D263C 0x37B0A9AE
                      ^^^^^^^^^^ ^^^^^^^^^^ 与主机体完全相同（共用特效与音色）
```

**这是本文最重要的一张表**：项目里已经有编辑器
（`src/page/TestEditor/components/CharacterIdTableView.tsx`）。

---

## 4. `foroutgamearmsparam_striker`

包：`0xA8FCC349`（`x64/041cpm/for_outgame/foroutgamearmsparam_striker`）
容器：`vgsht2` 参数二进制，magic `0xCDABB8A9`，布局同
`src-tauri/src/format/param_bin_format.rs`。

```
entries = 353   fields = 1   entrySize = 4
field  hash=0x4961274C  offset=0  kind=2 (u32)
值分布 {1:2, 2:33, 3:258, 4:41, 5:19}
```

entry id 就是 striker id（外加一行 `0`）。
**[PROVEN]** 结构与「vanilla strikertable 引用的 154 台全部在此表中」。
**[INFERRED]** `0x4961274C` 的语义 —— 取值 1–5，最可能是**每场可用次数**。
在 clone 时直接抄源援护机的值即可，不必猜语义。

---

## 5. 包名与哈希规则

### 5.1 vanilla 命名（只用于「找到现有资源」）

一台机体的规范名是固定 23 字符：`SSSxxxxxx_NNNxxxxxx_001`
（例：`016gundmw_001wgzero_001`）。援护版本就是**把首字符 `0` 换成 `5`**：

```
E:\XB\解包\vs2\x64\040msc\016gundmw_001wgzero_001\
E:\XB\解包\vs2\x64\040msc\516gundmw_001wgzero_001\
```

meta 里的原始构建路径（`E:\XB\解包\vs2\meta\0x8D69AA9A_meta.bin`）：

```
c:\nufw_proj\vsac\mk_rom\product\exvs2\app\data\x64\040msc\516gundmw_003talgs3_001\516gundmw_003talgs3_001.bscex
```

**[PROVEN]**（磁盘目录 + meta 字符串双证据）。

### 5.2 哈希关系

包哈希是对固定长度名字做 CRC 家族哈希。同长度、单字符替换 ⇒ CRC 差值恒定：

```
striker_pack_hash = unit_pack_hash XOR 0x9B2F4B47
```

对 `ob_v27_unit.json` 里全部 **208 组** striker/主机体配对做校验：

| 路由 | 命中 XOR | 与主机体相同 | 其它 |
|---|---:|---:|---:|
| `model` (002chara) | **208** | 0 | 0 |
| `msc` (040msc) | **208** | 0 | 0 |
| `param` (041cpm) | **208** | 0 | 0 |
| `anime` (003motion) | **208** | 0 | 0 |
| `aleo` (006effect) | 0 | **202** | 6 |
| `nu3bank` (音色) | 0 | **205** | 3 |

**[PROVEN]**：援护机**自己拥有** 模型 / 脚本 / 参数 / 动作四个包，
**共用主机体的** 特效包和音色库（97–99%）。

一般式（同长度即可，跨系列也成立，实测 11 例全中）：

```python
new_hash = ref_hash ^ crc32(ref_name) ^ crc32(new_name)   # len 必须相等
```

### 5.3 新建资源包不需要上面的公式

引擎是**按 `character_id_table` 里存的名字**去找 `0xXXXXXXXX.fhm2d`，不是现场
反推。现行 mod 工具链（`E:\XB\解包\gundamv_All\crc32File.js`）直接用：

```js
const id = 1000000000 + unitId;      // 自定义机体 id 空间
CRC32.str(`${id}_MODEL`)  // → 包文件名
CRC32.str(`${id}_ALEO`) / `_AMMO` / `_MSC` / `_ANIME`
```

所以**任何未被占用的 8 位十六进制名都能用**。**[EVIDENCE]**

> 打包命名坑：重打包出来的 `.fhm2d` 必须是 **小写 `0x` + 大写十六进制**
> （`0xA258A522.fhm2d`），loader 拒绝全小写。项目里由
> `normalizeUnitModelPackStem`（`unitModelRepackService.ts`）处理。

---

## 6. 「独立援护」与「轻量化援护」的真实区别

用户提到的两种形态，在数据上的分界**不是格式差异，而是 `character_id_table`
那一行指向新包还是旧包**。

### 6.1 独立援护（游戏本体的标准做法）

`516001001`（Wing Zero EW 作为援护）在 OB v27 实盘里：

| 槽位 | 哈希 | 大小 |
|---|---|---:|
| model | `0x1976812D` | 7,255,457 |
| msc | `0x971D263C` | 86,740 |
| param | `0xC6E61C24` | 4,847 |
| anime | `0x37B0A9AE` | 1,580,909 |
| aleo | `0x79025FAD` | 161,333（与 `16001001` 共用） |
| nu3bank | `0x421D77F3` | 452,240（与 `16001001` 共用） |

它的 `041cpm` 包含**和可选机体一模一样的 9 张表**：

```
armsparam  bulletparam  characterparam  chrsysparam  grapparam
hitgroupiddef  interactionid  projectile_depiction_table  speedparam
```

它的 MSC 是完整的 `bscex/cscex/dscex` 三件套，反编译后
（`E:\XB\mod\040msc\516gundmw_001wgzero_001`）`0.c` 66.9 KB、`2.c` 533.2 KB —— 与
主机体（63.0 KB / 612.2 KB）同一量级。**[PROVEN]**

vanilla OB v27 里 strikertable 引用的 154 台援护，**153 台**都是这种形态。
（唯一例外 `520005001` 四个包全缺，且只被自定义机体 `999027001` 引用 ——
那是一条坏掉的 mod 行，可作反面教材。）

### 6.2 轻量化援护 = 复用已有包哈希

`character_id_table` 里 **241 组** id 拥有**逐字节相同的 6 哈希行**，其中包含一台援护：

```
503703001  0xA97F96A6 0x52240361 0x693B2B3F 0x76EF0BAF 0x271431B7 0x87B9BE25
703003001  0xA97F96A6 0x52240361 0x693B2B3F 0x76EF0BAF 0x271431B7 0x87B9BE25
703003005  0xA97F96A6 0x52240361 0x693B2B3F 0x76EF0BAF 0x271431B7 0x87B9BE25
```

**[PROVEN]** —— 一个新的 striker id 完全可以指向已有机体的六个包，一个新资源都不做。
混合形态同样合法：只替换 `param` 和 `msc`（各几 KB），`model`/`anime`/`aleo`/`nu3bank`
全部复用主机体的哈希。这就是「轻量化」在数据上的准确含义。

> 需要澄清的一点：**「和主机体打包进同一个 fhm2d」在 vanilla 里查不到**。
> 对已解包的 chara 包做扫描，没有任何一个机体包内含别的机体的 `numdlb`。
> 真正「寄生在主机体里」的东西是另一套系统：**unit-task automata 召唤物**
> （`CUnitTaskAutomata*`，见 `docs/unit-task-automata-*.md`），它是主机体的一件
> **武器**，没有 striker id、不进 strikertable，由主机体的 `armsparam` + MSC 驱动。
> 想要「按援护键召唤」就必须走 striker id 这条路；想要「某个武器射出一个会打人的
> 僚机」才走 automata 那条路。**[PROVEN 前半 / INFERRED 后半]**

---

## 7. 援护机内部结构

### 7.1 动作（motion）

`516001001` 的 anime 包 = 364 个 `.nuanmb`：

* 156 个通用受击/倒地：`001hito_000common_000common_001_*`
* 80 个本体动作：`001hito_016gundmw_001wgzero_001_*`
* 挂件动作：`400stick_..._bsaber00_*`（光剑）、`410wzerowing_..._wing00_*`（翅膀）
* 2 个借用的须佐之男动作：`001hito_014gndm00_003susano_001_kakb12a_*`

> **关键**：包内文件名用的是**主机体名 `016gundmw_...`，不是 `516gundmw_...`**。
> 所以做新援护时，动作包可以直接从主机体的 anime 包裁剪，不用批量改名。**[PROVEN]**

命名规范：

```
<motiongroup>_<series>_<unit>_001[_<prop>]_<verb>_<stance>_<ground>_<dir>.nuanmb
                                            │        │        │        └ fr/bk/lf/rt/lw/up
                                            │        │        └ air / gnd
                                            │        └ sht（射击构え）/ stk（格斗构え）
                                            └ 见下表
```

`516001001` 实际持有的 verb：

| verb | 含义 |
|---|---|
| `kamae` | 待机构え |
| `runbgn` / `runloop` | 走 |
| `boostbgn` / `boostloop` / `boostend` | BD |
| `jumpbgn` / `jumpbstrise` / `jumpbsttop` / `jumpbstfall` | 跳 |
| `landshort` / `landlong` | 落地 |
| `stepbgn` / `stepend` | step |
| `guardbgn` / `guardloop` / `guardend` / `guardhitbk` | 防御 |
| `attackhitbk` | 攻击被弹 |
| `wepdef` | 武器默认姿态 |
| **`kakun10a` `kakun11a` `kakun21a` `kakun31b` `kakun41b`** | **格斗连段（只有 `stk` 构え）** |
| **`kakb12a`** | **借用的格斗派生** |

⇒ **援护机做近战是 vanilla 支持的**，Wing Zero EW 的援护版本本身就是格斗型。**[PROVEN]**

### 7.2 MSC

`2.resolved.md` 的 Action Registry 规模：

| 单位 | 注册动作数 | `0.c` 函数 | `2.c` 函数 |
|---|---:|---:|---:|
| `016gundmw_001wgzero_001`（可选） | 56 | 144 | 1025 |
| `516gundmw_001wgzero_001`（援护） | **13** | 156 | 915 |
| `016gundmw_003talgs3_001`（可选） | 51 | 146 | 1000 |
| `516gundmw_003talgs3_001`（援护） | **21** | 156 | 938 |

`2.c` 的函数数量差不多（大部分是共用运行时库），**差在注册的 ACTION 数量**。
援护机注册的是「基础组 + 少量自有动作」：

| hash | slot | 已知含义 |
|---|---|---|
| `0x4cdc9902` | `0x1` | 受击 |
| `0xf5f21169` | `0x9`/`0xa` | 空中 idle |
| `0x14b0aea3` | `0xa`/`0xb` | 接触地面 |
| `0x1ad4e055` | `0x21` | 受击/硬直类 |
| `0xef809e66` | `0x22` | 倒地类 |
| `0x4ac375c7` | `0x33` | 未命名 |
| `0xc3e64564` | `0x37` | 未命名 |
| `0x10abcd8e` | `0x1d` | 未命名 |
| `0x906cbad0` | `0x1` | 未命名 |
| `0x7c7d0136` | `0x2` | 未命名（仅 Tallgeese III 援护有） |

> ⚠️ 上表来自 `2.resolved.md`（**生成的 overlay，不可信**）。直接 grep `2.c` 里
> 真正的注册调用 `func_241(<hash>, <func>)` 得到的**真实**结果是：
>
> | 单位 | `func_241` 注册数 | 独有项 |
> |---|---:|---|
> | `516gundmw_001wgzero_001` | **9** | 无 |
> | `516gundmw_003talgs3_001` | **11** | `0x7c7d0136→func_865`、`0x3cc16f1f→func_930` |
> | `016gundmw_001wgzero_001` | **35** | — |
>
> 两台援护共有的 9 条基线：
> `0x10abcd8e→func_863`、`0x14b0aea3→func_414`、`0x1ad4e055→func_650`、
> `0x4ac375c7→func_856`、`0x4cdc9902→func_869`、`0x906cbad0→func_867`、
> `0xc3e64564→func_858`、`0xef809e66→func_871`、`0xf5f21169→func_412`。
> 其中 `0x10abcd8e / 0x4ac375c7 / 0x906cbad0 / 0xc3e64564` 在可选机体的
> `func_241` 表里**不出现** —— 这四条是**援护专属的生命周期动作**。
> `2.resolved.md` 里写的 `func_903/908/913/917/922/927` 在 `2.c` 里**根本不存在**。
> **[PROVEN]**

另外：援护的 `0.c` 里 `sys_1(0x10000, 0x1, slot, hash)` 槽表与主机体
**逐行相同（30 行）** —— 说明援护的 `0.c` 基本是主机体 `0.c` 的拷贝，
差异全在 `2.c` 注册了哪些 ACTION。**[PROVEN]**

⇒ **「这台援护能做几件事」直接等于它 `2.c` 里 `func_241` 自有 ACTION 的数量。**
要让援护既射击又近战，就得在 `2.c` 里各注册一组，并在 `0.c` 的选择器里接上。
（MSC 编辑流程走 `.cursor/skills/msc-research-index/SKILL.md`，
本文不重复；相关 cluster：`registry`、`ranged`、`input-0c`、`runtime-2c`。）

### 7.3 参数

| 表 | `16001001`（可选） | `516001001`（援护） | `516003001`（援护） |
|---|---:|---:|---:|
| armsparam | 2.9 K | 1.0 K | 1.0 K |
| bulletparam | 7.3 K | 1.3 K | 2.9 K |
| characterparam | 3.9 K | 3.9 K | 8.9 K |
| chrsysparam | 68 B | 68 B | 68 B |
| grapparam | 1.1 K | 356 B | 424 B |
| hitgroupiddef | 4.8 K | 912 B | 1.9 K |
| interactionid | 5.6 K | 1.0 K | 1.8 K |
| projectile_depiction_table | 400 B | 400 B | 464 B |
| speedparam | 1.5 K | 1.4 K | 1.4 K |

**表的种类完全一样，只是行数少**。援护机有自己的血量、移动速度、锁定距离。**[PROVEN]**

### 7.4 援护参数的三条硬规律（12 个包实测，6 可选 / 6 援护）

| 项目 | 可选机体 | 援护机 |
|---|---|---|
| `speedparam` schema | **74 字段 / 304 字节** | **69 字段 / 284 字节** |
| `armsparam` 行数 | 3 – 18 | **恒为 1** |
| `bulletparam` 行数 | 25 – 126 | 0 – 23 |

样本（全部来自 `dplcache_release`）：

```
play 1001001  74/304  arms=3   bullet=28      STRK 501016001  69/284  arms=1  bullet=23
play 2001001  74/304  arms=10  bullet=25      STRK 502012001  69/284  arms=1  bullet=10
play 20005001 74/304  arms=8   bullet=126     STRK 520012001  69/284  arms=1  bullet=4
play 33004001 74/304  arms=11  bullet=124     STRK 533008001  69/284  arms=1  bullet=5
play 42001001 74/304  arms=18  bullet=74      STRK 542005001  69/284  arms=1  bullet=4
play 49004001 74/304  arms=12  bullet=47      STRK 549002001  69/284  arms=1  bullet=14
```

12/12 干净分野。**[PROVEN]**

**⚠️ 因此：绝对不要把可选机体的 `speedparam.bin` 直接塞进援护包**
—— schema 不同（74 vs 69 字段），行长也不同（304 vs 284）。
做新援护时**永远从另一台援护的 param 包 clone**。

**射击 vs 近战的判据：**

| 能力 | 数据特征 |
|---|---|
| 会射击 | `bulletparam` 有行 + `projectile_depiction_table` 有行 |
| 会近战 | `hitgroupiddef` / `interactionid` 有行 + 动作包里有 `kakun*` |

对照：

| striker | armsparam | bulletparam | hitgroupiddef | interactionid | characterparam | 结论 |
|---|---:|---:|---:|---:|---:|---|
| `516001001` Wing Zero EW | 1 | **0** | 10 | 4 | 1 | **纯格斗援护** |
| `516003001` Tallgeese III | 1 | **5** | 26 | 10 | **7** | **射击 + 格斗** |

⇒ 用户要的「能射击、能近战」的援护，vanilla 里现成的模板就是
**`516003001`（Tallgeese III 援护，本来就是 Wing Zero EW 的 slot1）**。
它有 5 条弹道、26 个受击组、10 条 interaction、7 行 characterparam。**[PROVEN]**

> `chrsysparam.csyspm` 都是 68 B 的 1×1 空表 —— 参见
> `[[project_chrsysparam_table_container]]`：老的解析/重建会毁掉真实文件，
> 不要用旧路径动它。

---

## 8. Wing Zero EW 的现状

vanilla OB v27 `strikertable`：

```
16001001  ウイングガンダムゼロ（EW版）  →  slot1 = 516003001（トールギスⅢ 援护）
                                          slot2 = 0        ← 空着
```

同系列已有的四台援护包（全部实盘存在）：

| striker id | 名字 | 规范名 |
|---|---|---|
| `516001001` | Wing Zero EW | `516gundmw_001wgzero_001` |
| `516002001` | Heavyarms Custom EW | `516gundmw_002hvarms_001` |
| `516003001` | Tallgeese III | `516gundmw_003talgs3_001` |
| `516004001` | Deathscythe Hell Custom EW | `516gundmw_004dthell_001` |

空闲 id（三张表都没占用，已验证）：`516005001`、`516006001`、`516701001`、`516702001`。

---

## 9. 三条实施路线

### 路线 A — 零资源（先跑通链路，强烈建议第一步做这个）

只改 `strikertable` 一个字段：

```
16001001 : slot2  0 → 516001001     （把「Wing Zero EW 自己」当第二援护）
```

（跨系列也合法，见 §2 统计。想要别的就换成任意一个已存在的 striker id。）

不需要动 `character_id_table`（`516001001` 已在表内），不需要动
`foroutgamearmsparam_striker`（`516001001` 已在表内），不需要做任何资源包。
进游戏就能在编成里看到第二个援护选项。

**用途**：验证你的 fhm2d 拆/打包流程、验证 slot2 真的生效。失败了就是工具链问题，
不是数据问题。

### 路线 B — 轻量化新援护（新 ID，复用资源）

**clone 源的选择**：既要射击又要近战 ⇒ 选 **`516003001`（Tallgeese III 援护）**，
它本来就是 `16001001` 的 slot1，且 `bulletparam` 5 行 + `hitgroupiddef` 26 行 +
`interactionid` 10 行，射击和格斗的数据都是齐的（见 §7.4）。
若只要纯格斗，选 `516001001`（`bulletparam` 0 行）。

1. 选 id `516005001`。
2. `character_id_table` 加一行 `516005001` → **直接抄 `516003001` 的 6 个哈希**：
   `0x03020D8B 0x6376D30B 0x5869FB55 0xDC929082 0x8D69AA9A 0x2DC42508`
3. `foroutgamearmsparam_striker` 加一行 `516005001` → 抄 `516003001` 的 `0x4961274C` 值。
4. `strikertable`：`16001001` slot2 = `516005001`。
5. 想改行为时，**只重做 `param` 和 `msc` 两个包**（各几 KB），
   `model` / `anime` / `aleo` / `nu3bank` 继续指向 `516003001` 的哈希。
   —— param 包必须从**援护**的 param 包 clone，不能拿可选机体的
   （`speedparam` schema 不同，见 §7.4）。

这是**成本最低、又能拥有独立数值和独立脚本**的形态，也是本文推荐给
「Wing Zero EW 再加一台援护」的做法。

### 路线 C — 完整独立援护（新模型）

在 B 的基础上，额外做 `model`（002chara）和 `anime`（003motion）两个包。
模型/骨架/材质走项目已有的 Unit Model Editor 管线
（`[[project_unit_model_dynamic_folder_pipeline]]`），动作走 RoundTripMotion
（`[[project_motion_roundtrip_toolchain]]`）。

---

## 10. 完整操作步骤（路线 B）

### 10.1 取出三张表

```powershell
$OB = "E:\OBHK0.3_v27\data\x64\dplcache_release"
$T  = "tmp\striker-research"

.\src-tauri\target\debug\fhm2d_extract.exe "$OB\0xFEEB79F0.fhm2d" -o "$T\strikertable"  -t character_param -l flat
.\src-tauri\target\debug\fhm2d_extract.exe "$OB\0xA8FCC349.fhm2d" -o "$T\outgame"       -t character_param -l flat
.\src-tauri\target\debug\fhm2d_extract.exe "$OB\0x036B9E67.fhm2d" -o "$T\characteridtable" -t stage_list -l flat
```

> `--type` 只影响输出文件名，不影响字节（实测同一个包用
> `stage_list` / `character` 出 `0.bin`，用 `character_param` 出 `grapparam.bin`，
> 26 940 字节完全一致）。`strikertable` 会被命名成 `grapparam.bin`，
> 别被吓到 —— magic 仍是 `0xCEABB8A9`。

### 10.2 改 `character_id_table`

用项目里的 **TestEditor → Character Id Table** 界面
（`src/page/TestEditor/components/CharacterIdTableView.tsx`），
或直接改二进制：

* `0x10` 的 `count` +1
* id 数组插入 `516005001`，**保持升序**
* 记录区在同一个下标插入 24 字节：6 个 u32 哈希（抄 `516001001` 那一行）
* `0x08` 的文件长度 = `0x20 + count*4 + count*0x18`

### 10.3 改 `foroutgamearmsparam_striker`

`vgsht2` 结构：`entry_count` +1，id 数组插入 `516005001`（升序），
在对应下标插入 4 字节的 `0x4961274C` 值。头部 `file_size` 同步。

### 10.4 改 `strikertable`

找到 id 数组里 `16001001` 的下标 `i`，把记录区 `0x20 + count*4 + i*8 + 4`
处的 u32 从 `0` 改成 `516005001`。**行数不变，长度不变**，这是风险最低的一步。

### 10.5 重打包

用 `node compression.js`（参考实现，MD5 与已知良品一致）。
**不要**用进程内的 Rust `fhm2d_pack.rs`（commit `04180f6`）——
同样的内容、不同的压缩容器，会做出让游戏崩溃的包。
见 `[[project_fhm2d_rust_packer_incompatible]]`。

输出文件名：`0xFEEB79F0.fhm2d`（小写 `0x` + 大写 hex），放进
`E:\OBHK0.3_v27\data\x64\mod\`。

### 10.5b `mod\` 目录的两种覆盖形态（实测）

`E:\OBHK0.3_v27\data\x64\mod\` 共 3734 个文件：

| 形态 | 数量 | 说明 |
|---|---:|---|
| `0xHASH.vgsht2` | 3725 | **加密**的散装参数表（首 4 字节每个文件都不同，
  由同目录上层的 `fhm2d_encrypt.js` 生成）。不能直接改。 |
| `0xHASH.fhm2d` | 9 | **明文**整包，头 4 字节 `B9 B7 B2 CD`，与
  `dplcache_release` 里的包格式完全一致。 |

9 个明文包里包含 `0xDFD38C70`（`character_list`）：

```
mod\0xDFD38C70.fhm2d              -> 解出 0.bin  433.6 KB
dplcache_release\0xDFD38C70.fhm2d -> 解出 0.bin  216.7 KB
```

同一个哈希两边都在、`mod` 那份行数明显更多，而游戏里显示的是扩充后的机体表
⇒ **`mod\` 优先于 `dplcache_release\`**。**[EVIDENCE]**

⇒ 改 `strikertable` / `character_id_table` / `foroutgamearmsparam_striker`
时，**用明文 `.fhm2d` 放进 `mod\` 即可**，不需要碰加密的 `.vgsht2` 路径，
也不要去覆写 `dplcache_release` 原文件（留着做基线对比）。

### 10.6 之后要做自有行为时

* `param`：从 `0xC6E61C24` 拆出 9 张表 → 改 `armsparam` / `bulletparam` /
  `hitgroupiddef` / `interactionid` → 重打包成新哈希 → 更新 `character_id_table` 第 3 槽。
* `msc`：从 `0x971D263C` 拆出 `bscex/cscex/dscex` → 用 `tools/mscdec.py` 反编译 →
  在 `2.c` 注册新 ACTION、在 `0.c` 接选择器 → `tools/msclang.py` 重编 →
  重打包 → 更新第 5 槽。
  **MSC 改动必须走 `.cursor/skills/msc-research-index/SKILL.md` 的完整生命周期审计**
  （ENTER / ACTIVE / EXIT / INTERRUPT / RESPAWN），不走 GPT fast path。

---

## 11. 验证清单

改完之后按顺序核对，任何一条不过就不用进游戏了：

- [ ] `strikertable`：`count` 与文件长度满足 `0x20 + count*4 + count*8`
- [ ] `strikertable`：id 数组严格升序
- [ ] `character_id_table`：`count`、`entrySize=0x18`、长度 `0x20+count*4+count*0x18`
- [ ] `character_id_table`：id 数组严格升序
- [ ] `foroutgamearmsparam_striker`：`entry_count` 与 `file_size` 同步
- [ ] 新 striker id **同时**存在于 `character_id_table` 与 `foroutgamearmsparam_striker`
- [ ] `character_id_table` 里那 6 个哈希，对应的 `0xHASH.fhm2d` **在
      `dplcache_release` 或 `mod` 里真实存在**（这是 `520005001` 踩过的坑）
- [ ] 重打包文件名是小写 `0x` + 大写 hex
- [ ] 用 `node compression.js` 打包，不是 Rust packer

## 12. 已知失败模式

| 症状 | 原因 |
|---|---|
| 编成里看不到新援护 | `foroutgamearmsparam_striker` 缺行 |
| 选得到但一召唤就崩 | `character_id_table` 指向的包不存在（对照 `520005001`） |
| 整个表读不出来 | id 数组没排序，或长度字段没同步 |
| 包能读但游戏崩 | 用了 Rust packer 而不是 `compression.js` |
| loader 直接拒绝 | 文件名用了全小写 hex |
| 援护出来但不动 | `msc` 包里没有对应 ACTION 注册 |

---

## 13. 未证实 / 待研究

1. **`0x4961274C` 的确切语义**（取值 1–5）。目前推测是每场使用次数。
   验证方法：改一台援护的值，进游戏数次数。
2. **主机体呼叫援护的具体触发链**。已知：
   * 原生类 `CBattleStrikerManager`（`.?AVCBattleStrikerManager@GAM@VDK@@`，
     在 OB v27 的 RTTI 字符串里）。
   * 部分主机体的 anime 包里有 `*_striker_sht_air_fr` / `*_striker_stk_air_fr`
     召唤动作（如 RX-78-2 的 `0xC992FAFF`），但 **Wing Zero EW 的 `0xAC9FE2E9`
     里没有** —— 说明召唤动作是可选的。
   * 尚未确认：呼叫按键是在 `0.c` 选择器里，还是完全由原生层接管。
3. **援护机的 AI 由谁驱动**。`516001001` 的 `0.c` 有 156 个函数（比主机体还多），
   但没有确认它是否读玩家输入。
4. **援护的名字/图标在编成 UI 里从哪来** —— 仍未解决，但已排除两条路：
   * strikers **不在** `character_list`（684 行，全是可选机体）里。**[PROVEN]**
   * `009gui/image/ms/*` 的九类图标（`ms_crs / ms_igh_r / ms_mn / ms_ms_l /
     ms_ms_s / ms_vs_l / ms_vs_r / ms_vs_s_l / ms_vs_s_r`）一律按
     `<kind>_<系列3位>_<机体3位>_<变体3位>` 命名，**没有任何 `5xx` 系列、
     也没有任何 `>=700` 的机体位**。VS2 名表（2280 个包）和 OB 的
     `ms_ms_s_structure.json`（275 项）双向确认。**[PROVEN]**
   * ⇒ 援护要么复用「去掉首位 5」得到的基础机体图标（对 `516003001` 成立，
     但对 `528705001` 这种没有可选版本的就不成立），要么另有一套没找到的资产。
   * **对路线 A / B 无影响** —— 复用已存在的 striker id 时，UI 本来就显示正常。
     只有做全新 striker id 时才需要解决。
5. **`5SS7NN001`（第 4 位为 7）这一段是否有额外规则**。目前只知道它们没有
   对应的可选机体。
6. 项目里**还没有 strikertable 编辑器** —— `vgsht1` 的 `stride=8` 变体没被
   `raw_path_id.rs` 覆盖（那里硬编码 `RECORD_STRIDE = 0x18`）。
   要做的话，最小改动是把 stride 变成参数。
