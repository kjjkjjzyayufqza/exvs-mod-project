# EXVS Mod Project

Tauri v2 desktop application (Rust backend + React/TypeScript frontend) for
editing EXVS2 game assets: MSC script decompilation/recompilation, binary format
parsing, 3D model and animation editing, and packing/repacking workflows.

## Target version scope

**This project targets Over Boost (OB) and earlier EXVS2 revisions only.**

- Supported for development, research and verification: **OB** (`vsac27_Release.exe`,
  `OBHK0.3_v27`), and the earlier XB / VS2 / MBON / FB generations where they are
  relevant as historical context.
- **Out of scope: any revision later than OB.** Do not target it, do not
  research it, do not add native addresses, hashes, binary identities, corpus samples
  or field evidence sourced from it, and do not treat it as a validation reference.

Every native anchor (function address, field hash, offset, corpus value) committed to
this repository must be traceable to an in-scope binary. If a finding can only be
sourced from an out-of-scope revision, leave it unproven rather than importing it.

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
- `CONTEXT.md` — domain context and terminology.
- `docs/` — format specifications and reverse-engineering research notes.

## Recommended IDE setup

[VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
