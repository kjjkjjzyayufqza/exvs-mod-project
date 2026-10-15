# Slot：从 nus3audio 登记一条新的驾驶员语音

> 给在这个仓库里改 Test Editor 的人。按阶段做。每一阶段先写失败的测试，再写实现。不要在 bank 字节还没通过测试时把 Save 接到写盘。这不是 MSC `X.c` 任务。

**目标：** Sound → Slot 的 Add 不再插入一条全空行。用户选一个已经做好的 `.nus3audio`，编辑器在内存里算出 stem、`voiceKey`、`streamPathId`、Path 行、音频落点，以及新的 `bankPackage`。链路条用这份草稿预览。右上角 Save 先弹出确认，列出将写入的文件和是否覆盖。确认后才写工作区里的表和 `.nus3bank` 文件。这一步不 Repack。

**例子：** 傑斯塔，`character_list` 的 `entryId` `15010001`，`pilotPresentationHash` 现在是 0。自定义 stem 用 `VO_1001_P01_0`。`VO_1000_P01_0` 已经被 `900000004` 占用。

**规格：** [exvs2-audio-voice-bgm-indexing](../../exvs2-audio-voice-bgm-indexing.md)。已落地的时钟编辑：[2026-10-13-pilot-voice-bank-duration](2026-10-13-pilot-voice-bank-duration.md)。已实测的索引闭环：[2026-08-23-custom-pilot-voice-vo-1000](../../agent-sessions/2026-08-23-custom-pilot-voice-vo-1000.md)。

**状态：** 未开始。

---

## 已经定下来的事

- 游戏用 bank 里的 cue 名找声音。`.nus3audio` 和 `.nus3bank` 必须成对。只改音频、bank 里没有同名 cue，运行时找不到。阿姆罗那一对是音频 753 条，bank 754 个名字（753 条 cue 加 1 个 bank 名）。
- 「条数 × 空文件」不是 `.nus3bank`。本仓库没有从零生成 bank 的写入器。`pilot_voice_bank.rs` 的 `sync_bank` 只改已有 cue 的 `n_samples`，cue 名单变了就返回 `sync changed the cue list`。
- Audio Editor 对 `.nus3bank` 的 Add+Save 会把 TONE 名字槽从 `0x19` 收成 `0x0C` 并改 `flags1`，加载时 `FinalizeLoad` 空指针。音频文件里的 cue 仍可以在 Audio Editor 里做。bank 侧不要走那条路径。
- `bankPackage` 是包 id。游戏用 `0x%08X.fhm2d` 打开它。原版包 id 不能从路径哈希出来。**新包可以自选 id。** 本计划的新 id 是 `CRC32-IEEE("{stem}_bank")` 的无符号 32 位，文件名 `0x{id:08X}.fhm2d`。这不是去还原原版 `0xA4864422` 那种 id。
- 角色表查找的是 `CRC32-IEEE(stem)`，stem 必须像 `VO_1001_P01_0`（13 个字符，`VO_`、四位 work、`P` 或 `N`、两位槽、一位变体）。`abcd.nus3audio` 这种名字不能当语音身份。
- 六个标签继续各写各的文件。Save 确认可以把这一次草稿要写的路径列在一起，底层仍调用现有的 `build_pilot_voice_resource_pack`、`build_raw_path_id_pack`。不要合成一个新的大包格式。
- 目标版本只有 OB 及更早。不要打开、引用或把更晚版本的二进制写进计划、测试和注释。

## 不做

- 不按 cue 条数生成空的 `.nus3bank`。
- 不在 Voice bank 或 Bank 页做 cue 的 Add/Remove。
- 新语音的 `.vot` 从 donor 克隆 situation。situation 编号、音量、`param50`、`param100`、flags 不动；cue 名只换 stem 后重算 `cueId`。新音频里没有的后缀删掉。一条 situation 一个 cue 都不剩就留空列表，不另造编号。包号是 `CRC32("{stem}_vot")`，内名 `{小写 stem}_01.vot`。没有合格的驾驶员 TONE 槽宽时不写 `.nus3bank`，也不把那个包标脏。`0x19` 是 BGM 名字槽，不是驾驶员模板。
- 不给 BGM group 0、1、2、5 做解包页。
- 不把 `pilotPresentationHash` 改成另一种整数。它仍然存 `voiceKey`。
- 不在这一阶段做「Repack 全部脏包」。Repack 只在文末写成下一阶段的接口，等 Save 的文件布局稳定后再做。
- 不把游戏原包、`.nus3audio`、`.nus3bank` 提交进 git。测试自己造字节。

