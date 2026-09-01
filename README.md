# EXVS Mod Project

**by [kjjkjjzyayufqza](https://github.com/kjjkjjzyayufqza)**

Tauri v2 desktop application (Rust backend + React/TypeScript frontend) for
editing EXVS2 game assets: MSC script decompilation/recompilation, binary
format parsing, 3D model and animation editing, and packing/repacking
workflows.

This repository is **source-available**, not OSI open source.

| Layer | Document |
| --- | --- |
| Program source | [PolyForm Shield 1.0.0](LICENSE) |
| Author's documentation | [CC BY-NC-SA 4.0](LICENSE-DOCS.md) |
| Acceptable use | [ACCEPTABLE_USE.md](ACCEPTABLE_USE.md) |

Support: https://github.com/kjjkjjzyayufqza/exvs-mod-project

Not affiliated with Bandai Namco, Sunrise, or the Extreme Vs. publishers.

---

## English

This project is a personal research tool for **Over Boost (OB)** and **earlier**
Extreme Vs. 2 revisions only.

It must **not** be used to modify, reverse, dump, or target any later revision
that is still operated as a live arcade or online service. That includes the
currently operated title **Mobile Suit Gundam EXTREME VS.2 INFINITE BOOST**
(Japanese: 機動戦士ガンダム エクストリームバーサス2 インフィニットブースト;
short names IB / EXVS2IB / イニブ are aliases only). The ban is the whole
later-than-OB live class, including successors.

Do **not** ship a competing product (rebrand, wrap, or substitute this editor,
paid or free). Do **not** commit or redistribute game executables, dumps, or
publisher assets. Analysis of **this** tree is allowed; implementing its unique
behavior into another product is not.

Full terms: [ACCEPTABLE_USE.md](ACCEPTABLE_USE.md).

---

## 中文

本项目是个人研究工具，**仅针对 Over Boost（OB）及更早**的 Extreme Vs. 2 修订。

**禁止**用于修改、逆向、dump 或针对任何仍在营运的、晚于 OB 的街机或线上修订。包括当前营运中的
**机动战士高达 EXTREME VS.2 INFINITE BOOST**
（日文官方名：機動戦士ガンダム エクストリームバーサス2 インフィニットブースト；
简称 IB / EXVS2IB / イニブ 只是别名）。禁止的是整类「晚于 OB 且仍在营运」的修订，含后继作。

**禁止**做成竞品（改名、套壳、替代本编辑器，收费或免费）。**禁止**提交或再分发游戏 exe、dump、发行资产。
分析**本仓库**可以；把独特实现搬进另一个产品不行。

全文：[ACCEPTABLE_USE.md](ACCEPTABLE_USE.md)。

---

## 日本語

本プロジェクトは個人研究用ツールであり、対象は **Over Boost（OB）およびそれ以前**の
Extreme Vs. 2 のみです。

**OB より後で、現在も稼働中**のアーケード／オンライン版の改変・解析・ダンプ・対象化に
使ってはなりません。これには現行タイトル
**機動戦士ガンダム エクストリームバーサス2 インフィニットブースト**
（英語：Mobile Suit Gundam EXTREME VS.2 INFINITE BOOST；
通称 IB / EXVS2IB / イニブは別名にすぎません）を含みます。禁止は略称ひとつではなく、
「OB より後かつ稼働中」という区分と、その後継です。

競合製品（改名・ラップ・代替エディタ、有償・無償を問わず）の提供は禁止。
ゲームの exe、ダンプ、パブリッシャー資産の git 投入・再配布は禁止。
**本リポジトリ**の解析は可。固有実装を別製品へ移植することは不可。

全文：[ACCEPTABLE_USE.md](ACCEPTABLE_USE.md)。

---

## Development

```bash
pnpm install
pnpm start        # tauri dev
pnpm test         # vitest
pnpm build        # tsc + vite build
```

Do not start a bare `pnpm dev` server; use `pnpm start` so the Tauri shell is present.

## Documentation

- `AGENTS.md` — operating guidance for coding agents (cross-agent hub).
- `CLAUDE.md` — pointer at `AGENTS.md` for Claude-family tools.
- `ACCEPTABLE_USE.md` — use policy (this is the long legal notice).
- `CONTRIBUTING.md` — how (and how not) to work in this tree.
- `CONTEXT.md` / `CONTEXT-MAP.md` — domain terminology.
- `docs/` — format specifications and reverse-engineering research notes.

## Recommended IDE setup

[VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