## Remove（未完成）

Slot 的 Remove 现在只做两件事：从内存里的 `pilotvoiceresourcetable.vrtbl` 删掉这一行，并丢掉这一行还没保存的草稿。下一次 Slot Save 只把少了这一行的 vrtbl 写回去。

还没有做：

- 不删 `raw_path_id` 里对应的 Path 行
- 不删已经复制出去的 `.nus3audio`
- 不改 voice bank，也不改 `.vot`
- 不改角色表里的 `pilotPresentationHash`

沿用 donor 时，那张 bank 是和别的语音共用的。以后补完 Remove 时，不能因为删了一条 Slot 就把 donor 的 bank 文件删掉。

代码位置：`src/page/TestEditor/components/pilot-voice-resource/PilotVoiceResourceView.tsx` 的 `handleDelete`，上面有同样意思的注释和 `TODO`。

---

## 用户看到的流程

工作区是已经解包的 mod 根，例如 `E:\XB\mod`。`090sound`、`raw_path_id`、`character_list` 已经在这个根里。

1. 打开 Sound → Slot。
2. Add 打开文件选择器，过滤器是 `.nus3audio`。不接受文件夹。
3. 文件名（去掉扩展名）只能是英文、数字和 `_`。有空格或其他符号就拒绝，不插入行。
4. 文件名里要有合法 stem。`VO_1001_P01_0.nus3audio` 和游戏文件名 `VO_1001_P01_0_01_ST_01.nus3audio` 都得到 stem `VO_1001_P01_0`。只叫 `abcd.nus3audio` 时拒绝。合法则在列表底部追加一行并选中。
5. 这一行先只活在内存里。链路条用草稿显示，并带黄色「未保存」：
   - Slot：`VO_1001_P01_0`
   - Path：将登记的键 `STREAMPATH_ST_VO_1001_P01_0`（标注来自草稿，不是已保存文件）
   - Audio file：派生路径，并标明源文件还没复制过去
   - Voice bank：`0x{CRC32("VO_1001_P01_0_bank")}`，标注 bank 文件还在内存里
6. `voiceKey` 和 `streamPathId` 只读，由 stem 经现有的 `finalize_pilot_voice_resource_entry` 写出。用户不填这两个十六进制。
7. `dummyPackage` 仍是 `0x147BC38E`。`bankPackage` 在 Add 时算出，等于 `CRC32("{文件名去掉扩展名}_bank")`。`votPackage` 不能从文件名算出来：OB 上 344 行里有 324 个不同的 vot 包，每个都是一份真实 `.vot`。从一条已经能响的行只复制 `votPackage`（`VO_1000_P01_0` 上是 `0xA8C57029`）。复制不会改掉刚算出的 `bankPackage`。
8. 右上角 Save 先确认。对话框列出每个将写入的绝对路径，以及该路径现在是否已有文件。已有文件的行用覆盖标记。取消则磁盘不变。
9. 确认后写入工作区文件。不在这次 Save 里 Repack。
10. 角色表 `15010001` 的 Pilot Presentation Hash 仍用 stem 框写入 `voiceKey`。那是另一次 Save，打进 `0xDFD38C70`。

`VO_1001_P01_0` 不在 stem 反查表（表只有 work 0..199、900、1000）。重新打开后名字列可以是空的，哈希仍是 `0x26C008DA`。选择器按文件名得到 stem，不依赖反查表。

---

## 这条草稿要算出的数

以 `VO_1001_P01_0.nus3audio` 为例。CRC 是 CRC-32/IEEE（初值 `0xFFFFFFFF`，多项式 `0xEDB88320`，末尾取反），输入是 ASCII 字节。

| 字段 | 输入 | 值 |
|---|---|---|
| stem | 文件名里的 `VO_####_[PN]##_#`，后面可以再跟 `_01_ST_01` | `VO_1001_P01_0` |
| `voiceKey` | `CRC32(stem)` | `0x26C008DA` |
| Path 键 | `STREAMPATH_ST_` + stem | `STREAMPATH_ST_VO_1001_P01_0` |
| `streamPathId` | `CRC32(Path 键)` | `0xCE158C18` |
| `source` | 现有 `derive_pilot_voice_source` | `091waveform/voice/pilot/vo_1001/VO_1001_P01_0_01_ST_01.nus3audio` |
| `dummyPackage` | 常量 | `0x147BC38E` |
| `bankPackage` | `CRC32("{文件名去掉扩展名}_bank")`。`VO_1001_P01_0_01_ST_01.nus3audio` 得到 `CRC32("VO_1001_P01_0_01_ST_01_bank")` = `0x04EF8D7A` | 不是 0 |
| `votPackage` | 从已有行复制。没有文件名公式 | 不自动发明 |

`bankPackage` 只在「这是一条新语音、要新建 bank 包」时用 `{stem}_bank`。复制别人的 `bankPackage` 来复用对方的 bank 时，不要改写那个 id。两种模式在 Add 时分开：

- **沿用 donor bank：** 音频里的 cue 名已经和那张 bank 一致。`bankPackage` 抄 donor。不创建新的 `.nus3bank`。这就是 `VO_1000` 复用 work 16 的做法。
- **新建 bank 包：** `bankPackage = CRC32("{stem}_bank")`。内存里放一份 `.nus3bank` 字节。Save 才把它写成工作区里的松散文件。Repack 不在这次。

Add 的对话框要让用户选其中一种。默认是沿用 donor。新建 bank 在阶段 3 的测试通过之前保持禁用，并写明原因：还没有合格的 bank 字节。

---

## 内存、Save、Repack

```text
Add 选中的 .nus3audio
        |
        v
内存草稿 VoiceDraft
  slot 行、path 行、source 路径、bankPackage、可选的 bank 字节
        |
        v  链路条读草稿（黄色未保存）
        |
        v  Save 确认
工作区文件（仍不是 .fhm2d）
  090sound/pilotvoiceresourcetable.vrtbl
  raw_path_id_release.json + .vgsht1
  复制后的 .nus3audio（派生 source 的绝对路径）
  仅「新建 bank」时：{stem}/{stem}.nus3bank
        |
        v  下一阶段，本次不实现
脏包 Repack
  0x8C428AF2  整个 090sound（7 个文件一起）
  0x264D1CA7  raw path
  新 bank 的 0x{bankPackage}.fhm2d（要先有 structure json）
  角色表另一次：0xDFD38C70
```

链路条今天读的是已保存文件，所以新行会显示「未登记 / 不在磁盘上 / 尚未解包」。草稿模式下，当前这条的四步改读 `VoiceDraft`。其他行仍读已保存文件。草稿上要写「尚未保存」，不要写成已经在磁盘上。

---

## 阶段 1：草稿模型和链路预览

不打开文件选择器，不写盘。

新增前端类型 `VoiceDraft`（放在 `src/page/TestEditor/components/sound-table/`）：

- `stem`
- `sourceAudioPath`（用户选中的文件，尚未复制）
- `voiceKey`、`streamPathId`、`source`、`bankPackage`、`votPackage`、`dummyPackage`
- `bankMode`: `"donor"` 或 `"new"`
- `saved`: 永远先是 false

纯函数，用现有 `crc32IeeeUint32` 和与 Rust 相同的字符串：

- `voiceKeyForStem(stem)`
- `streamPathIdForStem(stem)`
- `bankPackageForNewStem(stem)` = `crc32("VO_1001_P01_0_bank")` 这种
- `audioFileNameOk(name)`：文件名以合法 stem 开头。`VO_1001_P01_0.nus3audio` 和 `VO_1001_P01_0_01_ST_01.nus3audio` 都通过，stem 都是 `VO_1001_P01_0`。空格、中文、`abcd` 仍拒绝

测试放在 `soundChainModel.test.ts`：

- `VO_1001_P01_0` → `voiceKey` `0x26C008DA`，`streamPathId` `0xCE158C18`
- `VO_1001_P01_0_bank` 的 CRC 与 Rust `crc32_ieee` 一致（在 Rust 侧加一个同样的断言，避免前后端各算各的）
- `abcd`、`VO 1001`、`VO_1001_P01_0 .nus3audio`、中文文件名拒绝
- `VO_1000_P01_0` 形状通过

`SoundChainRail` 增加可选的 `draft`。有草稿时，Path / Audio / Voice bank 显示草稿里的键、`source` 和 `0x{bankPackage}`，并显示未保存。没有草稿时行为与现在相同。

Slot 页在选中草稿行时把 `draft` 传进去。不要在每次点行时重新 parse 已保存的表。

## 阶段 2：Add 选择 nus3audio

Slot 的 Add 改为文件选择器（Tauri dialog，扩展名 `nus3audio`）。

- 文件名不合法：toast，不插行。
- 合法：调用现有 `finalize_pilot_voice_resource_entry` 填 `voiceKey` 和 `streamPathId`，`dummyPackage` 用现有空行常量，追加到数组末尾并选中。
- 同 stem 已存在：选中旧行，不插第二行。
- Add 时 `bankMode` 为 `"new"`，`bankPackage` 按文件名算出，不是 0。`votPackage` 仍为 0，直到用户复制一条已有行的 `votPackage`。Save 在 `votPackage` 仍为 0 时拒绝。这次 Save 不写 `.nus3bank`。
- 选中的音频路径记在草稿里。Save 之前不复制文件。

`voiceKey`、`streamPathId` 保持只读。

## 阶段 3：新建 bank 的字节（门禁）

这一阶段默认不接 UI。先有测试证明字节合格，再把 Add 里的「新建 bank」打开。

合格的定义：

- 输入是一份 `.nus3audio` 的 cue 名列表（用现有 `read_audio_tracks` 的名字，不把波形再编码一遍）。
- 输出是一份 `.nus3bank`，其 TONE cue 名与音频 cue 名一致，顺序一致，并保留 bank 自己的那个名字项。
- 名字槽保持 donor 的宽度。不允许走会把 `0x19` 收成 `0x0C` 的写法。
- `sync_bank` 对这份 bank 和这份音频运行后，`bank_only` 和 `audio_only` 都是空的。只允许 `updated` 或 `unchanged`。
- 构造方式是克隆一条已知合格的 TONE donor 记录，按 cue 名改名字并保持槽宽。没有 donor 模板时，函数返回错误，不要写出「条数 × 空文件」。

测试用内存里的小字节，不读游戏目录。donor 布局以 `docs/exvs2-audio-voice-bgm-indexing.md` 里已经写明的 TONE 记录为准。对不上就停，不要换一种未证实的布局碰运气。

通过之前，UI 上「新建 bank」禁用。沿用 donor 的 Add 不受影响。

通过之后，草稿的 `bankBytes` 留在前端从该命令拿回的内存里。不要在 Add 时写文件。

## 阶段 4：Save 确认

Slot 的 Save 在真正调用写入之前打开确认框。

列出：

| 写入 | 路径 |
|---|---|
| `pilotvoiceresourcetable.vrtbl` | 当前 Slot 包里的那个文件 |
| `raw_path_id_release.json` 与 `.vgsht1` | 当前 Path 包。仅当草稿含有一条新的 Path 行 |
| `.nus3audio` | 由 `source` 和 dplcache 上一级拼出的绝对路径。把用户选中的文件复制过去。目标已存在则标覆盖 |
| `.nus3bank` | 仅 `bankMode == "new"` 且阶段 3 已启用。写到工作区 `091waveform/voice/pilot/{stem}/` 下的 bank 文件。目标已存在则标覆盖 |

确认框里每一行都是绝对路径加「新建」或「覆盖」。取消则一个字节都不写。

写入顺序：先复制音频，再写 vrtbl，再写 Path。任一步失败则 toast 带上已经写成的路径，不假装全部成功。Path 仍用 `build_raw_path_id_pack` 整表重建。vrtbl 仍用 `build_pilot_voice_resource_pack`。`090sound` 的另外 6 个文件原样留在目录里，这次 Save 不改它们。

写完后草稿标成已保存，黄色标记去掉，并 `invalidateSoundChainCache`。链路条改回读已保存文件。

角色表不在这个确认框里。`15010001` 仍在 Character list 里用 stem 框写入 `0x26C008DA` 再单独 Save。

## 阶段 5：Repack（本次只写接口，不实现按钮）

等阶段 4 的路径稳定后再做。这里先固定行为，避免以后把没改过的包打进去。

Save 成功后把下面的包放进现有的 `dirtyPacks`，前提是工作区里已经有它们的 structure：

- `0x8C428AF2`（`090sound`，7 个文件一起 Repack）
- `0x264D1CA7`（raw path），仅当这次写了 Path
- 角色表 `0xDFD38C70` 不由 Slot Save 标脏

新建 bank 要另有：

- 文件夹 `091waveform/voice/pilot/{stem}/`
- 一份 structure json，`HashName` 为 `0x{bankPackage}`，子文件是那个 `.nus3bank`
- 然后这个包才能出现在右上角 Repack changes 里

没有 structure 的新包不要塞进 `dirtyPacks`。右上角现有的 Repack 只打 `dirtyPacks` 里的项，不要改成打包整个 mod。

Slot 页不加「打包全部」。每个脏包仍按现有的逐个 Repack。`090sound` 和 raw path 是两个包，新 bank 是第三个。

---

## 文件

| 文件 | 阶段 |
|---|---|
| `src/page/TestEditor/components/sound-table/soundChainModel.ts` | 1 |
| `src/page/TestEditor/components/sound-table/soundChainModel.test.ts` | 1 |
| `src/page/TestEditor/components/sound-table/SoundChainRail.tsx` | 1 |
| `src/page/TestEditor/components/pilot-voice-resource/PilotVoiceResourceView.tsx` | 2、4 |
| `src-tauri/src/format/pilot_voice_bank.rs` | 3，仅在门禁测试之后 |
| `src/i18n/resources/en-US/test-lists.json` | 2、4 |
| `src/i18n/resources/zh-CN/test-lists.json` | 2、4 |

Rust 改动之后在 `src-tauri/` 跑 debug `cargo check --lib --bins`，本 crate 不能有 rustc warning。不要 `--release`，不要第二个 target 目录。前端用 Vitest 跑 `soundChainModel.test.ts`。不要启动 dev server。

## 验收（傑斯塔这条）

沿用 donor、不新建 bank 时：

1. Add 选 `VO_1001_P01_0.nus3audio`。列表底部出现这一行并被选中。
2. 链路显示 stem、Path 键、音频路径，以及算出的 `bankPackage`。`votPackage` 仍为空，直到从已有行复制。黄色未保存。
3. 从 `VO_1000_P01_0` 只复制 `votPackage`。`bankPackage` 保持 `CRC32("VO_1001_P01_0_01_ST_01_bank")`，不会被改成 donor 的 `0xA4864422`。
4. Save 确认里能看到 vrtbl、Path 两个文件、以及音频将复制到的绝对路径。覆盖已有音频时有覆盖标记。
5. 确认后工作区里的 vrtbl 含 `voiceKey` `0x26C008DA`。磁盘上的音频在派生路径。没有新的 `.fhm2d`。
6. 角色表 stem 框写入后，`15010001` 的 Pilot Presentation Hash 是 `0x26C008DA`。

新建 bank 在阶段 3 通过之前不能点。通过之后，`bankPackage` 等于 `CRC32("VO_1001_P01_0_bank")`，Save 只写出 `.nus3bank` 松散文件，仍然没有 Repack。
